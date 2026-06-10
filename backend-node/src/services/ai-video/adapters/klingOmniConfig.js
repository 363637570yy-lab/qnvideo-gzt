const {
  signKlingOfficialJwt,
  normalizeKlingCredential,
  unsafeDecodeKlingJwtPayload,
  jwtPartLengths,
} = require('../../klingJwt');
/** 可灵 Omni / 多图生视频（飞儿 ffir.cn 等中转）：可用环境变量临时覆盖配置 */
function applyKlingOmniEnvOverrides(config) {
  const c = { ...config };
  if (process.env.KLING_FFIR_BASE_URL) {
    c.base_url = String(process.env.KLING_FFIR_BASE_URL).replace(/\/$/, '');
  }
  if (process.env.KLING_FFIR_API_KEY) {
    c.api_key = process.env.KLING_FFIR_API_KEY;
  }
  if (process.env.KLING_FFIR_CREATE_PATH) {
    c.endpoint = process.env.KLING_FFIR_CREATE_PATH.startsWith('/')
      ? process.env.KLING_FFIR_CREATE_PATH
      : '/' + process.env.KLING_FFIR_CREATE_PATH;
  }
  if (process.env.KLING_FFIR_QUERY_PATH) {
    c.query_endpoint = process.env.KLING_FFIR_QUERY_PATH;
  }
  if (process.env.KLING_OFFICIAL_ACCESS_KEY) {
    c._kling_official_access_key = process.env.KLING_OFFICIAL_ACCESS_KEY;
  }
  if (process.env.KLING_OFFICIAL_SECRET_KEY) {
    c._kling_official_secret_key = process.env.KLING_OFFICIAL_SECRET_KEY;
  }
  if (process.env.KLING_OFFICIAL_BASE_URL) {
    c.base_url = String(process.env.KLING_OFFICIAL_BASE_URL).replace(/\/$/, '');
  }
  return c;
}

function parseConfigSettingsJson(config) {
  if (!config) return {};
  const raw = config.settings;
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  try {
    return JSON.parse(raw);
  } catch (_) {
    return {};
  }
}

/** SecretKey 是否按 Base64 解码后再参与 HS256（部分控制台给出的 Secret 为 Base64 串） */
function resolveKlingSecretKeyBase64Flag(cfg) {
  const s = parseConfigSettingsJson(cfg);
  if (s.kling_secret_key_base64 === true || s.kling_secret_key_base64 === 1) return true;
  if (String(s.kling_secret_key_base64 || '').toLowerCase() === 'true') return true;
  const env = String(process.env.KLING_SECRET_KEY_BASE64 || '').toLowerCase();
  if (env === '1' || env === 'true' || env === 'yes') return true;
  return false;
}

/**
 * 官方 AccessKey+SecretKey → JWT；否则 api_key 视为 Bearer Token（中转站）
 */
function resolveKlingOmniBearerToken(cfg, log) {
  const s = parseConfigSettingsJson(cfg);
  const ak = normalizeKlingCredential(
    s.kling_access_key || s.access_key || cfg._kling_official_access_key || ''
  );
  const sk = normalizeKlingCredential(
    s.kling_secret_key || s.secret_key || cfg._kling_official_secret_key || ''
  );
  if (ak && sk) {
    try {
      const useB64 = resolveKlingSecretKeyBase64Flag(cfg);
      const token = signKlingOfficialJwt(ak, sk, {
        secretEncoding: useB64 ? 'base64' : 'utf8',
      });
      log.info('[KlingOmni] 鉴权：官方 AK/SK → JWT（HS256，payload: iss+exp+nbf）', {
        secret_key_hmac_input: useB64 ? 'base64_decoded_bytes' : 'utf8_string',
      });
      return token;
    } catch (e) {
      log.warn('[KlingOmni] JWT 生成失败', { message: e.message });
      return null;
    }
  }
  let bearer = normalizeKlingCredential(cfg.api_key || '');
  if (/^bearer\s+/i.test(bearer)) bearer = bearer.replace(/^bearer\s+/i, '');
  if (bearer) log.info('[KlingOmni] 鉴权：Bearer Token（api_key，预签 JWT 或中转 Key）');
  return bearer || null;
}

/** 便于排查 401：不打印 Secret、不打印完整 JWT */
function logKlingOmniAuthDebug(cfg, bearerToken, log) {
  if (!bearerToken || !log?.info) return;
  const s = parseConfigSettingsJson(cfg);
  const ak = normalizeKlingCredential(
    s.kling_access_key || s.access_key || cfg._kling_official_access_key || ''
  );
  const sk = normalizeKlingCredential(
    s.kling_secret_key || s.secret_key || cfg._kling_official_secret_key || ''
  );
  const now = Math.floor(Date.now() / 1000);
  if (ak && sk) {
    const payload = unsafeDecodeKlingJwtPayload(bearerToken);
    const lens = jwtPartLengths(bearerToken);
    log.info('[KlingOmni] 鉴权调试（无密钥/无完整 token）', {
      mode: 'official_jwt',
      secret_key_hmac_input: resolveKlingSecretKeyBase64Flag(cfg) ? 'base64_decoded_bytes' : 'utf8_string',
      access_key_len: ak.length,
      access_key_hint: ak.length <= 8 ? '****' : `${ak.slice(0, 4)}...${ak.slice(-4)}`,
      secret_key_len: sk.length,
      jwt_parts_b64url_len: lens,
      jwt_payload_decoded: payload
        ? { iss: payload.iss, exp: payload.exp, nbf: payload.nbf, iat: payload.iat }
        : null,
      server_time_unix: now,
      nbf_ok: payload && typeof payload.nbf === 'number' ? now >= payload.nbf : null,
      exp_ok: payload && typeof payload.exp === 'number' ? now < payload.exp : null,
    });
    return;
  }
  log.info('[KlingOmni] 鉴权调试（无密钥/无完整 token）', {
    mode: 'bearer_api_key',
    token_len: bearerToken.length,
    looks_like_jwt: /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(bearerToken),
  });
}

