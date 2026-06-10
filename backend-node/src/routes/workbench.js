const response = require('../response');
const workbenchService = require('../services/workbenchService');

function summary(db, log) {
  return (req, res) => {
    try {
      const result = workbenchService.getWorkbenchSummary(db, req.params.drama_id, {
        episode_id: req.query.episode_id,
      });
      if (!result) return response.notFound(res, '项目不存在');
      response.success(res, result);
    } catch (err) {
      log.error('workbench summary failed', { drama_id: req.params.drama_id, error: err.message });
      response.internalError(res, err.message || '读取制作工作台摘要失败');
    }
  };
}

function scriptTab(db, log) {
  return (req, res) => {
    try {
      const result = workbenchService.getScriptTab(db, req.params.drama_id);
      if (!result) return response.notFound(res, '项目不存在');
      response.success(res, result);
    } catch (err) {
      log.error('workbench script tab failed', { drama_id: req.params.drama_id, error: err.message });
      response.internalError(res, err.message || '读取剧本工作台失败');
    }
  };
}

function assetsTab(db, log) {
  return (req, res) => {
    try {
      const result = workbenchService.getAssetTab(db, req.params.drama_id, {
        type: req.query.type,
        episode_id: req.query.episode_id,
      });
      if (!result) return response.notFound(res, '项目不存在');
      response.success(res, result);
    } catch (err) {
      log.error('workbench assets tab failed', { drama_id: req.params.drama_id, type: req.query.type, error: err.message });
      if (err.statusCode === 400) return response.badRequest(res, err.message);
      response.internalError(res, err.message || '读取资产工作台失败');
    }
  };
}

function storyboardsTab(db, log) {
  return (req, res) => {
    try {
      const result = workbenchService.getStoryboardsTab(db, req.params.drama_id, {
        episode_id: req.query.episode_id,
      });
      if (!result) return response.notFound(res, '项目不存在');
      response.success(res, result);
    } catch (err) {
      log.error('workbench storyboards tab failed', {
        drama_id: req.params.drama_id,
        episode_id: req.query.episode_id,
        error: err.message,
      });
      if (err.statusCode === 404) return response.notFound(res, err.message);
      response.internalError(res, err.message || '读取分镜工作台失败');
    }
  };
}

function videoComposeTab(db, log) {
  return (req, res) => {
    try {
      const result = workbenchService.getVideoComposeTab(db, req.params.drama_id, {
        episode_id: req.query.episode_id,
      });
      if (!result) return response.notFound(res, '项目不存在');
      response.success(res, result);
    } catch (err) {
      log.error('workbench video compose tab failed', {
        drama_id: req.params.drama_id,
        episode_id: req.query.episode_id,
        error: err.message,
      });
      if (err.statusCode === 404) return response.notFound(res, err.message);
      response.internalError(res, err.message || '读取视频合成工作台失败');
    }
  };
}

module.exports = function workbenchRoutes(db, log) {
  return {
    summary: summary(db, log),
    scriptTab: scriptTab(db, log),
    assetsTab: assetsTab(db, log),
    storyboardsTab: storyboardsTab(db, log),
    videoComposeTab: videoComposeTab(db, log),
  };
};
