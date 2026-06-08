const taskService = require('./taskService');
const aiConfigService = require('./aiConfigService');

const queues = new Map();

function ensureState(type) {
  const key = normalizeQueueType(type);
  if (!queues.has(key)) {
    queues.set(key, { running: 0, pending: [] });
  }
  return queues.get(key);
}

function getStats() {
  const out = {};
  for (const type of ['text', 'image', 'video', 'tts']) {
    const state = ensureState(type);
    out[type] = {
      running: state.running,
      queued: state.pending.length,
    };
  }
  return out;
}

function updateQueued(db, taskId, message) {
  if (!taskId) return;
  try {
    taskService.updateTaskStatus(db, taskId, 'queued', 0, message || '排队中，等待可用生成名额');
  } catch (_) {}
}

function updateProcessing(db, taskId, message) {
  if (!taskId) return;
  try {
    taskService.updateTaskStatus(db, taskId, 'processing', 1, message || '生成中...');
  } catch (_) {}
}

function updateErrorIfOpen(db, taskId, err) {
  if (!taskId) return;
  try {
    const task = taskService.getTask(db, taskId);
    if (!task || ['completed', 'failed', 'cancelled'].includes(String(task.status || ''))) return;
    taskService.updateTaskError(db, taskId, err?.message || String(err || '任务执行失败'));
  } catch (_) {}
}

function drain(type) {
  const key = normalizeQueueType(type);
  const state = ensureState(key);
  while (state.pending.length > 0) {
    const job = state.pending[0];
    const policy = aiConfigService.getRoutingPolicy(job.db, key);
    const limit = Math.max(1, Number(policy.concurrency_limit || 1));
    if (state.running >= limit) return;
    state.pending.shift();
    if (job.taskId && taskService.isTaskCancelled(job.db, job.taskId)) {
      try {
        if (typeof job.onCancel === 'function') job.onCancel();
      } catch (err) {
        job.log?.error?.('generation queue cancel cleanup failed', {
          generation_type: key,
          task_id: job.taskId,
          label: job.label,
          error: err?.message || String(err || ''),
        });
      }
      continue;
    }
    state.running += 1;
    updateProcessing(job.db, job.taskId, job.processingMessage);
    Promise.resolve()
      .then(() => job.runner())
      .catch((err) => {
        job.log?.error?.('generation queue job failed', {
          generation_type: key,
          task_id: job.taskId,
          label: job.label,
          error: err?.message || String(err || ''),
        });
        updateErrorIfOpen(job.db, job.taskId, err);
      })
      .finally(() => {
        state.running = Math.max(0, state.running - 1);
        setImmediate(() => drain(key));
      });
  }
}

function enqueue(db, log, options = {}) {
  const key = normalizeQueueType(options.generationType || options.type || options.taskType);
  const state = ensureState(key);
  const job = {
    db,
    log,
    taskId: options.taskId || null,
    label: options.label || '',
    queuedMessage: options.queuedMessage || '排队中，等待可用生成名额',
    processingMessage: options.processingMessage || '生成中...',
    runner: options.runner,
    onCancel: options.onCancel,
  };
  if (typeof job.runner !== 'function') {
    throw new Error('generationQueueService.enqueue 缺少 runner');
  }
  updateQueued(db, job.taskId, job.queuedMessage);
  state.pending.push(job);
  setImmediate(() => drain(key));
  return {
    type: key,
    status: 'queued',
    position: state.pending.length,
  };
}

module.exports = {
  enqueue,
  getStats,
};

function normalizeQueueType(type) {
  const raw = String(type || '').trim().toLowerCase();
  if (raw === 'audio' || raw === 'voice' || raw === 'tts') return 'tts';
  if (raw === 'storyboard_image') return 'image';
  if (raw.includes('image')) return 'image';
  if (raw.includes('video')) return 'video';
  if (raw.includes('audio') || raw.includes('tts') || raw.includes('voice')) return 'tts';
  return raw === 'image' || raw === 'video' || raw === 'text' ? raw : 'text';
}
