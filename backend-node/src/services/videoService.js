/** 轮询/同步返回的 video_url 须为 http(s)，避免中转 FAILURE 时 result_url 为错误文案 */
function resolveRemoteVideoUrl(videoUrl, fallbackError) {
  if (videoUrl && videoClient.isPlausibleHttpVideoUrl(videoUrl)) {
    return { ok: true, video_url: String(videoUrl).trim() };
  }
  if (videoUrl) {
    return { ok: false, error: (fallbackError || String(videoUrl)).slice(0, 500) };
  }
  return { ok: false, error: (fallbackError || '超时或失败').slice(0, 500) };
}

/** 将 video_generations 标为失败；若无 error_msg 列则只更新 status/updated_at */
function setVideoGenFailed(db, videoGenId, errorMsg, now) {
  try {
    db.prepare('UPDATE video_generations SET status = ?, error_msg = ?, updated_at = ? WHERE id = ?').run(
      'failed', (errorMsg || '').slice(0, 500), now, videoGenId
    );
  } catch (e) {
    if ((e.message || '').includes('error_msg')) {
      db.prepare('UPDATE video_generations SET status = ?, updated_at = ? WHERE id = ?').run('failed', now, videoGenId);
    } else throw e;
  }
}

function setVideoGenCancelled(db, videoGenId, now) {
  try {
    db.prepare('UPDATE video_generations SET status = ?, error_msg = ?, updated_at = ? WHERE id = ?').run(
      'cancelled', '任务已停止', now, videoGenId
    );
  } catch (e) {
    if ((e.message || '').includes('error_msg')) {
      db.prepare('UPDATE video_generations SET status = ?, updated_at = ? WHERE id = ?').run('cancelled', now, videoGenId);
    } else throw e;
  }
}

function isVideoTaskCancelled(db, row, videoGenId, now, log) {
  if (!row?.task_id || !taskService.isTaskCancelled(db, row.task_id)) return false;
  setVideoGenCancelled(db, videoGenId, now || new Date().toISOString());
  log.info('[视频] 已停止，忽略模型返回结果', { id: videoGenId, task_id: row.task_id });
  return true;
}

function getVideoTaskUserId(db, taskId) {
  if (!db || !taskId) return null;
  try {
    const task = db.prepare('SELECT operator_user_id, owner_user_id FROM async_tasks WHERE id = ?').get(String(taskId));
    return task?.operator_user_id || task?.owner_user_id || null;
  } catch (_) {
    return null;
  }
}

function list(db, query) {
  let sql = 'FROM video_generations WHERE deleted_at IS NULL';
  const params = [];
  const user = query.user;
  if (query.drama_id) {
    sql += ' AND drama_id = ?';
    params.push(query.drama_id);
  }
  if (user && user.role !== 'admin') {
    sql += ` AND EXISTS (
      SELECT 1 FROM dramas d
      WHERE d.id = video_generations.drama_id
        AND d.deleted_at IS NULL
        AND d.owner_user_id = ?
    )`;
    params.push(String(user.id));
  }
  if (query.storyboard_id) {
    sql += ' AND storyboard_id = ?';
    params.push(query.storyboard_id);
  } else if (query.storyboard_ids) {
    const ids = parseIds(query.storyboard_ids);
    if (ids.length > 0) {
      sql += ` AND storyboard_id IN (${ids.map(() => '?').join(',')})`;
      params.push(...ids);
    }
  }
  // 与 Go 前端行为对齐：请求 status=processing 时，同时包含“刚结束”的记录（5 分钟内变为 completed/failed），
  // 这样轮询刷新后任务不会从列表消失，无需改 Vue
  if (query.status === 'processing') {
    sql += " AND (status = 'processing' OR (status IN ('completed','failed') AND updated_at >= datetime('now', '-5 minutes')))";
  } else if (query.status) {
    sql += ' AND status = ?';
    params.push(query.status);
  }
  const countRow = db.prepare('SELECT COUNT(*) as total ' + sql).get(...params);
  const total = countRow.total || 0;
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(500, Math.max(1, parseInt(query.page_size, 10) || 20));
  const offset = (page - 1) * pageSize;
  const rows = db.prepare('SELECT * ' + sql + ' ORDER BY created_at DESC LIMIT ? OFFSET ?').all(...params, pageSize, offset);
  return { items: rows.map(rowToItem), total, page, pageSize };
}

function parseIds(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(raw.map((id) => Number(String(id).trim())).filter((n) => Number.isFinite(n) && n > 0))];
}

