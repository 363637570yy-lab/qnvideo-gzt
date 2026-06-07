const response = require('../response');
const identityService = require('../services/identityService');

function extractBearer(req) {
  const raw = req.headers.authorization || '';
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function requireAuth(log) {
  return async (req, res, next) => {
    if (!identityService.authEnabled()) return next();
    try {
      const user = await identityService.verifyToken(extractBearer(req), log);
      if (!user) return response.unauthorized(res, '请先登录');
      req.user = user;
      next();
    } catch (err) {
      log?.error?.('auth middleware failed', { error: err.message });
      response.error(res, 503, 'AUTH_UNAVAILABLE', '账号服务不可用，请检查 PostgreSQL 连接');
    }
  };
}

function requireAdmin() {
  return (req, res, next) => {
    if (!identityService.authEnabled()) return next();
    if (req.user?.role === 'admin') return next();
    return response.forbidden(res, '只有管理员可以访问该功能');
  };
}

function pathNumber(path, regex) {
  const m = path.match(regex);
  return m ? Number(m[1]) : null;
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function pushResolved(ids, value) {
  const n = finiteNumber(value);
  if (n) ids.push(n);
}

function parseIds(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return String(value).split(',');
}

function selectDramaId(db, sql, id) {
  const n = finiteNumber(id);
  if (!n) return null;
  return db.prepare(sql).get(n)?.drama_id || null;
}

function resolveEpisodeDramaId(db, id) {
  return selectDramaId(db, 'SELECT drama_id FROM episodes WHERE id = ? AND deleted_at IS NULL', id);
}

function resolveSceneDramaId(db, id) {
  return selectDramaId(db, 'SELECT drama_id FROM scenes WHERE id = ? AND deleted_at IS NULL', id);
}

function resolveStoryboardDramaId(db, id) {
  return selectDramaId(
    db,
    `SELECT e.drama_id
     FROM storyboards s
     INNER JOIN episodes e ON e.id = s.episode_id
     WHERE s.id = ? AND s.deleted_at IS NULL AND e.deleted_at IS NULL`,
    id
  );
}

function resolveImageDramaId(db, id) {
  return selectDramaId(db, 'SELECT drama_id FROM image_generations WHERE id = ? AND deleted_at IS NULL', id);
}

function resolveVideoDramaId(db, id) {
  return selectDramaId(db, 'SELECT drama_id FROM video_generations WHERE id = ? AND deleted_at IS NULL', id);
}

function resolveAssetDramaId(db, id) {
  return selectDramaId(db, 'SELECT drama_id FROM assets WHERE id = ? AND deleted_at IS NULL', id);
}

function lookupDramaIds(db, req) {
  const p = req.path || '';
  const body = req.body || {};
  const query = req.query || {};
  const ids = [];
  pushResolved(ids, body.drama_id);
  pushResolved(ids, query.drama_id);
  pushResolved(ids, resolveEpisodeDramaId(db, body.episode_id || query.episode_id));
  pushResolved(ids, resolveStoryboardDramaId(db, body.storyboard_id || query.storyboard_id));
  pushResolved(ids, resolveImageDramaId(db, body.image_gen_id || query.image_gen_id));
  pushResolved(ids, resolveVideoDramaId(db, body.video_gen_id || query.video_gen_id));
  pushResolved(ids, resolveAssetDramaId(db, body.asset_id || query.asset_id || body.resource_id || query.resource_id));
  for (const id of parseIds(body.storyboard_ids || query.storyboard_ids)) {
    pushResolved(ids, resolveStoryboardDramaId(db, id));
  }

  const directDrama = pathNumber(p, /^\/dramas\/(\d+)(?:\/|$)/);
  pushResolved(ids, directDrama);

  const episodeId = pathNumber(p, /^\/episodes\/(\d+)(?:\/|$)/) || pathNumber(p, /^\/images\/episode\/(\d+)(?:\/|$)/) || pathNumber(p, /^\/videos\/episode\/(\d+)(?:\/|$)/);
  pushResolved(ids, resolveEpisodeDramaId(db, episodeId));

  const sceneId = pathNumber(p, /^\/scenes\/(\d+)(?:\/|$)/) || pathNumber(p, /^\/images\/scene\/(\d+)(?:\/|$)/);
  pushResolved(ids, resolveSceneDramaId(db, sceneId));

  const characterId = pathNumber(p, /^\/characters\/(\d+)(?:\/|$)/);
  if (characterId) {
    pushResolved(ids, selectDramaId(db, 'SELECT drama_id FROM characters WHERE id = ? AND deleted_at IS NULL', characterId));
  }

  const propId = pathNumber(p, /^\/props\/(\d+)(?:\/|$)/);
  if (propId) {
    pushResolved(ids, selectDramaId(db, 'SELECT drama_id FROM props WHERE id = ? AND deleted_at IS NULL', propId));
  }

  const storyboardId = pathNumber(p, /^\/storyboards\/(\d+)(?:\/|$)/);
  pushResolved(ids, resolveStoryboardDramaId(db, storyboardId));

  const imageId = pathNumber(p, /^\/images\/(\d+)(?:\/|$)/) || pathNumber(p, /^\/assets\/import\/image\/(\d+)(?:\/|$)/);
  pushResolved(ids, resolveImageDramaId(db, imageId));

  const videoFromImageId = pathNumber(p, /^\/videos\/image\/(\d+)(?:\/|$)/);
  pushResolved(ids, resolveImageDramaId(db, videoFromImageId));

  const videoId = pathNumber(p, /^\/videos\/(\d+)(?:\/|$)/) || pathNumber(p, /^\/assets\/import\/video\/(\d+)(?:\/|$)/);
  pushResolved(ids, resolveVideoDramaId(db, videoId));

  const mergeId = pathNumber(p, /^\/video-merges\/(\d+)(?:\/|$)/);
  if (mergeId) {
    pushResolved(ids, selectDramaId(db, 'SELECT drama_id FROM video_merges WHERE id = ? AND deleted_at IS NULL', mergeId));
  }

  const assetId = pathNumber(p, /^\/assets\/(\d+)(?:\/|$)/);
  pushResolved(ids, resolveAssetDramaId(db, assetId));

  return Array.from(new Set(ids));
}

function canAccessDrama(db, user, dramaId) {
  if (!dramaId || !Number.isFinite(Number(dramaId))) return true;
  if (user?.role === 'admin') return true;
  const row = db.prepare('SELECT owner_user_id FROM dramas WHERE id = ? AND deleted_at IS NULL').get(Number(dramaId));
  if (!row) return false;
  return row.owner_user_id && String(row.owner_user_id) === String(user.id);
}

function authorizeProjectAccess(db, log) {
  return (req, res, next) => {
    if (!identityService.authEnabled()) return next();
    if (req.user?.role === 'admin') return next();
    try {
      const dramaIds = lookupDramaIds(db, req);
      if (!dramaIds.length) return next();
      if (dramaIds.every((dramaId) => canAccessDrama(db, req.user, dramaId))) return next();
      return response.forbidden(res, '只能访问自己账号下的视频项目');
    } catch (err) {
      log?.warn?.('project access check failed', { path: req.path, error: err.message });
      return response.forbidden(res, '项目权限检查失败');
    }
  };
}

module.exports = {
  requireAuth,
  requireAdmin,
  authorizeProjectAccess,
  canAccessDrama,
};
