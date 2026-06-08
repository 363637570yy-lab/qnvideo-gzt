const { v4: uuidv4 } = require('uuid');

function normalizeUserId(value) {
  return value != null && String(value).trim() ? String(value).trim() : null;
}

function ownerForDrama(db, dramaId) {
  const n = parsePositiveInt(dramaId);
  if (!n) return null;
  return getOneSafe(db, 'SELECT owner_user_id FROM dramas WHERE id = ? AND deleted_at IS NULL', n)?.owner_user_id || null;
}

function inferTaskContext(db, taskType, resourceId, context = {}) {
  const type = String(taskType || '');
  const resource = String(resourceId || '').trim();
  const ctx = context && typeof context === 'object' ? context : {};
  const contextResourceType = String(ctx.resource_type || '').trim().toLowerCase();
  let dramaId = parsePositiveInt(ctx.drama_id);
  let episodeId = parsePositiveInt(ctx.episode_id);
  const storyboardId = parsePositiveInt(ctx.storyboard_id);

  if (!episodeId && storyboardId) {
    episodeId = getOneSafe(db, 'SELECT episode_id FROM storyboards WHERE id = ? AND deleted_at IS NULL', storyboardId)?.episode_id || null;
  }
  if (!dramaId && episodeId) {
    dramaId = getOneSafe(db, 'SELECT drama_id FROM episodes WHERE id = ? AND deleted_at IS NULL', episodeId)?.drama_id || null;
  }

  if (!dramaId) {
    if (type === 'prop_image_generation') {
      const row = getOneSafe(db, 'SELECT drama_id, episode_id FROM props WHERE id = ? AND deleted_at IS NULL', resource);
      dramaId = row?.drama_id || null;
      episodeId = episodeId || row?.episode_id || null;
    } else if (type === 'prop_extraction' || type === 'background_extraction' || type === 'storyboard_generation' || type === 'video_merge' || type === 'character_extraction') {
      episodeId = episodeId || parsePositiveInt(resource);
      dramaId = getOneSafe(db, 'SELECT drama_id FROM episodes WHERE id = ? AND deleted_at IS NULL', episodeId)?.drama_id || null;
    } else if (type === 'image_generation' && contextResourceType === 'scene') {
      dramaId = getOneSafe(db, 'SELECT drama_id FROM scenes WHERE id = ? AND deleted_at IS NULL', resource)?.drama_id || null;
    } else if (type === 'image_generation' && contextResourceType === 'character') {
      dramaId = getOneSafe(db, 'SELECT drama_id FROM characters WHERE id = ? AND deleted_at IS NULL', resource)?.drama_id || null;
    } else if (type === 'image_generation' || type === 'character_generation') {
      dramaId = parsePositiveInt(resource);
    } else if (type === 'video_generation') {
      dramaId = parsePositiveInt(resource);
      if (!dramaId) {
        dramaId = getOneSafe(db, 'SELECT drama_id FROM image_generations WHERE id = ? AND deleted_at IS NULL', resource)?.drama_id || null;
      }
    } else if (type === 'frame_prompt_generation') {
      const row = getOneSafe(
        db,
        `SELECT e.id AS episode_id, e.drama_id
         FROM storyboards s
         INNER JOIN episodes e ON e.id = s.episode_id AND e.deleted_at IS NULL
         WHERE s.id = ? AND s.deleted_at IS NULL`,
        resource
      );
      dramaId = row?.drama_id || null;
      episodeId = episodeId || row?.episode_id || null;
    }
  }

  if (!dramaId && /^scene_(\d+)$/i.test(resource)) {
    const id = Number(resource.match(/^scene_(\d+)$/i)[1]);
    dramaId = getOneSafe(db, 'SELECT drama_id FROM scenes WHERE id = ? AND deleted_at IS NULL', id)?.drama_id || null;
  }
  if (!dramaId && /^character_(\d+)$/i.test(resource)) {
    const id = Number(resource.match(/^character_(\d+)$/i)[1]);
    dramaId = getOneSafe(db, 'SELECT drama_id FROM characters WHERE id = ? AND deleted_at IS NULL', id)?.drama_id || null;
  }

  const ownerUserId = normalizeUserId(ctx.owner_user_id) || ownerForDrama(db, dramaId);
  const operatorUserId = normalizeUserId(ctx.operator_user_id) || normalizeUserId(ctx.user?.id);
  return {
    drama_id: parsePositiveInt(dramaId),
    episode_id: parsePositiveInt(episodeId),
    resource_type: ctx.resource_type || type || null,
    owner_user_id: ownerUserId,
    operator_user_id: operatorUserId,
  };
}

