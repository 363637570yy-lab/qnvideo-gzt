const taskService = require('../services/taskService');
const response = require('../response');

function getTaskStatus(db, log) {
  return (req, res) => {
    const task = taskService.getTask(db, req.params.task_id);
    if (!task) return response.notFound(res, '任务不存在');
    if (!taskService.canUserSeeTask(db, task, req.user)) {
      return response.forbidden(res, '只能访问自己账号下的视频项目');
    }
    response.success(res, { ...task, diagnostics: taskService.getTaskDiagnostics(db, task.id) });
  };
}

function getResourceTasks(db, log) {
  return (req, res) => {
    const resourceId = req.query.resource_id;
    const resourceIds = req.query.resource_ids;
    if (!resourceId && !resourceIds) return response.badRequest(res, '缺少resource_id参数');
    const filters = {
      type: req.query.type || req.query.task_type,
      types: req.query.types,
      drama_id: req.query.drama_id,
      episode_id: req.query.episode_id,
      user: req.user,
    };
    try {
      const tasks = resourceIds
        ? taskService.getTasksByResources(
          db,
          String(resourceIds).split(',').map((id) => id.trim()).filter(Boolean),
          filters
        )
        : taskService.getTasksByResource(db, resourceId, filters);
      response.success(res, tasks);
    } catch (err) {
      log.error('Get resource tasks failed', { error: err.message });
      response.internalError(res, err.message);
    }
  };
}

function cancelTask(db, log) {
  return (req, res) => {
    try {
      const existing = taskService.getTask(db, req.params.task_id);
      if (!existing) return response.notFound(res, '任务不存在');
      if (!taskService.canUserSeeTask(db, existing, req.user)) {
        return response.forbidden(res, '只能访问自己账号下的视频项目');
      }
      const task = taskService.cancelTask(db, req.params.task_id, req.body?.message || '任务已停止');
      response.success(res, task);
    } catch (err) {
      log.error('Cancel task failed', { task_id: req.params.task_id, error: err.message });
      response.internalError(res, err.message);
    }
  };
}

function deleteTask(db, log) {
  return (req, res) => {
    try {
      const existing = taskService.getTask(db, req.params.task_id);
      if (!existing) return response.notFound(res, '任务不存在');
      if (!taskService.canUserSeeTask(db, existing, req.user)) {
        return response.forbidden(res, '只能访问自己账号下的视频项目');
      }
      const result = taskService.deleteTask(db, log, req.params.task_id);
      response.success(res, { message: '删除成功', ...result });
    } catch (err) {
      log.error('Delete task failed', { task_id: req.params.task_id, error: err.message });
      response.internalError(res, err.message);
    }
  };
}

module.exports = function taskRoutes(db, log) {
  return {
    getTaskStatus: getTaskStatus(db, log),
    getResourceTasks: getResourceTasks(db, log),
    cancelTask: cancelTask(db, log),
    deleteTask: deleteTask(db, log),
  };
};
