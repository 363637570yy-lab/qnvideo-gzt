const response = require('../response');
const sceneLibraryService = require('../services/sceneLibraryService');

function routes(db, cfg, log) {
  return {
    list: (req, res) => {
      try {
        const query = { page: req.query.page, page_size: req.query.page_size, drama_id: req.query.drama_id, global: req.query.global, category: req.query.category, source_type: req.query.source_type, source_id: req.query.source_id, source_ids: req.query.source_ids, keyword: req.query.keyword, owner: req.query.owner, created_by_user_id: req.query.created_by_user_id, user: req.user };
        const { items, total, page, pageSize } = sceneLibraryService.listLibraryItems(db, query);
        response.successWithPagination(res, items, total, page, pageSize);
      } catch (err) {
        log.error('scene-library list', { error: err.message });
        response.internalError(res, err.message);
      }
    },
    create: (req, res) => {
      try {
        const item = sceneLibraryService.createLibraryItem(db, log, { ...(req.body || {}), user: req.user });
        response.created(res, item);
      } catch (err) {
        log.error('scene-library create', { error: err.message });
        response.internalError(res, err.message);
      }
    },
    get: (req, res) => {
      try {
        const item = sceneLibraryService.getLibraryItem(db, req.params.id, req.user);
        if (!item) return response.notFound(res, '场景库项不存在');
        response.success(res, item);
      } catch (err) {
        log.error('scene-library get', { error: err.message });
        response.internalError(res, err.message);
      }
    },
    update: (req, res) => {
      try {
        const item = sceneLibraryService.updateLibraryItem(db, log, req.params.id, { ...(req.body || {}), user: req.user });
        if (!item) return response.notFound(res, '场景库项不存在');
        if (item.forbidden) return response.forbidden(res, '只能编辑自己创建的素材');
        response.success(res, item);
      } catch (err) {
        log.error('scene-library update', { error: err.message });
        response.internalError(res, err.message);
      }
    },
    delete: (req, res) => {
      try {
        const ok = sceneLibraryService.deleteLibraryItem(db, log, req.params.id, req.user);
        if (!ok) return response.notFound(res, '场景库项不存在');
        if (ok.forbidden) return response.forbidden(res, '只能删除自己创建的素材');
        response.success(res, { message: '删除成功' });
      } catch (err) {
        log.error('scene-library delete', { error: err.message });
        response.internalError(res, err.message);
      }
    },
  };
}

module.exports = routes;
