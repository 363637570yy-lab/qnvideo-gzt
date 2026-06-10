const aiConfigService = require('../../aiConfigService');
const { openAiGptImageSize } = require('../../projectMediaSpec');
const { resolveImageRef, dataUrlToBlobParts } = require('../imageRefResolver');

const DEFAULT_IMAGE_HTTP_TIMEOUT_MS = 900000;
const DEFAULT_RESPONSES_IMAGE_TOOL_MODEL = 'gpt-image-2';

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseImageSettings(config) {
  let settings = {};
  try {
    settings = config?.settings ? (typeof config.settings === 'string' ? JSON.parse(config.settings) : config.settings) : {};
  } catch (_) {
    settings = {};
  }
  return settings.image && typeof settings.image === 'object' ? settings.image : settings;
}

function normalizeGptImageQuality(value) {
  const q = String(value || 'auto').toLowerCase();
  return ['auto', 'low', 'medium', 'high'].includes(q) ? q : 'auto';
}

function normalizeGptImageOutputFormat(value) {
  const f = String(value || 'png').toLowerCase();
  return ['png', 'jpeg', 'webp'].includes(f) ? f : 'png';
}

function isGptImage2Model(model) {
  return /^gpt-image-2(?:$|-)/i.test(String(model || '').trim());
}

function normalizeGptImageBackground(value, model) {
  if (value == null || value === '') return null;
  const background = String(value).trim().toLowerCase();
  if (!['transparent', 'opaque', 'auto'].includes(background)) return null;
  if (background === 'transparent' && isGptImage2Model(model)) return null;
  return background;
}

function normalizeGptImageApiMode(value) {
  const s = String(value || 'images').trim().toLowerCase().replace(/[\s_-]+/g, '_');
  if (['response', 'responses', 'responses_api', 'v1_responses', '/v1/responses'].includes(s)) return 'responses';
  return 'images';
}

function resolveGptImageApiMode(settings = {}) {
  return normalizeGptImageApiMode(
    settings.api_mode ??
    settings.apiMode ??
    settings.api_interface ??
    settings.apiInterface ??
    settings.endpoint_mode ??
    settings.endpointMode
  );
}

function resolveResponsesImageToolModel(settings = {}) {
  return String(
    settings.tool_model ||
    settings.toolModel ||
    settings.image_model ||
    settings.imageModel ||
    settings.gpt_image_model ||
    DEFAULT_RESPONSES_IMAGE_TOOL_MODEL
  ).trim() || DEFAULT_RESPONSES_IMAGE_TOOL_MODEL;
}

function shouldSendResponsesImageToolModel(protocol, settings = {}) {
  if (settings.send_tool_model != null || settings.sendToolModel != null) {
    return boolSetting(settings.send_tool_model ?? settings.sendToolModel, true);
  }
  return String(protocol || '').toLowerCase() === 'cliproxy_gpt_image2';
}

function boolSetting(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (value == null || value === '') return fallback;
  const s = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return fallback;
}

function normalizeGptImagePartialImages(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(3, Math.max(0, Math.trunc(n)));
}

function normalizeGptImagePartialImagesWithDefault(value, fallback = 1) {
  if (value == null || value === '') return normalizeGptImagePartialImages(fallback);
  return normalizeGptImagePartialImages(value);
}

function asImageDataUrl(value, outputFormat) {
  const s = String(value || '').trim();
  if (!s) return null;
  if (/^data:/i.test(s) || /^https?:\/\//i.test(s)) return s;
  return `data:image/${outputFormat};base64,${s.replace(/\s/g, '')}`;
}

function parseOpenAiImageItem(item, outputFormat) {
  if (!item) return null;
  if (typeof item === 'string') return asImageDataUrl(item, outputFormat);
  if (Array.isArray(item)) {
    for (const child of item) {
      const parsed = parseOpenAiImageItem(child, outputFormat);
      if (parsed) return parsed;
    }
    return null;
  }
  if (typeof item !== 'object') return null;
  const imageUrlObject = item.image_url && typeof item.image_url === 'object' ? item.image_url : null;
  const direct =
    item.url ||
    imageUrlObject?.url ||
    (typeof item.image_url === 'string' ? item.image_url : '') ||
    item.b64_json ||
    item.base64 ||
    item.image_base64 ||
    item.partial_image_b64;
  if (direct) return asImageDataUrl(direct, outputFormat);
  if (item.result) return parseOpenAiImageItem(item.result, outputFormat);
  return null;
}

function parseOpenAiImageResponse(data, outputFormat) {
  if (!data) return null;
  const direct = parseOpenAiImageItem(data, outputFormat);
  if (direct) return direct;
  if (data.response) {
    const parsed = parseOpenAiImageResponse(data.response, outputFormat);
    if (parsed) return parsed;
  }
  for (const key of ['data', 'output', 'images']) {
    const arr = data?.[key];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const parsed = parseOpenAiImageItem(item, outputFormat) || parseOpenAiImageResponse(item, outputFormat);
      if (parsed) return parsed;
    }
  }
  return null;
}

