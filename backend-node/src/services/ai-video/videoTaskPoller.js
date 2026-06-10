const taskService = require('../taskService');
const { resolveVideoProtocol, buildQueryUrl } = require('./videoProtocol');
const {
  isPlausibleHttpVideoUrl,
  extractPollTaskStatus,
  isPollTaskFailed,
  extractPollFailureMessage,
  videoUrlFromRecord,
  pickProxyVideoUrl,
  parseDashScopeVideoUrl,
} = require('./videoResultParser');
const {
  applyKlingOmniEnvOverrides,
  resolveKlingOmniBaseUrl,
  resolveKlingOmniBearerToken,
  resolveKlingOmniQueryPathTemplate,
} = require('./adapters/klingOmniConfig');
function parseKlingOmniPollVideoUrl(data) {
  let u = pickProxyVideoUrl(data);
  if (u) return u;
  const tryPaths = [
    data?.data?.task_result?.videos?.[0]?.url,
    data?.data?.videos?.[0]?.url,
    data?.data?.video_url,
    data?.task_result?.videos?.[0]?.url,
    data?.result?.videos?.[0]?.url,
    data?.output?.video_url,
  ];
  for (const p of tryPaths) {
    if (p && typeof p === 'string') return p;
  }
  return null;
}

async function pollVideoTask(db, log, videoGenId, taskId, config, maxAttempts = 300, intervalMs = 10000, options = {}) {
  const localTaskId = options.localTaskId || options.task_id || null;
  const isCancelled = () => localTaskId && taskService.isTaskCancelled(db, localTaskId);
  const provider = (config.provider || '').toLowerCase();
  const protocol = resolveVideoProtocol(config);
  const isDashScope = protocol === 'dashscope';
  const isGemini = protocol === 'gemini';
  const isVidu = protocol === 'vidu';
  const isSora = protocol === 'sora';
  const isKling = protocol === 'kling';
  const isKlingOmni = protocol === 'kling_omni' || (typeof taskId === 'string' && taskId.startsWith('omni:'));
  const isVeo3 = protocol === 'veo3';
  /** 轮询日志里响应体最大字符数（即梦/方舟等 JSON 可能较长）；0 表示不截断（慎用） */
  const pollLogBodyMax = (() => {
    const v = String(process.env.VIDEO_POLL_LOG_MAX || '16384').trim();
    if (v === '0' || v.toLowerCase() === 'full') return Infinity;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 512 * 1024) : 16384;
  })();
  const isVolcPoll =
    provider === 'volces' ||
    provider === 'volcengine' ||
    provider === 'volc' ||
    protocol === 'volcengine' ||
    protocol === 'volcengine_omni';
  if (protocol === 'jimeng_ai_api') {
    log.warn('[poll] Jimeng AI API 不应进入轮询', { video_gen_id: videoGenId, task_id: taskId });
    return { error: 'Jimeng AI API 为同步返回视频地址，不应进入轮询' };
  }
  const queryUrl = () => buildQueryUrl(config, taskId);
  log.info('[poll] ????', { video_gen_id: videoGenId, task_id: taskId, protocol, poll_url: queryUrl() });
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (isCancelled()) {
      log.info('[poll] 本地任务已停止，结束视频轮询', { video_gen_id: videoGenId, task_id: taskId, local_task_id: localTaskId });
      return { cancelled: true, error: '任务已停止' };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
    if (isCancelled()) {
      log.info('[poll] 本地任务已停止，结束视频轮询', { video_gen_id: videoGenId, task_id: taskId, local_task_id: localTaskId });
      return { cancelled: true, error: '任务已停止' };
    }
    try {
      let url, headers;
      if (isKling) {
        // task_id 编码格式：`t2v:xxx` / `i2v:xxx` / `mc:xxx`
        const klingBase = (config.base_url || 'https://api.klingai.com').replace(/\/$/, '');
        let actualTaskId = taskId;
        let videoType = 'text2video';
        if (taskId.startsWith('i2v:')) { actualTaskId = taskId.slice(4); videoType = 'image2video'; }
        else if (taskId.startsWith('t2v:')) { actualTaskId = taskId.slice(4); videoType = 'text2video'; }
        else if (taskId.startsWith('mc:'))  { actualTaskId = taskId.slice(3); videoType = 'motion-control'; }
        // 若用户配置了 query_endpoint，优先使用
        let qep = config.query_endpoint || `/v1/videos/${videoType}/{taskId}`;
        qep = String(qep).replace(/\{taskId\}/gi, encodeURIComponent(actualTaskId)).replace(/\{task_id\}/gi, encodeURIComponent(actualTaskId)).replace(/\{id\}/gi, encodeURIComponent(actualTaskId));
        if (!qep.startsWith('/')) qep = '/' + qep;
        url = klingBase + qep;
        headers = { Authorization: 'Bearer ' + (config.api_key || '') };
      } else if (isKlingOmni) {
        const cfgOmni = applyKlingOmniEnvOverrides(config);
        const omniBase = resolveKlingOmniBaseUrl(cfgOmni);
        let actualId = String(taskId);
        if (actualId.startsWith('omni:')) actualId = actualId.slice(5);
        let qep = resolveKlingOmniQueryPathTemplate(cfgOmni, omniBase);
        qep = String(qep)
          .replace(/\{taskId\}/gi, encodeURIComponent(actualId))
          .replace(/\{task_id\}/gi, encodeURIComponent(actualId))
          .replace(/\{id\}/gi, encodeURIComponent(actualId));
        if (!qep.startsWith('/')) qep = '/' + qep;
        url = omniBase + qep;
        const bt = resolveKlingOmniBearerToken(cfgOmni, log);
        headers = bt
          ? { Authorization: bt.startsWith('Bearer ') ? bt : `Bearer ${bt}` }
          : {};
      } else if (isGemini) {
        const base = (config.base_url || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
        url = `${base}/v1beta/${taskId}`;
        headers = { 'x-goog-api-key': config.api_key || '' };
      } else if (isVidu) {
        const viduBase = (config.base_url || 'https://api.vidu.cn').replace(/\/$/, '');
        const isOfficialVidu = /api\.vidu\.cn/i.test(viduBase);
        const defaultQep = isOfficialVidu ? '/ent/v2/tasks/{taskId}/creations' : '/ent/v2/tasks/{taskId}/creations';
        let qep = config.query_endpoint || defaultQep;
        qep = String(qep).replace(/\{taskId\}/gi, encodeURIComponent(taskId)).replace(/\{task_id\}/gi, encodeURIComponent(taskId)).replace(/\{id\}/gi, encodeURIComponent(taskId));
        if (!qep.startsWith('/')) qep = '/' + qep;
        url = viduBase + qep;
        headers = { Authorization: (isOfficialVidu ? 'Token ' : 'Bearer ') + (config.api_key || '') };
      } else {
        url = queryUrl();
        headers = { Authorization: 'Bearer ' + (config.api_key || '') };
      }
      const pollRound = attempt + 1;
      log.info('[poll] 发起查询', { video_gen_id: videoGenId, round: pollRound, url });
      const res = await fetch(url, { method: 'GET', headers });
      const raw = await res.text();
      const bodyLogged =
        pollLogBodyMax === Infinity
          ? raw
          : raw.length <= pollLogBodyMax
            ? raw
            : raw.slice(0, pollLogBodyMax) + `\n... [poll 响应已截断 前${pollLogBodyMax}字符 / 共${raw.length}字符，可设环境变量 VIDEO_POLL_LOG_MAX=0 输出全文]`;
      log.info('[poll] 查询 HTTP 结果', {
        video_gen_id: videoGenId,
        round: pollRound,
        http_status: res.status,
        bytes: raw.length,
        body: bodyLogged,
      });
      if (!res.ok) {
        log.warn('[poll] 查询非 2xx', {
          video_gen_id: videoGenId,
          round: pollRound,
          http_status: res.status,
          body: bodyLogged.slice(0, 4000),
        });
        continue;
      }
      let data;
      try {
        data = JSON.parse(raw);
      } catch (parseErr) {
        log.warn('[poll] 响应非 JSON', {
          video_gen_id: videoGenId,
          round: pollRound,
          error: parseErr.message,
          body_head: raw.slice(0, 800),
        });
        continue;
      }

      if (isKling) {
        if (data.code !== undefined && data.code !== 0) {
          const msg = data.message || `可灵错误码: ${data.code}`;
          log.warn('[Kling poll] API 错误', { video_gen_id: videoGenId, code: data.code, msg });
          return { error: msg };
        }
        const status = (data?.data?.task_status || '').toLowerCase();
        log.info('[Kling poll] 状态', { video_gen_id: videoGenId, attempt, status, task_id: taskId });
        if (status === 'succeed') {
          const videoUrl = data?.data?.task_result?.videos?.[0]?.url;
          if (videoUrl) {
            log.info('[Kling poll] 视频生成完成', { video_gen_id: videoGenId, video_url: videoUrl });
            return { video_url: videoUrl };
          }
          return { error: '可灵任务完成但未返回视频地址' };
        }
        if (status === 'failed') {
          const errMsg = data?.data?.task_status_msg || '任务失败';
          log.warn('[Kling poll] 任务失败', { video_gen_id: videoGenId, error: errMsg });
          return { error: '可灵视频生成失败: ' + errMsg };
        }
        // submitted / processing → 继续轮询
        continue;
      }

      if (isKlingOmni) {
        if (data.code !== undefined && Number(data.code) !== 0) {
          const msg = data.message || data.msg || `Kling Omni 错误码 ${data.code}`;
          log.warn('[KlingOmni poll] API 错误', { video_gen_id: videoGenId, code: data.code, msg });
          return { error: msg };
        }
        const st = (data?.data?.task_status || data?.task_status || data?.status || '').toLowerCase();
        const videoUrlOmni = parseKlingOmniPollVideoUrl(data);
        log.info('[KlingOmni poll] 状态', { video_gen_id: videoGenId, attempt, status: st, has_url: !!videoUrlOmni });
        if (videoUrlOmni) {
          log.info('[KlingOmni poll] 完成', { video_gen_id: videoGenId });
          return { video_url: videoUrlOmni };
        }
        if (st === 'succeed' || st === 'success' || st === 'completed' || st === 'succeeded' || st === 'done') {
          return { error: 'Kling Omni 标记完成但未解析到视频地址' };
        }
        if (st === 'failed' || st === 'error') {
          const errMsg = data?.data?.task_status_msg || data?.task_status_msg || data?.message || '任务失败';
          return { error: 'Kling Omni: ' + String(errMsg).slice(0, 400) };
        }
        continue;
      }

      if (isVeo3) {
        const status = extractPollTaskStatus(data);
        log.info('[Veo3 poll] task status', { video_gen_id: videoGenId, attempt, status, id: data.task_id || data.id });
        if (isPollTaskFailed(status)) {
          const msg = extractPollFailureMessage(data) || data.data?.error || 'Veo3 task failed';
          log.warn('[Veo3 poll] task failed', { video_gen_id: videoGenId, msg });
          return { error: String(msg).slice(0, 500) };
        }
        const videoUrl = pickProxyVideoUrl(data);
        if (videoUrl) {
          log.info('[Veo3 poll] video completed', { video_gen_id: videoGenId, video_url: videoUrl });
          return { video_url: videoUrl };
        }
        if (status === 'succeeded' || status === 'completed' || status === 'done') {
          log.warn('[Veo3 poll] completed but no video_url', { data: JSON.stringify(data).slice(0, 500) });
          return { error: 'Veo3 completed but no video URL: ' + JSON.stringify(data).slice(0, 300) };
        }
        continue;
      }

      if (isSora) {
        const status = extractPollTaskStatus(data);
        log.info('[Sora poll] ????', { video_gen_id: videoGenId, attempt, status, progress: data.progress, id: data.id });
        if (isPollTaskFailed(status)) {
          const msg = extractPollFailureMessage(data) || 'Sora 任务失败';
          log.warn('[Sora poll] 任务失败', { video_gen_id: videoGenId, msg, data: JSON.stringify(data).slice(0, 300) });
          return { error: String(msg).slice(0, 500) };
        }
        // succeeded / completed / done ? ??? URL
        const videoUrl = pickProxyVideoUrl(data);
        if (videoUrl && isPlausibleHttpVideoUrl(videoUrl)) {
          log.info('[Sora poll] ????', { video_gen_id: videoGenId, video_url: videoUrl });
          return { video_url: videoUrl };
        }
        if (status === 'succeeded' || status === 'completed' || status === 'done') {
          log.warn('[Sora poll] ????????? video_url', { video_gen_id: videoGenId, data: JSON.stringify(data).slice(0, 500) });
          return { error: 'Sora ?????????????????: ' + JSON.stringify(data).slice(0, 300) };
        }
        // queued / processing / running ? ????
        continue;
      }

      if (isVidu) {
        const state = (data?.state || data?.status || data?.data?.status || '').toLowerCase();
        log.info('[Vidu poll] ????', { video_gen_id: videoGenId, attempt, state, id: taskId });
        if (state === 'failed' || state === 'error') {
          const msg = data?.err_code || data?.message || data?.error?.message || data?.error || 'Vidu ??????';
          log.warn('[Vidu poll] ????', { video_gen_id: videoGenId, msg });
          return { error: String(msg) };
        }
        // ?? ent/v2 ???????? success???? creations[0].url
        // ??????????????? succeeded/completed/done???? video_url/url ?
        const videoUrl =
          data?.creations?.[0]?.url ||
          videoUrlFromRecord(data?.creations?.[0]) ||
          pickProxyVideoUrl(data);
        if (videoUrl) {
          log.info('[Vidu poll] ????', { video_gen_id: videoGenId, video_url: videoUrl });
          return { video_url: videoUrl };
        }
        if (state === 'success' || state === 'succeeded' || state === 'completed' || state === 'done') {
          log.warn('[Vidu poll] ???????? video_url', { data: JSON.stringify(data).slice(0, 500) });
          return { error: 'Vidu ??????????' };
        }
        continue;
      }

      if (isGemini) {
        if (data.error) {
          return { error: data.error.message || 'Gemini ??????' };
        }
        if (data.done === true) {
          const videoUri = data.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
          if (videoUri) return { video_url: videoUri };
          return { error: 'Gemini ??????????????' };
        }
        continue;
      }

      if (isDashScope) {
        const taskStatus = data?.output?.task_status;
        const videoUrl = parseDashScopeVideoUrl(data);
        if (videoUrl) return { video_url: videoUrl };
        if (taskStatus === 'FAILED' || taskStatus === 'CANCELED') {
          const msg = data?.message || data?.output?.message || taskStatus;
          log.warn('DashScope ????????? download image failed????? URL ???????? localhost?', {
            video_gen_id: videoGenId,
            task_id: taskId,
            task_status: taskStatus,
            message: msg,
            output: data?.output,
          });
          return { error: msg || '????????' };
        }
        continue;
      }
      const status = extractPollTaskStatus(data);
      const videoUrl = pickProxyVideoUrl(data);
      const failMsg = extractPollFailureMessage(data);
      const errMsg = data.error && (typeof data.error === 'string' ? data.error : data.error.message);
      if (isVolcPoll) {
        const summaryJson = JSON.stringify(data);
        const sum =
          pollLogBodyMax === Infinity
            ? summaryJson
            : summaryJson.length <= pollLogBodyMax
              ? summaryJson
              : summaryJson.slice(0, pollLogBodyMax) + `... [共${summaryJson.length}字符]`;
        log.info('[poll] 方舟/火山 解析摘要', {
          video_gen_id: videoGenId,
          round: pollRound,
          top_level_status: status,
          has_video_url: !!videoUrl,
          error_hint: failMsg || errMsg || data?.error?.code || data?.message || null,
          parsed_json: sum,
        });
      }
      if (isPollTaskFailed(status) || errMsg) {
        const msg = failMsg || errMsg || status || '任务失败';
        log.warn('[poll] 任务失败', { video_gen_id: videoGenId, round: pollRound, status, msg });
        return { error: String(msg).slice(0, 500) };
      }
      if (videoUrl && isPlausibleHttpVideoUrl(videoUrl)) return { video_url: videoUrl };
      if (failMsg) {
        log.warn('[poll] 上游返回失败文案', { video_gen_id: videoGenId, round: pollRound, msg: failMsg.slice(0, 200) });
        return { error: failMsg.slice(0, 500) };
      }
    } catch (e) {
      log.warn('Video poll request failed', { attempt, error: e.message });
    }
  }
  return { error: '??????' };
}

module.exports = {
  pollVideoTask,
};