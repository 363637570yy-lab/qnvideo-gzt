const response = require('../response');
const assetService = require('../services/assetService');

function routes(db, log) {
  return {
    list: (req, res) => {
      try {
        const query = { ...req.query, user: req.user };
        const { items, total, page, pageSize } = assetService.list(db, query);
        response.successWithPagination(res, items, total, page, pageSize);
      } catch (err) {
        log.error('assets list', { error: err.message });
        response.internalError(res, err.message);
      }
    },
    create: (req, res) => {
      try {
        const item = assetService.create(db, log, { ...(req.body || {}), user: req.user });
        response.created(res, item);
      } catch (err) {
        log.error('assets create', { error: err.message });
        response.internalError(res, err.message);
      }
    },
    get: (req, res) => {
      try {
        const item = assetService.getById(db, req.params.id, req.user);
        if (!item) return response.notFound(res, '资源不存在');
        response.success(res, item);
      } catch (err) {
        log.error('assets get', { error: err.message });
        response.internalError(res, err.message);
      }
    },
    update: (req, res) => {
      try {
        const item = assetService.update(db, log, req.params.id, { ...(req.body || {}), user: req.user });
        if (!item) return response.notFound(res, '资源不存在');
        if (item.forbidden) return response.forbidden(res, '只能编辑自己创建的素材');
        response.success(res, item);
      } catch (err) {
        log.error('assets update', { error: err.message });
        response.internalError(res, err.message);
      }
    },
    delete: (req, res) => {
      try {
        const ok = assetService.deleteById(db, log, req.params.id, req.user);
        if (!ok) return response.notFound(res, '资源不存在');
        if (ok.forbidden) return response.forbidden(res, '只能删除自己创建的素材');
        response.success(res, { message: '删除成功' });
      } catch (err) {
        log.error('assets delete', { error: err.message });
        response.internalError(res, err.message);
      }
    },
    importImage: (req, res) => {
      try {
        const item = assetService.importFromImage(db, log, req.params.image_gen_id, req.user);
        if (!item) return response.notFound(res, '图片生成记录不存在');
        response.created(res, item);
      } catch (err) {
        log.error('assets import image', { error: err.message });
        response.internalError(res, err.message);
      }
    },
    importVideo: (req, res) => {
      try {
        const item = assetService.importFromVideo(db, log, req.params.video_gen_id, req.user);
        if (!item) return response.notFound(res, '视频生成记录不存在');
        response.created(res, item);
      } catch (err) {
        log.error('assets import video', { error: err.message });
        response.internalError(res, err.message);
      }
    },
  };
}

module.exports = routes;