function extractOpenAiImageUsage(data) {
  if (!data || typeof data !== 'object') return null;
  const usage = data.usage && typeof data.usage === 'object' ? data.usage : null;
  if (usage) {
    return {
      input_tokens: usage.input_tokens ?? usage.prompt_tokens ?? null,
      output_tokens: usage.output_tokens ?? usage.completion_tokens ?? null,
      total_tokens: usage.total_tokens ?? null,
      image_count: usage.image_count ?? usage.images ?? null,
      raw: usage,
    };
  }
  if (data.response) {
    const parsed = extractOpenAiImageUsage(data.response);
    if (parsed) return parsed;
  }
  for (const key of ['data', 'output', 'images']) {
    const arr = data?.[key];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const parsed = extractOpenAiImageUsage(item);
      if (parsed) return parsed;
    }
  }
  return null;
}

function parseOpenAiSseDataBlocks(raw) {
  const events = [];
  const chunks = String(raw || '').split(/\r?\n\r?\n/);
  for (const chunk of chunks) {
    const dataText = chunk
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.replace(/^data:\s?/, ''))
      .join('\n')
      .trim();
    if (!dataText || dataText === '[DONE]') continue;
    try {
      const event = JSON.parse(dataText);
      if (event && typeof event === 'object') events.push(event);
    } catch (_) {
      // Ignore malformed keep-alive or proxy diagnostic frames.
    }
  }
  return events;
}

function parseOpenAiImageStreamResponse(raw, outputFormat) {
  return parseOpenAiImageStreamResult(raw, outputFormat).image_url;
}

function parseOpenAiImageStreamResult(raw, outputFormat) {
  let finalImage = null;
  let lastPartialImage = null;
  let usage = null;
  const events = parseOpenAiSseDataBlocks(raw);
  for (const event of events) {
    usage = usage || extractOpenAiImageUsage(event);
    const type = String(event?.type || '');
    if (
      type === 'image_generation.partial_image' ||
      type === 'image_edit.partial_image' ||
      type === 'response.image_generation_call.partial_image'
    ) {
      lastPartialImage = parseOpenAiImageItem(event, outputFormat) || lastPartialImage;
      continue;
    }
    if (event?.object === 'image.generation.result' || event?.object === 'image.edit.result') {
      finalImage = parseOpenAiImageResponse(event, outputFormat) || finalImage;
      continue;
    }
    if (type === 'image_generation.completed' || type === 'image_edit.completed') {
      finalImage = parseOpenAiImageResponse(event, outputFormat) || finalImage;
      continue;
    }
    if (type === 'response.output_item.done' && event.item) {
      finalImage = parseOpenAiImageItem(event.item, outputFormat) || finalImage;
      continue;
    }
    if (type === 'response.completed' && event.response) {
      finalImage = parseOpenAiImageResponse(event.response, outputFormat) || finalImage;
      continue;
    }
    if (event?.response) {
      finalImage = parseOpenAiImageResponse(event.response, outputFormat) || finalImage;
    }
  }
  return { image_url: finalImage || lastPartialImage, usage };
}

function createResponsesInput(prompt, resolvedRefs = []) {
  const text = String(prompt || '');
  if (!Array.isArray(resolvedRefs) || resolvedRefs.length === 0) return text;
  return [
    {
      role: 'user',
      content: [
        { type: 'input_text', text },
        ...resolvedRefs
          .filter(Boolean)
          .map((url) => ({ type: 'input_image', image_url: url })),
      ],
    },
  ];
}