function rowToItem(r) {
  return {
    id: r.id,
    storyboard_id: r.storyboard_id,
    drama_id: r.drama_id,
    provider: r.provider,
    prompt: r.prompt,
    model: r.model,
    ai_config_id: r.ai_config_id,
    image_gen_id: r.image_gen_id,
    image_url: r.image_url,
    video_url: r.video_url,
    local_path: r.local_path,
    status: r.status,
    task_id: r.task_id,
    error_msg: r.error_msg,
    created_at: r.created_at,
    updated_at: r.updated_at,
    completed_at: r.completed_at,
  };
}

function getById(db, id) {
  const r = db.prepare('SELECT * FROM video_generations WHERE id = ? AND deleted_at IS NULL').get(Number(id));
  return r ? rowToItem(r) : null;
}

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { randomUUID } = require('crypto');
const videoClient = require('./videoClient');
const taskService = require('./taskService');
const aiConfigService = require('./aiConfigService');
const storageLayout = require('./storageLayout');
const { getFfmpegPath, hasLocalFfmpeg } = require('../utils/ffmpegPath');
const { resolveProjectVideoSpec } = require('./projectMediaSpec');
const { safeDeleteFile } = require('./storageCleanupService');
const { getNoAiConfigMessage, normalizeNoAiConfigMessage } = require('../utils/aiFriendlyErrors');

/** @returns {{ dir: string, relPrefix: string }} 与图片 uploads 一致的工程子目录规则 */
function resolveVideosDir(storagePath, projectSubdir) {
  const sub = projectSubdir && String(projectSubdir).trim();
  if (sub) {
    const relPrefix = `${sub.replace(/\\/g, '/')}/videos`;
    return { dir: path.join(storagePath, sub, 'videos'), relPrefix };
  }
  return { dir: path.join(storagePath, 'videos'), relPrefix: 'videos' };
}

/**
 * 将远程 video_url 下载到本地
 * @returns {string|null} 相对 storage 根的路径，如 projects/.../videos/vg_1_xxx.mp4；无工程时为 videos/...
 */
async function downloadVideoToLocal(storagePath, videoUrl, videoGenId, log, projectSubdir = null) {
  if (!videoUrl || typeof videoUrl !== 'string') return null;
  const { dir, relPrefix } = resolveVideosDir(storagePath, projectSubdir);
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const ext = (videoUrl.split('?')[0].match(/\.(mp4|webm|mov)$/i) || [])[1] || 'mp4';
    const name = `vg_${videoGenId}_${randomUUID().slice(0, 8)}.${ext}`;
    const filePath = path.join(dir, name);
    const res = await fetch(videoUrl, { method: 'GET' });
    if (!res.ok) {
      log.warn('Download video failed', { status: res.status, videoGenId });
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(filePath, buf);
    const relativePath = `${relPrefix}/${name}`.replace(/\\/g, '/');
    log.info('Video saved to local', { videoGenId, local_path: relativePath, projectSubdir: projectSubdir || '(root)' });
    return relativePath;
  } catch (e) {
    log.warn('Download video error', { videoGenId, error: e.message });
    return null;
  }
}

/** 与图生 aspectRatioToSize 对齐的归一化分辨率（偶数像素，便于 H.264） */
function targetVideoPixelsForAspect(aspectRatio) {
  const r = String(aspectRatio || '16:9').trim();
  const map = {
    '16:9': { w: 2560, h: 1440 },
    '9:16': { w: 1440, h: 2560 },
    '1:1': { w: 1920, h: 1920 },
    '4:3': { w: 1920, h: 1440 },
    '3:4': { w: 1440, h: 1920 },
    '3:2': { w: 2560, h: 1708 },
    '2:3': { w: 1708, h: 2560 },
    '21:9': { w: 2560, h: 1080 },
  };
  if (map[r]) return map[r];
  const m = r.match(/^(\d+)\s*:\s*(\d+)$/);
  if (m) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    if (a > 0 && b > 0 && a !== b) {
      if (a > b) {
        const w = 2560;
        const h = Math.max(2, Math.round((w * b) / a / 2) * 2);
        return { w, h };
      }
      const h = 2560;
      const w = Math.max(2, Math.round((h * a) / b / 2) * 2);
      return { w, h };
    }
  }
  return { w: 1280, h: 720 };
}

/**
 * 用 ffmpeg 将视频缩放并加黑边到固定分辨率，避免 Grok 等返回实际像素不一致导致连播时画面跳动。
 */
