const taskService = require('../services/taskService');
const response = require('../response');

function getTaskStatus(db, log) {
  return (req, res) => {
    const task = taskService.getTask(db, req.params.task_id);
    if (!task) return response.notFound(res, '任务不存在');
    response.success(res, task);
  };
}

function getResourceTasks(db, log) {
  return (req, res) => {
    const resourceId = req.query.resource_id;
    const resourceIds = req.query.resource_ids;
    if (!resourceId && !resourceIds) return response.badRequest(res, '缺少resource_id参数');
    try {
      const tasks = resourceIds
        ? taskService.getTasksByResources(
          db,
          String(resourceIds).split(',').map((id) => id.trim()).filter(Boolean)
        )
        : taskService.getTasksByResource(db, resourceId);
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
      const task = taskService.cancelTask(db, req.params.task_id, req.body?.message || '任务已停止');
      if (!task) return response.notFound(res, '任务不存在');
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
      const result = taskService.deleteTask(db, log, req.params.task_id);
      if (!result) return response.notFound(res, '任务不存在');
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