function buildResponsesImageBody({
  model,
  prompt,
  resolvedRefs,
  protocol,
  settings,
  commonFields,
  outputFormat,
  compression,
  streamImages,
  partialImages,
}) {
  const toolModel = resolveResponsesImageToolModel(settings);
  const tool = {
    type: 'image_generation',
    action: resolvedRefs.length > 0 ? 'edit' : 'generate',
    size: commonFields.size,
    output_format: outputFormat,
    moderation: commonFields.moderation,
  };
  if (shouldSendResponsesImageToolModel(protocol, settings)) {
    tool.model = toolModel;
  }
  if (commonFields.quality != null) tool.quality = commonFields.quality;
  if (commonFields.background != null) tool.background = commonFields.background;
  if ((outputFormat === 'jpeg' || outputFormat === 'webp') && Number.isFinite(compression)) {
    tool.output_compression = commonFields.output_compression;
  }
  if (streamImages) {
    tool.partial_images = partialImages;
  }

  const body = {
    model,
    input: createResponsesInput(prompt, resolvedRefs),
    tools: [tool],
    tool_choice: { type: 'image_generation' },
  };
  if (streamImages) body.stream = true;
  return { body, toolModel, action: tool.action, toolModelSent: tool.model != null };
}

function formatImageHttpError(raw, status) {
  let errMsg = `图片生成请求失败: HTTP ${status}`;
  try {
    const errJson = JSON.parse(raw);
    const msg = errJson.error?.message || errJson.message || errJson.error;
    if (msg) errMsg += ' - ' + (typeof msg === 'string' ? msg : JSON.stringify(msg).slice(0, 200));
  } catch (_) {
    if (raw) errMsg += ' - ' + raw.slice(0, 200);
  }
  return errMsg;
}

async function readResponseTextWithMetrics(res, log, label, imageGenId, startedAt) {
  if (!res.body || typeof res.body.getReader !== 'function') {
    const text = await res.text();
    log.info(`[${label}] response read`, {
      image_gen_id: imageGenId,
      status: res.status,
      total_ms: Date.now() - startedAt,
      response_chars: text.length,
      stream_reader: false,
    });
    return text;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parts = [];
  let bytes = 0;
  let first_byte_ms = null;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (first_byte_ms == null) first_byte_ms = Date.now() - startedAt;
    bytes += value?.byteLength || 0;
    parts.push(decoder.decode(value, { stream: true }));
  }
  parts.push(decoder.decode());
  const text = parts.join('');
  log.info(`[${label}] response read`, {
    image_gen_id: imageGenId,
    status: res.status,
    first_byte_ms,
    total_ms: Date.now() - startedAt,
    response_bytes: bytes,
    response_chars: text.length,
    stream_reader: true,
  });
  return text;
}