function createTask(db, log, taskType, resourceId, context = {}) {
  const id = uuidv4();
  const now = new Date().toISOString();
  const ctx = inferTaskContext(db, taskType, resourceId, context);
  db.prepare(
    `INSERT INTO async_tasks (id, type, status, progress, message, drama_id, episode_id, resource_type, resource_id, owner_user_id, operator_user_id, created_at, updated_at)
     VALUES (?, ?, 'pending', 0, '', ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    taskType,
    ctx.drama_id,
    ctx.episode_id,
    ctx.resource_type,
    resourceId || '',
    ctx.owner_user_id,
    ctx.operator_user_id,
    now,
    now
  );
  log.info('Task created', { task_id: id, type: taskType, resource_id: resourceId, drama_id: ctx.drama_id, episode_id: ctx.episode_id, owner_user_id: ctx.owner_user_id, operator_user_id: ctx.operator_user_id });
  const task = getTask(db, id);
  return task || { id, type: taskType, status: 'pending', progress: 0, message: '', ...ctx, resource_id: resourceId || '', created_at: now, updated_at: now, completed_at: null };
}

function getTask(db, taskId) {
  const row = db.prepare('SELECT * FROM async_tasks WHERE id = ? AND deleted_at IS NULL').get(taskId);
  if (!row) return null;
  return rowToTask(row);
}

function taskTypesFromFilter(filters = {}) {
  const raw = filters.types || filters.type || filters.task_type || '';
  return [...new Set(String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean))];
}

function parsePositiveInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function pushUnique(list, value) {
  const n = parsePositiveInt(value);
  if (n && !list.includes(n)) list.push(n);
}

function getOneSafe(db, sql, ...params) {
  try {
    return db.prepare(sql).get(...params) || null;
  } catch (_) {
    return null;
  }
}

function getAllSafe(db, sql, ...params) {
  try {
    return db.prepare(sql).all(...params) || [];
  } catch (_) {
    return [];
  }
}

function resolveTaskDramaIds(db, task) {
  const ids = [];
  const type = String(task?.type || '');
  const resourceId = String(task?.resource_id || '').trim();
  pushUnique(ids, task?.drama_id);

  for (const row of getAllSafe(db, 'SELECT drama_id FROM image_generations WHERE task_id = ? AND deleted_at IS NULL', task.id)) {
    pushUnique(ids, row.drama_id);
  }
  for (const row of getAllSafe(db, 'SELECT drama_id FROM video_generations WHERE task_id = ? AND deleted_at IS NULL', task.id)) {
    pushUnique(ids, row.drama_id);
  }
  for (const row of getAllSafe(db, 'SELECT drama_id FROM video_merges WHERE task_id = ? AND deleted_at IS NULL', task.id)) {
    pushUnique(ids, row.drama_id);
  }
  if (ids.length > 0) return ids;

  if (type === 'prop_image_generation') {
    pushUnique(ids, getOneSafe(db, 'SELECT drama_id FROM props WHERE id = ? AND deleted_at IS NULL', resourceId)?.drama_id);
  } else if (type === 'prop_extraction' || type === 'background_extraction' || type === 'storyboard_generation' || type === 'video_merge' || type === 'character_extraction') {
    pushUnique(ids, getOneSafe(db, 'SELECT drama_id FROM episodes WHERE id = ? AND deleted_at IS NULL', resourceId)?.drama_id);
  } else if (type === 'image_generation' || type === 'character_generation' || type === 'video_generation') {
    pushUnique(ids, getOneSafe(db, 'SELECT id FROM dramas WHERE id = ? AND deleted_at IS NULL', resourceId)?.id);
    if (type === 'video_generation') {
      pushUnique(ids, getOneSafe(db, 'SELECT drama_id FROM image_generations WHERE id = ? AND deleted_at IS NULL', resourceId)?.drama_id);
    }
  }

  if (/^scene_(\d+)$/i.test(resourceId)) {
    const id = Number(resourceId.match(/^scene_(\d+)$/i)[1]);
    pushUnique(ids, getOneSafe(db, 'SELECT drama_id FROM scenes WHERE id = ? AND deleted_at IS NULL', id)?.drama_id);
  }
  if (/^character_(\d+)$/i.test(resourceId)) {
    const id = Number(resourceId.match(/^character_(\d+)$/i)[1]);
    pushUnique(ids, getOneSafe(db, 'SELECT drama_id FROM characters WHERE id = ? AND deleted_at IS NULL', id)?.drama_id);
  }

  return ids;
}

function resolveTaskEpisodeIds(db, task) {
  const ids = [];
  const type = String(task?.type || '');
  const resourceId = String(task?.resource_id || '').trim();
  pushUnique(ids, task?.episode_id);

  if (type === 'prop_image_generation') {
    pushUnique(ids, getOneSafe(db, 'SELECT episode_id FROM props WHERE id = ? AND deleted_at IS NULL', resourceId)?.episode_id);
    for (const row of getAllSafe(
      db,
      `SELECT sb.episode_id
       FROM storyboard_props sp
       INNER JOIN storyboards sb ON sb.id = sp.storyboard_id
       WHERE sp.prop_id = ? AND sb.deleted_at IS NULL`,
      resourceId
    )) {
      pushUnique(ids, row.episode_id);
    }
  } else if (type === 'prop_extraction' || type === 'background_extraction' || type === 'storyboard_generation' || type === 'video_merge') {
    pushUnique(ids, resourceId);
  }
  for (const row of getAllSafe(
    db,
    `SELECT sb.episode_id
     FROM image_generations ig
     INNER JOIN storyboards sb ON sb.id = ig.storyboard_id
     WHERE ig.task_id = ? AND ig.deleted_at IS NULL AND sb.deleted_at IS NULL`,
    task.id
  )) {
    pushUnique(ids, row.episode_id);
  }
  for (const row of getAllSafe(
    db,
    `SELECT sb.episode_id
     FROM video_generations vg
     INNER JOIN storyboards sb ON sb.id = vg.storyboard_id
     WHERE vg.task_id = ? AND vg.deleted_at IS NULL AND sb.deleted_at IS NULL`,
    task.id
  )) {
    pushUnique(ids, row.episode_id);
  }

  return ids;
}

function canUserSeeTask(db, task, user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (task?.owner_user_id) return String(task.owner_user_id) === String(user.id);
  if (task?.operator_user_id && String(task.operator_user_id) === String(user.id)) return true;
  const dramaIds = resolveTaskDramaIds(db, task);
  if (dramaIds.length === 0) return false;
  return dramaIds.every((dramaId) => {
    const row = getOneSafe(db, 'SELECT owner_user_id FROM dramas WHERE id = ? AND deleted_at IS NULL', dramaId);
    return row?.owner_user_id && String(row.owner_user_id) === String(user.id);
  });
}

function filterTasks(db, tasks, filters = {}) {
  const types = taskTypesFromFilter(filters);
  const dramaId = parsePositiveInt(filters.drama_id);
  const episodeId = parsePositiveInt(filters.episode_id);
  return tasks.filter((task) => {
    if (types.length > 0 && !types.includes(String(task.type || ''))) return false;
    if (dramaId && !resolveTaskDramaIds(db, task).includes(dramaId)) return false;
    if (episodeId && !resolveTaskEpisodeIds(db, task).includes(episodeId)) return false;
    if (!canUserSeeTask(db, task, filters.user)) return false;
    return true;
  });
}

function getTasksByResource(db, resourceId, filters = {}) {
  const rows = db.prepare(
    'SELECT * FROM async_tasks WHERE resource_id = ? AND deleted_at IS NULL ORDER BY created_at DESC'
  ).all(resourceId);
  return filterTasks(db, rows.map(rowToTask), filters);
}

function getTasksByResources(db, resourceIds, filters = {}) {
  const ids = [...new Set((resourceIds || []).map((id) => String(id)).filter(Boolean))];
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT * FROM async_tasks WHERE resource_id IN (${placeholders}) AND deleted_at IS NULL ORDER BY created_at DESC`
  ).all(...ids);
  return filterTasks(db, rows.map(rowToTask), filters);
}

