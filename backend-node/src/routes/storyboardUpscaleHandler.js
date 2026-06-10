const path = require('path');
const response = require('../response');
const { resolveStoryboardImageLocalPath } = require('./storyboardRouteHelpers');

function createStoryboardUpscaleHandler({ db, log }) {
  return async (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare(
      'SELECT id, local_path, image_url FROM storyboards WHERE id = ? AND deleted_at IS NULL'
    ).get(id);
    if (!row) return response.notFound(res, '分镜不存在');
    try {
      const loadConfig = require('../config').loadConfig;
      const cfg = loadConfig();
      const storageBase = path.isAbsolute(cfg.storage?.local_path)
        ? cfg.storage.local_path
        : path.join(process.cwd(), cfg.storage?.local_path || './data/storage');
      const localPath = resolveStoryboardImageLocalPath(db, storageBase, id, row);
      if (!localPath) return response.badRequest(res, '分镜没有本地图片，无法超分');
      const srcFile = path.join(storageBase, localPath);
      let sharp; try { sharp = require('sharp'); } catch (_) { sharp = null; }
      if (!sharp) return response.badRequest(res, 'sharp 模块不可用，无法超分');
      const info = await sharp(srcFile).metadata();
      const scale = 2;
      const newW = (info.width || 512) * scale;
      const newH = (info.height || 512) * scale;
      const ext = path.extname(localPath) || '.jpg';
      const baseName = path.basename(localPath, ext);
      const dirName = path.dirname(localPath);
      const newRelPath = path.join(dirName, baseName + '_2x' + ext).replace(/\\/g, '/');
      const newFile = path.join(storageBase, newRelPath);
      await sharp(srcFile).resize(newW, newH, { kernel: 'lanczos3' }).toFile(newFile);
      const now = new Date().toISOString();
      db.prepare('UPDATE storyboards SET local_path = ?, updated_at = ? WHERE id = ?').run(newRelPath, now, id);
      log.info('storyboard upscale done', { id, newRelPath, newW, newH });
      response.success(res, { local_path: newRelPath, width: newW, height: newH });
    } catch (err) {
      log.error('storyboards upscale', { error: err.message });
      response.internalError(res, err.message);
    }
  };
}

module.exports = { createStoryboardUpscaleHandler };