async function callOpenAiGptImageApi(db, config, log, opts) {
  const { prompt, model, size, quality, image_gen_id, reference_image_urls, files_base_url, storage_local_path } = opts;
  const base = (config.base_url || 'https://api.openai.com/v1').replace(/\/$/, '');
  const settings = parseImageSettings(config);
  const protocol = String(opts.protocol || config.api_protocol || 'openai_gpt_image').toLowerCase();
  const apiMode = resolveGptImageApiMode(settings);
  const isCliProxyGptImage2 = protocol === 'cliproxy_gpt_image2';
  const logLabel = isCliProxyGptImage2 ? 'CLIProxyAPI GPT Image2' : 'OpenAI GPT Image';
  const outputFormat = normalizeGptImageOutputFormat(settings.output_format);
  const compression = Number(settings.output_compression);
  const codexCompat = isCliProxyGptImage2 || settings.codex_compat === true || settings.codex_cli_compat === true;
  const requestTimeoutMs = aiConfigService.getRequestTimeoutMsForConfig(db, config, 'image', model, DEFAULT_IMAGE_HTTP_TIMEOUT_MS);
  const sizeMode = settings.size_mode || settings.openai_size_mode || 'direct';
  const resolvedSize = openAiGptImageSize(size, sizeMode);
  const streamImages = boolSetting(settings.stream_images ?? settings.streamImages ?? settings.stream, true);
  const partialImages = normalizeGptImagePartialImagesWithDefault(
    settings.partial_images ?? settings.streamPartialImages,
    isCliProxyGptImage2 ? 0 : 1,
  );
  const sendQuality = !codexCompat || boolSetting(settings.send_quality ?? settings.sendQuality, false);
  const background = normalizeGptImageBackground(settings.background, model);
  const commonFields = {
    model,
    prompt: codexCompat
      ? `Use the following text as the complete prompt. Do not rewrite it:\n${prompt || ''}`
      : (prompt || ''),
    size: resolvedSize,
    output_format: outputFormat,
    moderation: settings.moderation === 'low' ? 'low' : 'auto',
  };
  if (sendQuality) {
    commonFields.quality = normalizeGptImageQuality(quality || settings.quality);
  }
  if (streamImages) {
    commonFields.stream = true;
    commonFields.partial_images = partialImages;
  }
  if (background) {
    commonFields.background = background;
  }
  if ((outputFormat === 'jpeg' || outputFormat === 'webp') && Number.isFinite(compression)) {
    commonFields.output_compression = Math.min(100, Math.max(0, Math.trunc(compression)));
  }
  if (!codexCompat && Number(settings.n) > 1) {
    commonFields.n = Math.min(10, Math.max(1, Math.trunc(Number(settings.n))));
  }

  const rawRefs = Array.isArray(reference_image_urls) ? reference_image_urls.filter(Boolean) : [];
  const resolvedRefs = rawRefs.map((r) => resolveImageRef(r, files_base_url, storage_local_path)).filter(Boolean);
  if (apiMode === 'responses') {
    const endpoint = '/responses';
    const url = base + endpoint;
    const { body, toolModel, action, toolModelSent } = buildResponsesImageBody({
      model,
      prompt: commonFields.prompt,
      resolvedRefs,
      protocol,
      settings,
      commonFields,
      outputFormat,
      compression,
      streamImages,
      partialImages,
    });
    const startedAt = Date.now();
    log.info(`[${logLabel}] request`, {
      image_gen_id,
      model,
      protocol,
      api_mode: apiMode,
      endpoint,
      tool_model: toolModelSent ? toolModel : null,
      action,
      size: resolvedSize,
      size_mode: sizeMode,
      product_size: size,
      output_format: outputFormat,
      codex_compat: codexCompat,
      quality_sent: commonFields.quality != null,
      stream: streamImages,
      partial_images: streamImages ? partialImages : undefined,
      ref_count: resolvedRefs.length,
      background_sent: commonFields.background || null,
      prompt_len: String(prompt || '').length,
    });

    let raw;
    let status;
    let contentType = '';
    try {
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + (config.api_key || ''),
        },
        body: JSON.stringify(body),
      }, requestTimeoutMs);
      status = res.status;
      contentType = res.headers.get('content-type') || '';
      raw = await readResponseTextWithMetrics(res, log, logLabel, image_gen_id, startedAt);
    } catch (e) {
      const msg = e.name === 'AbortError' ? `Image generation HTTP timeout after ${requestTimeoutMs}ms` : e.message;
      log.error(`[${logLabel}] network error`, { image_gen_id, error: msg, total_ms: Date.now() - startedAt });
      return { error: msg };
    }

    if (status < 200 || status >= 300) {
      return { error: formatImageHttpError(raw, status) };
    }

    let imageUrl = null;
    let usage = null;
    if (contentType.toLowerCase().includes('text/event-stream')) {
      const parsed = parseOpenAiImageStreamResult(raw, outputFormat);
      imageUrl = parsed.image_url;
      usage = parsed.usage;
    } else {
      let data;
      try {
        data = JSON.parse(raw);
      } catch (_) {
        return { error: '图片生成返回格式异常' };
      }
      imageUrl = parseOpenAiImageResponse(data, outputFormat);
      usage = extractOpenAiImageUsage(data);
    }
    if (!imageUrl) return { error: '未返回图片地址' };
    log.info(`[${logLabel}] parsed image`, {
      image_gen_id,
      content_type: contentType,
      total_ms: Date.now() - startedAt,
      image_url_len: String(imageUrl || '').length,
    });
    return {
      image_url: imageUrl,
      usage,
      diagnostics: {
        content_type: contentType,
        stream_response: contentType.toLowerCase().includes('text/event-stream'),
        response_chars: raw ? raw.length : 0,
      },
      actual_params: {
        protocol,
        api_mode: apiMode,
        endpoint,
        model,
        tool_model: toolModelSent ? toolModel : null,
        action,
        size: resolvedSize,
        size_mode: sizeMode,
        product_size: size || null,
        output_format: outputFormat,
        quality: commonFields.quality,
        background: commonFields.background,
        stream: streamImages,
        partial_images: streamImages ? partialImages : undefined,
      },
    };
  }
  const endpoint = resolvedRefs.length > 0 ? '/images/edits' : '/images/generations';
  const url = base + endpoint;

  const startedAt = Date.now();
  log.info(`[${logLabel}] request`, {
    image_gen_id,
    model,
    protocol,
    api_mode: apiMode,
    endpoint,
    size: resolvedSize,
    size_mode: sizeMode,
    product_size: size,
    output_format: outputFormat,
    codex_compat: codexCompat,
    quality_sent: commonFields.quality != null,
    stream: streamImages,
    partial_images: streamImages ? partialImages : undefined,
    ref_count: resolvedRefs.length,
    background_sent: commonFields.background || null,
    input_fidelity_requested: settings.input_fidelity || null,
    prompt_len: String(prompt || '').length,
  });

  let raw;
  let status;
  let contentType = '';
  try {
    if (resolvedRefs.length === 0) {
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + (config.api_key || ''),
        },
        body: JSON.stringify(commonFields),
      }, requestTimeoutMs);
      status = res.status;
      contentType = res.headers.get('content-type') || '';
      raw = await readResponseTextWithMetrics(res, log, logLabel, image_gen_id, startedAt);
    } else {
      const form = new FormData();
      Object.entries(commonFields).forEach(([key, value]) => {
        if (value != null) form.append(key, String(value));
      });
      if (
        !isGptImage2Model(model) &&
        settings.input_fidelity &&
        ['high', 'low'].includes(String(settings.input_fidelity))
      ) {
        form.append('input_fidelity', String(settings.input_fidelity));
      }
      for (let i = 0; i < resolvedRefs.length; i += 1) {
        const ref = resolvedRefs[i];
        if (ref.startsWith('data:')) {
          const parts = dataUrlToBlobParts(ref);
          if (!parts) continue;
          const blob = new Blob([parts.buffer], { type: parts.mime });
          const ext = parts.mime.includes('webp') ? 'webp' : parts.mime.includes('jpeg') ? 'jpg' : 'png';
          form.append('image[]', blob, `reference_${i}.${ext}`);
        } else if (/^https?:\/\//i.test(ref)) {
          const imgRes = await fetchWithTimeout(ref, { method: 'GET' }, requestTimeoutMs);
          if (!imgRes.ok) throw new Error(`参考图下载失败 HTTP ${imgRes.status}`);
          const mime = imgRes.headers.get('content-type') || 'image/png';
          const blob = new Blob([Buffer.from(await imgRes.arrayBuffer())], { type: mime });
          const ext = mime.includes('webp') ? 'webp' : mime.includes('jpeg') ? 'jpg' : 'png';
          form.append('image[]', blob, `reference_${i}.${ext}`);
        }
      }
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + (config.api_key || '') },
        body: form,
      }, requestTimeoutMs);
      status = res.status;
      contentType = res.headers.get('content-type') || '';
      raw = await readResponseTextWithMetrics(res, log, logLabel, image_gen_id, startedAt);
    }
  } catch (e) {
    const msg = e.name === 'AbortError' ? `Image generation HTTP timeout after ${requestTimeoutMs}ms` : e.message;
    log.error(`[${logLabel}] network error`, { image_gen_id, error: msg, total_ms: Date.now() - startedAt });
    return { error: msg };
  }

  if (status < 200 || status >= 300) {
    return { error: formatImageHttpError(raw, status) };
  }

  let imageUrl = null;
  let usage = null;
  if (contentType.toLowerCase().includes('text/event-stream')) {
    const parsed = parseOpenAiImageStreamResult(raw, outputFormat);
    imageUrl = parsed.image_url;
    usage = parsed.usage;
  } else {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (_) {
      return { error: '图片生成返回格式异常' };
    }
    imageUrl = parseOpenAiImageResponse(data, outputFormat);
    usage = extractOpenAiImageUsage(data);
  }
  if (!imageUrl) return { error: '未返回图片地址' };
  log.info(`[${logLabel}] parsed image`, {
    image_gen_id,
    content_type: contentType,
    total_ms: Date.now() - startedAt,
    image_url_len: String(imageUrl || '').length,
  });
  return {
    image_url: imageUrl,
    usage,
    diagnostics: {
      content_type: contentType,
      stream_response: contentType.toLowerCase().includes('text/event-stream'),
      response_chars: raw ? raw.length : 0,
    },
    actual_params: {
      protocol,
      api_mode: apiMode,
      endpoint,
      model,
      size: resolvedSize,
      size_mode: sizeMode,
      product_size: size || null,
      output_format: outputFormat,
      quality: commonFields.quality,
      background: commonFields.background,
      stream: streamImages,
      partial_images: streamImages ? partialImages : undefined,
    },
  };
}

module.exports = {
  callOpenAiGptImageApi,
  _test: {
    parseOpenAiImageResponse,
    parseOpenAiImageStreamResponse,
    parseOpenAiImageStreamResult,
    extractOpenAiImageUsage,
    normalizeGptImagePartialImagesWithDefault,
    normalizeGptImageBackground,
    normalizeGptImageApiMode,
    buildResponsesImageBody,
  },
};
