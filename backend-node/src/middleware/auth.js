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

function lookupDramaId(db, req) {
  const p = req.path || '';
  const body = req.body || {};
  const query = req.query || {};
  if (body.drama_id) return Number(body.drama_id);
  if (query.drama_id) return Number(query.drama_id);

  const directDrama = pathNumber(p, /^\/dramas\/(\d+)(?:\/|$)/);
  if (directDrama) return directDrama;

  const episodeId = pathNumber(p, /^\/episodes\/(\d+)(?:\/|$)/) || pathNumber(p, /^\/images\/episode\/(\d+)(?:\/|$)/) || pathNumber(p, /^\/videos\/episode\/(\d+)(?:\/|$)/);
  if (episodeId) {
    return db.prepare('SELECT drama_id FROM episodes WHERE id = ? AND deleted_at IS NULL').get(episodeId)?.drama_id || null;
  }

  const sceneId = pathNumber(p, /^\/scenes\/(\d+)(?:\/|$)/) || pathNumber(p, /^\/images\/scene\/(\d+)(?:\/|$)/);
  if (sceneId) {
    return db.prepare('SELECT drama_id FROM scenes WHERE id = ? AND deleted_at IS NULL').get(sceneId)?.drama_id || null;
  }

  const characterId = pathNumber(p, /^\/characters\/(\d+)(?:\/|$)/);
  if (characterId) {
    return db.prepare('SELECT drama_id FROM characters WHERE id = ? AND deleted_at IS NULL').get(characterId)?.drama_id || null;
  }

  const propId = pathNumber(p, /^\/props\/(\d+)(?:\/|$)/);
  if (propId) {
    return db.prepare('SELECT drama_id FROM props WHERE id = ? AND deleted_at IS NULL').get(propId)?.drama_id || null;
  }

  const storyboardId = pathNumber(p, /^\/storyboards\/(\d+)(?:\/|$)/);
  if (storyboardId) {
    return db.prepare(
      `SELECT e.drama_id
       FROM storyboards s
       INNER JOIN episodes e ON e.id = s.episode_id
       WHERE s.id = ? AND s.deleted_at IS NULL AND e.deleted_at IS NULL`
    ).get(storyboardId)?.drama_id || null;
  }

  const imageId = pathNumber(p, /^\/images\/(\d+)(?:\/|$)/);
  if (imageId) {
    return db.prepare('SELECT drama_id FROM image_generations WHERE id = ? AND deleted_at IS NULL').get(imageId)?.drama_id || null;
  }

  const videoFromImageId = pathNumber(p, /^\/videos\/image\/(\d+)(?:\/|$)/);
  if (videoFromImageId) {
    return db.prepare('SELECT drama_id FROM image_generations WHERE id = ? AND deleted_at IS NULL').get(videoFromImageId)?.drama_id || null;
  }

  const videoId = pathNumber(p, /^\/videos\/(\d+)(?:\/|$)/);
  if (videoId) {
    return db.prepare('SELECT drama_id FROM video_generations WHERE id = ? AND deleted_at IS NULL').get(videoId)?.drama_id || null;
  }

  const mergeId = pathNumber(p, /^\/video-merges\/(\d+)(?:\/|$)/);
  if (mergeId) {
    return db.prepare('SELECT drama_id FROM video_merges WHERE id = ? AND deleted_at IS NULL').get(mergeId)?.drama_id || null;
  }

  const assetId = pathNumber(p, /^\/assets\/(\d+)(?:\/|$)/);
  if (assetId) {
    return db.prepare('SELECT drama_id FROM assets WHERE id = ? AND deleted_at IS NULL').get(assetId)?.drama_id || null;
  }

  return null;
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
      const dramaId = lookupDramaId(db, req);
      if (!dramaId) return next();
      if (canAccessDrama(db, req.user, dramaId)) return next();
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