function updateTaskStatus(db, taskId, status, progress, message) {
  if (status !== 'cancelled' && isTaskCancelled(db, taskId)) return;
  const now = new Date().toISOString();
  let completedAt = null;
  if (status === 'completed' || status === 'failed' || status === 'cancelled') completedAt = now;
  db.prepare(
    `UPDATE async_tasks SET status = ?, progress = ?, message = ?, updated_at = ?, completed_at = ?
     WHERE id = ?`
  ).run(status, progress ?? 0, message || '', now, completedAt, taskId);
}

function isTaskCancelled(db, taskId) {
  if (!taskId) return false;
  const row = db.prepare('SELECT status FROM async_tasks WHERE id = ? AND deleted_at IS NULL').get(taskId);
  return row?.status === 'cancelled';
}

function cancelTask(db, taskId, message = '任务已停止') {
  const task = getTask(db, taskId);
  if (!task) return null;
  if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
    return task;
  }
  updateTaskStatus(db, taskId, 'cancelled', 0, message || '任务已停止');
  return getTask(db, taskId);
}

function deleteTask(db, log, taskId) {
  const cleanup = require('./storageCleanupService');
  return cleanup.deleteTaskAndArtifacts(db, log, taskId);
}

function updateTaskError(db, taskId, errMsg) {
  if (isTaskCancelled(db, taskId)) return;
  const now = new Date().toISOString();
  try {
    db.prepare(
      `UPDATE async_tasks SET status = 'failed', error = ?, progress = 0, completed_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(errMsg || '', now, now, taskId);
  } catch (e) {
    if ((e.message || '').includes('error')) {
      updateTaskStatus(db, taskId, 'failed', 0, errMsg || '任务失败');
    } else throw e;
  }
}

function updateTaskResult(db, taskId, result) {
  if (isTaskCancelled(db, taskId)) return;
  const now = new Date().toISOString();
  const resultStr = typeof result === 'string' ? result : JSON.stringify(result || {});
  db.prepare(
    `UPDATE async_tasks SET status = 'completed', progress = 100, result = ?, completed_at = ?, updated_at = ?
     WHERE id = ?`
  ).run(resultStr, now, now, taskId);
}

function rowToTask(r) {
  return {
    id: r.id,
    type: r.type,
    status: r.status,
    progress: r.progress ?? 0,
    message: r.message,
    error: r.error,
    result: r.result,
    drama_id: r.drama_id ?? null,
    episode_id: r.episode_id ?? null,
    resource_type: r.resource_type ?? null,
    resource_id: r.resource_id,
    owner_user_id: r.owner_user_id ?? null,
    operator_user_id: r.operator_user_id ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
    completed_at: r.completed_at,
  };
}

module.exports = {
  createTask,
  getTask,
  getTasksByResource,
  getTasksByResources,
  canUserSeeTask,
  cancelTask,
  deleteTask,
  isTaskCancelled,
  updateTaskStatus,
  updateTaskError,
  updateTaskResult,
};