function normalizeVideoFileToTargetPixels(absPath, tw, th, log, videoGenId) {
  if (!absPath || !tw || !th || !fs.existsSync(absPath)) return false;
  if (!hasLocalFfmpeg()) {
    log.info('[视频] 未找到 ffmpeg，跳过画幅归一化', { videoGenId });
    return false;
  }
  const ffmpeg = getFfmpegPath();
  const vf = `scale=${tw}:${th}:force_original_aspect_ratio=decrease,pad=${tw}:${th}:(ow-iw)/2:(oh-ih)/2:black`;
  const tmpOut = absPath + '.norm-' + randomUUID().slice(0, 8) + (path.extname(absPath) || '.mp4');
  const baseArgs = ['-y', '-i', absPath, '-vf', vf, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
  let r = spawnSync(ffmpeg, [...baseArgs, '-c:a', 'copy', tmpOut], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) {
    r = spawnSync(ffmpeg, [...baseArgs, '-an', tmpOut], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  }
  if (r.status !== 0) {
    log.warn('[视频] 画幅归一化失败（保留原文件）', {
      videoGenId,
      stderr: (r.stderr || '').slice(-500),
    });
    try {
      fs.unlinkSync(tmpOut);
    } catch (_) {}
    return false;
  }
  try {
    fs.unlinkSync(absPath);
    fs.renameSync(tmpOut, absPath);
    log.info('[视频] 已统一画幅尺寸', { videoGenId, w: tw, h: th });
    return true;
  } catch (e) {
    log.warn('[视频] 替换归一化文件失败', { videoGenId, error: e.message });
    try {
      fs.unlinkSync(tmpOut);
    } catch (_) {}
    return false;
  }
}

function maybeNormalizeVideoAfterDownload(storagePath, localPath, row, videoGenId, log) {
  if (!localPath) return;
  const abs = path.join(storagePath, localPath);
  let dim = null;
  try {
    const params = row.params_json ? JSON.parse(row.params_json) : null;
    const spec = params?.product_video_spec;
    if (spec?.width && spec?.height) dim = { w: Number(spec.width), h: Number(spec.height) };
  } catch (_) {}
  if (!dim) dim = targetVideoPixelsForAspect(row.aspect_ratio);
  normalizeVideoFileToTargetPixels(abs, dim.w, dim.h, log, videoGenId);
}

async function processVideoGeneration(db, log, videoGenId) {
  log.info('processVideoGeneration started', { videoGenId });
  const row = db.prepare('SELECT * FROM video_generations WHERE id = ? AND deleted_at IS NULL').get(Number(videoGenId));
  if (!row) {
    log.error('Video generation not found', { id: videoGenId });
    return;
  }
  const now = new Date().toISOString();
  try {
    db.prepare('UPDATE video_generations SET status = ?, updated_at = ? WHERE id = ?').run('processing', now, videoGenId);
    if (isVideoTaskCancelled(db, row, videoGenId, new Date().toISOString(), log)) return;
    const loadConfig = require('../config').loadConfig;
    const cfg = loadConfig();
    const filesBaseUrl = (cfg.storage && cfg.storage.base_url) ? String(cfg.storage.base_url).replace(/\/$/, '') : '';
    const storageLocalPath = path.isAbsolute(cfg.storage?.local_path)
      ? cfg.storage.local_path
      : path.join(process.cwd(), cfg.storage?.local_path || './data/storage');
    let reference_urls = null;
    if (row.reference_image_urls) {
      try {
        reference_urls = JSON.parse(row.reference_image_urls);
        if (!Array.isArray(reference_urls)) reference_urls = null;
      } catch (_) {}
    }
    // 优先使用分镜自身的镜头时长（storyboard.duration），其次用 video_generations.duration
    let effectiveDuration = row.duration || null;
    if (row.storyboard_id) {
      const sb = db.prepare('SELECT duration FROM storyboards WHERE id = ?').get(row.storyboard_id);
      if (sb && sb.duration > 0) {
        effectiveDuration = sb.duration;
        log.info('使用分镜镜头时长', { storyboard_id: row.storyboard_id, duration: effectiveDuration, video_gen_id: videoGenId });
      }
    }
    let aspectForVideo = row.aspect_ratio;
    if (aspectForVideo) {
      const n = videoClient.normalizeAspectRatioForApi(aspectForVideo);
      if (n) aspectForVideo = n;
    }
    if (!aspectForVideo && row.drama_id) {
      try {
        const spec = resolveProjectVideoSpec(db, row.drama_id);
        if (spec?.aspect_ratio) aspectForVideo = videoClient.normalizeAspectRatioForApi(spec.aspect_ratio);
      } catch (_) {}
    }
    const rowForAspect = { ...row, aspect_ratio: aspectForVideo || row.aspect_ratio };
    const result = await videoClient.callVideoApi(db, log, {
      prompt: row.prompt,
      model: row.model,
      ai_config_id: row.ai_config_id || undefined,
      scene_key: 'storyboard_video',
      duration: effectiveDuration,
      aspect_ratio: rowForAspect.aspect_ratio,
      resolution: row.resolution,
      seed: row.seed,
      camera_fixed: row.camera_fixed,
      watermark: row.watermark,
      provider: row.provider,
      drama_id: row.drama_id,
      storyboard_id: row.storyboard_id || undefined,
      image_url: row.image_url,
      first_frame_url: row.first_frame_url,
      last_frame_url: row.last_frame_url,
      reference_urls,
      files_base_url: filesBaseUrl,
      storage_local_path: storageLocalPath,
      video_gen_id: videoGenId,
      task_id: row.task_id || null,
      user_id: getVideoTaskUserId(db, row.task_id),
    });
    const now2 = new Date().toISOString();
    if (isVideoTaskCancelled(db, row, videoGenId, now2, log)) return;
    if (result.error) {
      const resultError = normalizeNoAiConfigMessage(result.error, 'video');
      setVideoGenFailed(db, videoGenId, resultError, now2);
      if (row.task_id) taskService.updateTaskError(db, row.task_id, resultError);
      log.error('Video generation failed', { id: videoGenId, error: resultError });
      return;
    }
    const directVideo = resolveRemoteVideoUrl(result.video_url, result.error);
    if (directVideo.ok) {
      let localPath = null;
      let storagePath = null;
      try {
        const loadConfig = require('../config').loadConfig;
        const cfg = loadConfig();
        storagePath = path.isAbsolute(cfg.storage?.local_path)
          ? cfg.storage.local_path
          : path.join(process.cwd(), cfg.storage?.local_path || './data/storage');
        const projectSubdir = storageLayout.getProjectStorageSubdir(db, row.drama_id);
        localPath = await downloadVideoToLocal(storagePath, directVideo.video_url, videoGenId, log, projectSubdir);
        maybeNormalizeVideoAfterDownload(storagePath, localPath, rowForAspect, videoGenId, log);
      } catch (_) {}
      if (isVideoTaskCancelled(db, row, videoGenId, new Date().toISOString(), log)) {
        if (localPath && storagePath) {
          try { safeDeleteFile(storagePath, localPath); } catch (_) {}
        }
        return;
      }
      try {
        db.prepare(
          'UPDATE video_generations SET status = ?, video_url = ?, local_path = ?, completed_at = ?, updated_at = ? WHERE id = ?'
        ).run('completed', directVideo.video_url, localPath, now2, now2, videoGenId);
      } catch (e) {
        if ((e.message || '').includes('completed_at')) {
          db.prepare(
            'UPDATE video_generations SET status = ?, video_url = ?, local_path = ?, updated_at = ? WHERE id = ?'
          ).run('completed', directVideo.video_url, localPath, now2, videoGenId);
        } else throw e;
      }
      // 自动更新分镜的主视频
      if (row.storyboard_id) {
        try {
          db.prepare('UPDATE storyboards SET video_url = ?, local_path = ?, updated_at = ? WHERE id = ?').run(
            directVideo.video_url, localPath, now2, row.storyboard_id
          );
          log.info('Updated storyboard video', { storyboard_id: row.storyboard_id, video_url: directVideo.video_url });
        } catch (_) {}
      }
      if (row.task_id) taskService.updateTaskResult(db, row.task_id, { video_generation_id: videoGenId, video_url: directVideo.video_url, status: 'completed' });
      log.info('Video generation completed', { id: videoGenId, video_url: directVideo.video_url, local_path: localPath });
      return;
    }
    if (result.video_url) {
      setVideoGenFailed(db, videoGenId, directVideo.error, now2);
      if (row.task_id) taskService.updateTaskError(db, row.task_id, directVideo.error);
      log.error('Video generation failed', { id: videoGenId, error: directVideo.error });
      return;
    }
    if (result.task_id) {
      const selectedConfig = result._ai_config || videoClient.getVideoConfigCandidates(db, row.model, row.ai_config_id, 'storyboard_video')[0] || null;
      if (!selectedConfig) {
        const noConfigMessage = getNoAiConfigMessage('video');
        setVideoGenFailed(db, videoGenId, noConfigMessage, now2);
        if (row.task_id) taskService.updateTaskError(db, row.task_id, noConfigMessage);
        return;
      }
      db.prepare('UPDATE video_generations SET status = ?, updated_at = ? WHERE id = ?').run(
        'processing',
        now2,
        videoGenId
      );
      const POLL_INTERVAL_MS = 10000;
      const videoRoutingPolicy = aiConfigService.getRoutingPolicy(db, 'video') || {};
      const generationTimeoutSeconds =
        Number(videoRoutingPolicy.video_poll_timeout_seconds)
        || 30 * 60;
      const pollMaxAttempts = Math.max(
        1,
        Math.ceil((generationTimeoutSeconds * 1000) / POLL_INTERVAL_MS)
      );
      const pollResult = await videoClient.pollVideoTask(
        db,
        log,
        videoGenId,
        result.task_id,
        selectedConfig,
        pollMaxAttempts,
        POLL_INTERVAL_MS,
        { localTaskId: row.task_id }
      );
      const now3 = new Date().toISOString();
      if (isVideoTaskCancelled(db, row, videoGenId, now3, log)) return;
      const polledVideo = resolveRemoteVideoUrl(pollResult.video_url, pollResult.error);
      if (polledVideo.ok) {
        let localPath = null;
        let storagePath = null;
        try {
          const loadConfig = require('../config').loadConfig;
          const cfg = loadConfig();
          storagePath = path.isAbsolute(cfg.storage?.local_path)
            ? cfg.storage.local_path
            : path.join(process.cwd(), cfg.storage?.local_path || './data/storage');
          const projectSubdir = storageLayout.getProjectStorageSubdir(db, row.drama_id);
          localPath = await downloadVideoToLocal(storagePath, polledVideo.video_url, videoGenId, log, projectSubdir);
          maybeNormalizeVideoAfterDownload(storagePath, localPath, rowForAspect, videoGenId, log);
        } catch (_) {}
        if (isVideoTaskCancelled(db, row, videoGenId, new Date().toISOString(), log)) {
          if (localPath && storagePath) {
            try { safeDeleteFile(storagePath, localPath); } catch (_) {}
          }
          return;
        }
        try {
          db.prepare(
            'UPDATE video_generations SET status = ?, video_url = ?, local_path = ?, completed_at = ?, updated_at = ? WHERE id = ?'
          ).run('completed', polledVideo.video_url, localPath, now3, now3, videoGenId);
        } catch (e) {
          if ((e.message || '').includes('completed_at')) {
            db.prepare(
              'UPDATE video_generations SET status = ?, video_url = ?, local_path = ?, updated_at = ? WHERE id = ?'
            ).run('completed', polledVideo.video_url, localPath, now3, videoGenId);
          } else throw e;
        }
        // 自动更新分镜的主视频
        if (row.storyboard_id) {
          try {
            db.prepare('UPDATE storyboards SET video_url = ?, local_path = ?, updated_at = ? WHERE id = ?').run(
              polledVideo.video_url, localPath, now3, row.storyboard_id
            );
            log.info('Updated storyboard video (poll)', { storyboard_id: row.storyboard_id, video_url: polledVideo.video_url });
          } catch (_) {}
        }
        if (row.task_id) taskService.updateTaskResult(db, row.task_id, { video_generation_id: videoGenId, video_url: polledVideo.video_url, status: 'completed' });
        log.info('Video generation completed (after poll)', { id: videoGenId, local_path: localPath });
      } else {
        setVideoGenFailed(db, videoGenId, polledVideo.error, now3);
        if (row.task_id) taskService.updateTaskError(db, row.task_id, polledVideo.error);
        log.error('Video generation failed (after poll)', { id: videoGenId, error: polledVideo.error });
      }
      return;
    }
    setVideoGenFailed(db, videoGenId, '未返回 task_id 或 video_url', now2);
    if (row.task_id) taskService.updateTaskError(db, row.task_id, '未返回 task_id 或 video_url');
  } catch (err) {
    const now2 = new Date().toISOString();
    if (row && isVideoTaskCancelled(db, row, videoGenId, now2, log)) return;
    const errMsg = normalizeNoAiConfigMessage(err.message || '', 'video');
    setVideoGenFailed(db, videoGenId, errMsg, now2);
    if (row && row.task_id) taskService.updateTaskError(db, row.task_id, errMsg);
    log.error('Video generation error', { id: videoGenId, error: errMsg });
  }
}

function deleteById(db, log, id) {
  const cleanup = require('./storageCleanupService');
  return !!cleanup.deleteVideoGenerationById(db, log, id);
}

module.exports = {
  list,
  getById,
  deleteById,
  processVideoGeneration,
};
