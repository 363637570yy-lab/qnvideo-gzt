const response = require('../response');
const workflowPresetService = require('../services/workflowPresetService');

function routes(db, log) {
  return {
    list: (req, res) => {
      try {
        const activeOnly =
          req.user?.role !== 'admin' ||
          req.query.active === '1' ||
          req.query.active === 'true';
        const items = workflowPresetService.listPresets(db, {
          type: req.query.type,
          activeOnly,
        });
        response.success(res, { items });
      } catch (err) {
        log.error('workflow-presets list failed', { error: err.message });
        response.badRequest(res, err.message || '查询失败');
      }
    },
    get: (req, res) => {
      const item = workflowPresetService.getPresetById(db, req.params.id);
      if (!item) return response.notFound(res, '工作流规范不存在');
      if (req.user?.role !== 'admin' && !item.is_active) return response.notFound(res, '工作流规范不存在');
      response.success(res, { item });
    },
    create: (req, res) => {
      try {
        const item = workflowPresetService.createPreset(db, req.body || {}, req.user);
        response.created(res, { item });
      } catch (err) {
        log.error('workflow-presets create failed', { error: err.message });
        response.badRequest(res, err.message || '创建失败');
      }
    },
    update: (req, res) => {
      try {
        const item = workflowPresetService.updatePreset(db, req.params.id, req.body || {}, req.user);
        if (!item) return response.notFound(res, '工作流规范不存在');
        response.success(res, { item });
      } catch (err) {
        log.error('workflow-presets update failed', { error: err.message });
        response.badRequest(res, err.message || '保存失败');
      }
    },
    setDefault: (req, res) => {
      try {
        const item = workflowPresetService.setDefaultPreset(db, req.params.id, req.user);
        if (!item) return response.notFound(res, '工作流规范不存在');
        response.success(res, { item });
      } catch (err) {
        log.error('workflow-presets set-default failed', { error: err.message });
        response.badRequest(res, err.message || '设置失败');
      }
    },
    delete: (req, res) => {
      try {
        const ok = workflowPresetService.deletePreset(db, req.params.id);
        if (!ok) return response.notFound(res, '工作流规范不存在');
        response.success(res, { message: '已删除' });
      } catch (err) {
        log.error('workflow-presets delete failed', { error: err.message });
        response.badRequest(res, err.message || '删除失败');
      }
    },
  };
}

module.exports = routes;