/** 未填 base_url：官方凭据 → api-beijing.klingai.com；否则 ffir 中转默认 */
function resolveKlingOmniBaseUrl(cfg) {
  const b = (cfg.base_url || '').toString().replace(/\/$/, '').trim();
  if (b) return b;
  const s = parseConfigSettingsJson(cfg);
  const hasOfficial =
    ((s.kling_access_key || s.access_key) && (s.kling_secret_key || s.secret_key)) ||
    (cfg._kling_official_access_key && cfg._kling_official_secret_key);
  return hasOfficial ? 'https://api-beijing.klingai.com' : 'https://ffir.cn';
}

const KLING_OMNI_PROXY_CREATE = '/kling/v1/videos/omni-video';
const KLING_OMNI_PROXY_QUERY = '/kling/v1/images/omni-image/{taskId}';
const KLING_OMNI_OFFICIAL_CREATE = '/v1/videos/omni-video';
const KLING_OMNI_OFFICIAL_QUERY = '/v1/videos/omni-video/{taskId}';

/** Omni-Video 文档支持的 aspect_ratio；有参考图时也必须传，否则接口易默认 16:9 */
const KLING_OMNI_ASPECT_RATIOS = new Set(['9:16', '16:9', '1:1', '4:3', '3:4', '3:2', '2:3']);

/**
 * 归一化前端/元数据里的画幅字符串，便于命中可灵枚举（全角冒号、别名等）
 * @returns {string|null} 可灵支持的比值，无法识别时返回 null
 */
function normalizeAspectRatioForApi(raw) {
  if (raw == null) return null;
  let s = String(raw)
    .trim()
    .replace(/\uFF1A/g, ':')
    .replace(/[×xX＊*]/g, ':')
    .replace(/\s+/g, '');
  if (!s) return null;
  const lower = s.toLowerCase();
  const aliases = {
    portrait: '9:16',
    landscape: '16:9',
    square: '1:1',
    vertical: '9:16',
    horizontal: '16:9',
  };
  if (aliases[lower]) s = aliases[lower];
  return KLING_OMNI_ASPECT_RATIOS.has(s) ? s : null;
}

function resolveKlingOmniAspectRatio(aspect_ratio, log, video_gen_id) {
  const normalized = normalizeAspectRatioForApi(aspect_ratio);
  if (normalized) return normalized;
  const raw = aspect_ratio != null ? String(aspect_ratio).trim() : '';
  if (raw) {
    log.warn('[KlingOmni] aspect_ratio 不在可灵支持列表，回退 16:9', {
      raw: aspect_ratio,
      video_gen_id,
      supported: [...KLING_OMNI_ASPECT_RATIOS].join(', '),
    });
  }
  return '16:9';
}

/** 可灵官方 OpenAPI 域名（与 ffir 等 /kling/v1/... 中转路径不同） */
function isKlingOfficialOmniHost(baseUrl) {
  const raw = (baseUrl || '').toString().trim();
  if (!raw) return false;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw);
    const h = u.hostname.toLowerCase();
    return (
      h === 'api.klingai.com' ||
      h === 'api-beijing.klingai.com' ||
      h === 'api-singapore.klingai.com'
    );
  } catch (_) {
    return /api(-beijing|-singapore)?\.klingai\.com/i.test(raw);
  }
}

function resolveKlingOmniCreatePath(cfg, base) {
  const official = isKlingOfficialOmniHost(base);
  const ep = (cfg.endpoint || '').toString().trim();
  if (ep) {
    const norm = ep.startsWith('/') ? ep : '/' + ep;
    if (official && norm === KLING_OMNI_PROXY_CREATE) return KLING_OMNI_OFFICIAL_CREATE;
    return norm;
  }
  return official ? KLING_OMNI_OFFICIAL_CREATE : KLING_OMNI_PROXY_CREATE;
}

function resolveKlingOmniQueryPathTemplate(cfg, base) {
  const official = isKlingOfficialOmniHost(base);
  const q = (cfg.query_endpoint || '').toString().trim();
  if (q) {
    if (official && q === KLING_OMNI_PROXY_QUERY) return KLING_OMNI_OFFICIAL_QUERY;
    return q;
  }
  return official ? KLING_OMNI_OFFICIAL_QUERY : KLING_OMNI_PROXY_QUERY;
}

function omniDurationString(modelName, durationNum) {
  const m = (modelName || '').toLowerCase();
  const d = Number(durationNum);
  const safe = Number.isFinite(d) && d > 0 ? d : 5;
  if (m.includes('v3-omni') || m.includes('kling-v3')) {
    const allowed = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    let best = 5;
    let bestDiff = 999;
    for (const a of allowed) {
      const diff = Math.abs(a - safe);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = a;
      }
    }
    return String(best);
  }
  return safe <= 7 ? '5' : '10';
}
module.exports = {
  applyKlingOmniEnvOverrides,
  parseConfigSettingsJson,
  resolveKlingSecretKeyBase64Flag,
  resolveKlingOmniBearerToken,
  logKlingOmniAuthDebug,
  resolveKlingOmniBaseUrl,
  normalizeAspectRatioForApi,
  resolveKlingOmniAspectRatio,
  isKlingOfficialOmniHost,
  resolveKlingOmniCreatePath,
  resolveKlingOmniQueryPathTemplate,
  omniDurationString,
};