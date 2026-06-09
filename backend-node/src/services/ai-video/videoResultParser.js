function isPlausibleHttpVideoUrl(s) {
  if (typeof s !== 'string') return false;
  const t = s.trim();
  return /^https?:\/\//i.test(t);
}

function coerceHttpVideoUrl(s) {
  return isPlausibleHttpVideoUrl(s) ? String(s).trim() : null;
}

function extractPollTaskStatus(data) {
  if (!data || typeof data !== 'object') return '';
  const candidates = [
    data.status,
    data.state,
    data.task_status,
    data.data?.status,
    data.data?.state,
    data.data?.task_status,
    data.output?.task_status,
  ];
  for (const c of candidates) {
    if (c != null && String(c).trim() !== '') return String(c).trim().toLowerCase();
  }
  return '';
}

function isPollTaskFailed(status) {
  return (
    status === 'failed' ||
    status === 'failure' ||
    status === 'error' ||
    status === 'cancelled' ||
    status === 'canceled' ||
    status === 'fail'
  );
}

function extractPollFailureMessage(data) {
  if (!data || typeof data !== 'object') return '';
  const inner = data.data && typeof data.data === 'object' && !Array.isArray(data.data) ? data.data : null;
  const deep = inner?.data && typeof inner.data === 'object' ? inner.data : null;
  const candidates = [
    inner?.fail_reason,
    data.fail_reason,
    inner?.message,
    deep?.msg,
    data.error?.message,
    typeof data.error === 'string' ? data.error : null,
    data.message,
    typeof data.msg === 'string' ? data.msg : null,
  ];
  for (const c of candidates) {
    if (c == null) continue;
    const s = String(c).trim();
    if (s && !/^https?:\/\//i.test(s)) return s;
  }
  for (const rec of [inner, data]) {
    if (!rec || typeof rec !== 'object') continue;
    for (const k of ['result_url', 'video_url']) {
      const u = rec[k];
      if (typeof u === 'string' && u.trim() && !isPlausibleHttpVideoUrl(u)) return u.trim();
    }
  }
  return '';
}

function videoUrlFromRecord(rec) {
  if (!rec || typeof rec !== 'object') return null;
  return (
    coerceHttpVideoUrl(rec.video_url) ||
    coerceHttpVideoUrl(rec.result_url) ||
    coerceHttpVideoUrl(rec.url) ||
    coerceHttpVideoUrl(rec.output_url) ||
    null
  );
}

function videoUrlFromArkVideoNode(video) {
  if (!video || typeof video !== 'object') return null;
  const origin =
    video.transcoded_video && typeof video.transcoded_video === 'object' ? video.transcoded_video.origin : null;
  if (origin && typeof origin === 'object' && typeof origin.video_url === 'string') {
    const u = coerceHttpVideoUrl(origin.video_url);
    if (u) return u;
  }
  for (const k of ['download_url', 'play_url', 'url', 'video_url']) {
    const u = coerceHttpVideoUrl(video[k]);
    if (u) return u;
  }
  return null;
}

function pickVideoUrlFromItemList(list) {
  if (!Array.isArray(list) || !list.length) return null;
  const item = list[0];
  if (!item || typeof item !== 'object') return null;
  const ca = item.common_attr;
  const fromCommon =
    ca &&
    ca.transcoded_video &&
    typeof ca.transcoded_video === 'object' &&
    ca.transcoded_video.origin &&
    typeof ca.transcoded_video.origin.video_url === 'string' &&
    ca.transcoded_video.origin.video_url.trim()
      ? ca.transcoded_video.origin.video_url.trim()
      : null;
  const fromVideo = videoUrlFromArkVideoNode(item.video);
  const fromResult = coerceHttpVideoUrl(item.result_url);
  const flat = videoUrlFromRecord(item);
  return fromCommon || fromVideo || fromResult || flat || null;
}

function pickVideoUrlFromResultShape(obj) {
  if (!obj || typeof obj !== 'object') return null;
  let x = videoUrlFromRecord(obj);
  if (x) return typeof x === 'string' ? x.trim() : x;
  const inner = obj.content;
  if (inner && typeof inner === 'object') {
    x = videoUrlFromRecord(inner);
    if (x) return typeof x === 'string' ? x.trim() : x;
    const il = pickVideoUrlFromItemList(inner.item_list);
    if (il) return il;
    if (inner.video && typeof inner.video === 'object') {
      const v = videoUrlFromArkVideoNode(inner.video) || inner.video.url || inner.video.video_url;
      if (v && typeof v === 'string') return v.trim();
    }
  }
  return null;
}

function pickProxyVideoUrl(data) {
  if (!data || typeof data !== 'object') return null;
  const topList = pickVideoUrlFromItemList(data.item_list);
  if (topList) return topList;
  if (data.video && typeof data.video === 'object') {
    const vu =
      videoUrlFromArkVideoNode(data.video) ||
      coerceHttpVideoUrl(data.video.url) ||
      coerceHttpVideoUrl(data.video.video_url);
    if (vu) return vu;
  }
  let u = videoUrlFromRecord(data);
  if (u) return u;
  const d = data.data;
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    const nestedList = pickVideoUrlFromItemList(d.item_list);
    if (nestedList) return nestedList;
    u = videoUrlFromRecord(d);
    if (u) return u;
    if (d.video && typeof d.video === 'object') {
      const dv =
        videoUrlFromArkVideoNode(d.video) ||
        coerceHttpVideoUrl(d.video.url) ||
        coerceHttpVideoUrl(d.video.video_url);
      if (dv) return dv;
    }
    if (d.result && typeof d.result === 'object') {
      const dr = pickVideoUrlFromResultShape(d.result);
      if (dr) return dr;
    }
  }
  const r = data.result;
  if (r && typeof r === 'object') {
    const pr = pickVideoUrlFromResultShape(r);
    if (pr) return pr;
  }
  const c = data.content;
  if (c && typeof c === 'object') {
    const cl = pickVideoUrlFromItemList(c.item_list);
    if (cl) return cl;
    u = videoUrlFromRecord(c);
    if (u) return u;
    if (c.video && typeof c.video === 'object') {
      const cv =
        videoUrlFromArkVideoNode(c.video) ||
        coerceHttpVideoUrl(c.video.url) ||
        coerceHttpVideoUrl(c.video.video_url);
      if (cv) return cv;
    }
  }
  for (const k of ['videos', 'generations', 'works']) {
    const arr = data[k];
    if (Array.isArray(arr) && arr[0]) {
      u = videoUrlFromRecord(arr[0]);
      if (u) return u;
      const res = arr[0].resource;
      if (res && res.resource) return res.resource;
    }
  }
  if (Array.isArray(d) && d[0]) {
    u = videoUrlFromRecord(d[0]);
    if (u) return u;
  }
  return null;
}

