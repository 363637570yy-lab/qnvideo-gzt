const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { getDb } = require('./db/index.js');
const { loadConfig } = require('./config/index.js');
const logger = require('./logger.js');
const { setupRouter } = require('./routes/index.js');

function createApp() {
  const config = loadConfig();
  const db = getDb(config.database);
  const { runMigrationsAndEnsure } = require('./db/migrate.js');
  runMigrationsAndEnsure(db, { log: logger });
  const identityService = require('./services/identityService');
  identityService.ensureIdentityDb(logger)
    .then(({ admin }) => identityService.assignUnownedDramasToAdmin(db, logger, admin?.id))
    .catch((err) => logger.error('Identity service initialization failed', { error: err.message }));

  // 厂商锁定模式：在迁移完成后同步 vendor_lock 配置
  const { applyVendorLock } = require('./services/aiConfigService');
  applyVendorLock(db, logger, config);
  const log = logger;

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use(
    cors({
      origin: config.server.cors_origins && config.server.cors_origins.length
        ? config.server.cors_origins
        : '*',
    })
  );

  app.use((req, res, next) => {
    log.info(req.method, req.path);
    next();
  });

  // 静态资源目录：统一转为绝对路径（打包 exe 下相对路径可能解析异常）
  const storageRoot = config.storage?.local_path
    ? (path.isAbsolute(config.storage.local_path)
        ? config.storage.local_path
        : path.join(process.cwd(), config.storage.local_path))
    : path.join(process.cwd(), 'data', 'storage');
  try {
    if (!fs.existsSync(storageRoot)) fs.mkdirSync(storageRoot, { recursive: true });
    app.get('/static-thumb/:width/*', async (req, res, next) => {
      const width = Math.max(64, Math.min(960, Number(req.params.width) || 320));
      const relRaw = String(req.params[0] || '').replace(/\\/g, '/').replace(/^\/+/, '');
      const rel = relRaw.split('/').filter(Boolean).join('/');
      if (!rel || rel.startsWith('_thumbs/')) return res.status(404).end();

      const sourcePath = path.resolve(storageRoot, rel);
      const storageResolved = path.resolve(storageRoot);
      if (!sourcePath.startsWith(storageResolved + path.sep) && sourcePath !== storageResolved) {
        return res.status(400).end();
      }
      if (!fs.existsSync(sourcePath)) return res.status(404).end();

      const cachePath = path.resolve(storageRoot, '_thumbs', `w${width}`, rel + '.webp');
      if (!cachePath.startsWith(path.resolve(storageRoot, '_thumbs') + path.sep)) {
        return res.status(400).end();
      }

      try {
        const srcStat = fs.statSync(sourcePath);
        const cacheStat = fs.existsSync(cachePath) ? fs.statSync(cachePath) : null;
        if (!cacheStat || cacheStat.mtimeMs < srcStat.mtimeMs) {
          const sharp = require('sharp');
          fs.mkdirSync(path.dirname(cachePath), { recursive: true });
          await sharp(sourcePath, { failOn: 'none' })
            .rotate()
            .resize({ width, withoutEnlargement: true })
            .webp({ quality: 78, effort: 4 })
            .toFile(cachePath);
        }
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.type('image/webp');
        return res.sendFile(cachePath);
      } catch (e) {
        log.warn('Static thumbnail generation failed, fallback to source', { path: rel, width, error: e.message });
        return res.sendFile(sourcePath);
      }
    });
    app.use('/static', express.static(storageRoot));
  } catch (e) {
    console.warn('Static storage mount skipped:', e.message);
  }

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      app: config.app.name,
      version: config.app.version,
    });
  });

  app.use('/api/v1', setupRouter(config, db, log));

  // 前端静态资源（sxy：web/dist）；Electron 打包时可设 WEB_DIST_PATH
  const webDist = process.env.WEB_DIST_PATH || path.join(process.cwd(), '..', 'frontweb', 'dist');
  console.log('webDist', webDist);
  if (fs.existsSync(webDist)) {
    app.use('/assets', express.static(path.join(webDist, 'assets')));
    // 服务 dist 根目录的静态文件（如 favicon.ico 等）
    app.use(express.static(webDist, { index: false }));
    app.get('/favicon.ico', (req, res) => {
      const fav = path.join(webDist, 'favicon.ico');
      if (fs.existsSync(fav)) res.sendFile(fav);
      else res.status(404).end();
    });
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      const indexHtml = path.join(webDist, 'index.html');
      if (fs.existsSync(indexHtml)) res.sendFile(indexHtml);
      else next();
    });
  } else {
    app.get('/', (req, res) => {
      res.send(
        '<!DOCTYPE html><html><head><meta charset="utf-8"><title>芊柠AI视频工作台</title></head><body>' +
          '<h1>芊柠AI视频工作台 API</h1><p>后端已启动。请先构建前端：</p>' +
          '<pre>cd web &amp;&amp; pnpm install &amp;&amp; pnpm build</pre>' +
          '<p>然后将 <code>web/dist</code> 放到与 backend-node 同级的 <code>web/dist</code>，或访问 <a href="/health">/health</a> 检查接口。</p></body></html>'
      );
    });
  }

  app.use((req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.status(404).send('Not Found');
  });

  app.use((err, req, res, next) => {
    log.errorw('Unhandled error', { error: err.message, path: req.path });
    if (!res.headersSent) {
      const isFileTooLarge = err.code === 'LIMIT_FILE_SIZE' || (err.message && err.message.includes('File too large'));
      const status = isFileTooLarge ? 413 : 500;
      const message = isFileTooLarge ? '图片大小不能超过 16MB，请压缩后重试' : (err.message || '服务器错误');
      res.status(status).json({ success: false, error: { code: isFileTooLarge ? 'FILE_TOO_LARGE' : 'INTERNAL_ERROR', message }, timestamp: new Date().toISOString() });
    }
  });

  return { app, config, db };
}

module.exports = { createApp };
