const aiConfigService = require('../../aiConfigService');
const { postJSONWithTimeout } = require('../../aiClient');
const { resolveImageRef } = require('../imageRefResolver');

const IMAGE_HTTP_TIMEOUT_MS = 900000;
const SEEDREAM_MIN_PIXELS = 3686400;

function buildImageUrl(config) {
  const base = (config.base_url || '').replace(/\/$/, '');
  let ep = config.endpoint || '/images/generations';
  if (!ep.startsWith('/')) ep = '/' + ep;
  return base + ep;
}

function fixSeedreamSize(size) {
  if (!size || typeof size !== 'string') return '1920x1920';
  const s = size.trim().toLowerCase().replace(/\*/g, 'x');
  const match = s.match(/^(\d+)\s*x\s*(\d+)$/);
  if (!match) return '1920x1920';

  let w = parseInt(match[1], 10);
  let h = parseInt(match[2], 10);
  if (!w || !h) return '1920x1920';

  const pixels = w * h;
  if (pixels >= SEEDREAM_MIN_PIXELS) return `${w}x${h}`;

  const scale = Math.sqrt(SEEDREAM_MIN_PIXELS / pixels);
  w = Math.ceil((w * scale) / 64) * 64;
  h = Math.ceil((h * scale) / 64) * 64;

  if (w * h < SEEDREAM_MIN_PIXELS) {
    w += 64;
    h += 64;
  }

  return `${w}x${h}`;
}

function parseOpenAiCompatibleImageResponse(data) {
  const item = data?.data && data.data[0];
  let imageUrl = item && (item.url || item.image_url);
  if (!imageUrl && item?.b64_json) {
    imageUrl = `data:image/png;base64,${String(item.b64_json).replace(/\s/g, '')}`;
  }
  if (!imageUrl && Array.isArray(data?.images) && data.images.length > 0) {
    const first = data.images[0];
    if (typeof first === 'string' && first.length > 0) {
      imageUrl = first.startsWith('data:') ? first : `data:image/png;base64,${first.replace(/\s/g, '')}`;
    }
  }
  return imageUrl || null;
}

async function callOpenAiCompatibleImageApi(db, config, log, opts) {
  const {
    prompt,
    model,
    size,
    quality,
    image_gen_id,
    reference_image_urls,
    files_base_url,
    storage_local_path,
    protocol,
    negative_prompt,
  } = opts;
  const url = buildImageUrl(config);
  const isVolc = protocol === 'volcengine';
  const isSeedream = isVolc || /seedream|doubao/i.test(model);
  const rawRefs = Array.isArray(reference_image_urls) ? reference_image_urls.filter(Boolean) : [];
  const resolvedRefs = rawRefs.map((r) => resolveImageRef(r, files_base_url, storage_local_path)).filter(Boolean);
  if (resolvedRefs.length > 0) {
    log.info('Image API request with reference images', {
      url: url.slice(0, 60), model, image_gen_id,
      ref_count: resolvedRefs.length,
      ref_types: resolvedRefs.map((r) => (r.startsWith('data:') ? 'base64' : 'url')),
    });
  }

  const effectiveSize = (isSeedream && size) ? fixSeedreamSize(size) : size;
  const body = {
    model,
    prompt,
    ...(!isSeedream ? { n: 1 } : {}),
    ...(effectiveSize ? { size: effectiveSize } : {}),
    ...(quality ? { quality } : {}),
    ...((isVolc || isSeedream) ? { watermark: false } : {}),
    ...(negative_prompt ? { negative_prompt } : {}),
    ...(resolvedRefs.length > 0 ? { image: resolvedRefs } : {}),
  };
  log.info('Image API request', {
    url: url.slice(0, 60),
    model,
    image_gen_id,
    has_ref_images: resolvedRefs.length > 0,
    size: effectiveSize,
    original_size: size !== effectiveSize ? size : undefined,
  });
  const headers = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + (config.api_key || ''),
  };
  let raw;
  let httpStatus;
  try {
    const timeoutMs = aiConfigService.getRequestTimeoutMsForConfig(db, config, 'image', model, IMAGE_HTTP_TIMEOUT_MS);
    const out = await postJSONWithTimeout(url, headers, body, timeoutMs);
    httpStatus = out.statusCode;
    raw = out.raw;
  } catch (e) {
    log.error('Image API network error', { image_gen_id, error: e.message, url: url.slice(0, 80) });
    return { error: e.message && e.message.includes('timeout')
      ? e.message
      : ('图片生成网络请求失败: ' + e.message) };
  }
  if (httpStatus < 200 || httpStatus >= 300) {
    log.error('Image API failed', { status: httpStatus, body: raw.slice(0, 300) });
    let errMsg = '图片生成请求失败: ' + httpStatus;
    try {
      const errJson = JSON.parse(raw);
      const msg = errJson.error?.message || errJson.message || errJson.error;
      if (msg) errMsg += ' - ' + (typeof msg === 'string' ? msg : JSON.stringify(msg).slice(0, 200));
    } catch (_) {
      if (raw && raw.length) errMsg += ' - ' + raw.slice(0, 200);
    }
    return { error: errMsg };
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    log.warn('Image API response parse error', { image_gen_id, raw_preview: raw.slice(0, 200) });
    return { error: '图片生成返回格式异常' };
  }

  const imageUrl = parseOpenAiCompatibleImageResponse(data);
  if (!imageUrl) {
    log.warn('Image API no image URL in response', {
      image_gen_id,
      model,
      response_keys: data ? Object.keys(data) : [],
      data_preview: data ? JSON.stringify(data).slice(0, 500) : '',
      has_data_array: !!(data.data && Array.isArray(data.data)),
      first_item_keys: (data.data && data.data[0]) ? Object.keys(data.data[0]) : [],
    });
    return { error: '未返回图片地址' };
  }
  return { image_url: imageUrl };
}

module.exports = {
  callOpenAiCompatibleImageApi,
  _test: {
    buildImageUrl,
    fixSeedreamSize,
    parseOpenAiCompatibleImageResponse,
  },
};