function parseDashScopeVideoUrl(data) {
  const out = data?.output;
  if (!out) return null;
  let u = videoUrlFromRecord(out);
  if (u) return u;
  if (out.output && typeof out.output === 'object') {
    u = videoUrlFromRecord(out.output);
    if (u) return u;
  }
  const results = out.results || out.result;
  if (Array.isArray(results) && results[0]) {
    const rec = results[0];
    u = videoUrlFromRecord(rec);
    if (u) return u;
    if (rec.output && typeof rec.output === 'object') {
      u = videoUrlFromRecord(rec.output);
      if (u) return u;
    }
  }
  const choices = out.choices;
  if (Array.isArray(choices) && choices[0]) {
    const c = choices[0];
    const msg = c?.message?.content || c?.content;
    if (Array.isArray(msg)) {
      for (const m of msg) {
        if (m) {
          u = videoUrlFromRecord(m);
          if (u) return u;
        }
      }
    }
  }
  return null;
}

module.exports = {
  isPlausibleHttpVideoUrl,
  coerceHttpVideoUrl,
  extractPollTaskStatus,
  isPollTaskFailed,
  extractPollFailureMessage,
  videoUrlFromRecord,
  videoUrlFromArkVideoNode,
  pickVideoUrlFromItemList,
  pickVideoUrlFromResultShape,
  pickProxyVideoUrl,
  parseDashScopeVideoUrl,
};
