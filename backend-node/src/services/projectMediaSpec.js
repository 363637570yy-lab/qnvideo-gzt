const DEFAULT_PROJECT_ASPECT_RATIO = '16:9';
const DEFAULT_IMAGE_TIER = '4K';
const DEFAULT_VIDEO_TIER = '720p';
const LEGACY_VIDEO_FALLBACK_TIER = '1080p';

const IMAGE_TIER_AREAS = {
  '1K': 1280 * 720,
  '2K': 1920 * 1080,
  '4K': 3840 * 2160,
};

const OPENAI_GPT_IMAGE_MAX_EDGE = 3840;
const OPENAI_GPT_IMAGE_MAX_PIXELS = 3840 * 2160;
const OPENAI_GPT_IMAGE_MIN_PIXELS = 655360;
const OPENAI_GPT_IMAGE_MAX_RATIO = 3;

const VIDEO_TIER_AREAS = {
  '480p': 854 * 480,
  '720p': 1280 * 720,
  '1080p': 1920 * 1080,
};

const RATIO_LABELS = new Set(['1:1', '3:2', '2:3', '16:9', '9:16', '4:3', '3:4', '21:9']);

function parseMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function normalizeRatio(raw, fallback = DEFAULT_PROJECT_ASPECT_RATIO) {
  if (raw == null || raw === '') return fallback;
  let s = String(raw).trim()
    .replace(/\uFF1A/g, ':')
    .replace(/[×xX＊*]/g, ':')
    .replace(/\s+/g, '');
  if (!s || s === 'follow_project') return fallback;
  const aliases = {
    landscape: '16:9',
    horizontal: '16:9',
    portrait: '9:16',
    vertical: '9:16',
    square: '1:1',
  };
  const lower = s.toLowerCase();
  if (aliases[lower]) return aliases[lower];
  if (RATIO_LABELS.has(s)) return s;
  const m = s.match(/^(\d+):(\d+)$/);
  if (!m) return fallback;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a > 0 && b > 0 ? `${a}:${b}` : fallback;
}

function ratioToNumber(ratio) {
  const r = normalizeRatio(ratio);
  const [a, b] = r.split(':').map((n) => Number(n));
  return a > 0 && b > 0 ? a / b : 16 / 9;
}

function even(n) {
  const v = Math.max(2, Math.round(Number(n) || 0));
  return v % 2 === 0 ? v : v + 1;
}

function multipleOf(n, multiple = 16) {
  const v = Math.max(multiple, Math.round(Number(n) || 0));
  return Math.max(multiple, Math.round(v / multiple) * multiple);
}

function multipleOfFloor(n, multiple = 16) {
  const v = Math.max(multiple, Math.floor(Number(n) || 0));
  return Math.max(multiple, Math.floor(v / multiple) * multiple);
}

function multipleOfCeil(n, multiple = 16) {
  const v = Math.max(multiple, Math.ceil(Number(n) || 0));
  return Math.max(multiple, Math.ceil(v / multiple) * multiple);
}

function dimensionsFromArea(area, ratio) {
  const r = ratioToNumber(ratio);
  const h = Math.sqrt(area / r);
  const w = h * r;
  return { width: even(w), height: even(h) };
}

function normalizeImageSpec(raw, projectAspectRatio) {
  const spec = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const mode = spec.mode === 'custom' ? 'custom' : (spec.mode === 'auto' ? 'auto' : 'ratio');
  const tier = IMAGE_TIER_AREAS[spec.tier] ? spec.tier : DEFAULT_IMAGE_TIER;
  const ratio = normalizeRatio(spec.ratio || 'follow_project', projectAspectRatio);
  if (mode === 'custom') {
    const rawWidth = Number(spec.width);
    const rawHeight = Number(spec.height);
    if (Number.isFinite(rawWidth) && rawWidth > 0 && Number.isFinite(rawHeight) && rawHeight > 0) {
      const width = even(rawWidth);
      const height = even(rawHeight);
      return { mode, tier, ratio, width, height };
    }
  }
  return {
    mode,
    tier,
    ratio,
    width: null,
    height: null,
  };
}

function normalizeVideoSpec(raw, projectAspectRatio) {
  const spec = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const rawTier = String(spec.tier || spec.resolution || (spec.mode === 'custom' ? LEGACY_VIDEO_FALLBACK_TIER : DEFAULT_VIDEO_TIER)).trim().toLowerCase();
  const hasExplicitTier = spec.tier != null || spec.resolution != null || spec.mode === 'custom';
  const tier = VIDEO_TIER_AREAS[rawTier]
    ? rawTier
    : (hasExplicitTier ? LEGACY_VIDEO_FALLBACK_TIER : DEFAULT_VIDEO_TIER);
  return { mode: 'ratio', tier, ratio: normalizeRatio('follow_project', projectAspectRatio), width: null, height: null };
}

function resolveProjectImageSpecFromMetadata(metadata) {
  const meta = parseMetadata(metadata);
  const projectRatio = normalizeRatio(meta.aspect_ratio || DEFAULT_PROJECT_ASPECT_RATIO);
  const spec = normalizeImageSpec(meta.image_spec, projectRatio);
  if (spec.mode === 'custom' && spec.width && spec.height) {
    return { ...spec, size: `${spec.width}x${spec.height}`, aspect_ratio: normalizeRatio(`${spec.width}:${spec.height}`, projectRatio) };
  }
  const dim = dimensionsFromArea(IMAGE_TIER_AREAS[spec.tier] || IMAGE_TIER_AREAS[DEFAULT_IMAGE_TIER], spec.ratio);
  return { ...spec, width: dim.width, height: dim.height, size: `${dim.width}x${dim.height}`, aspect_ratio: spec.ratio };
}

function resolveProjectVideoSpecFromMetadata(metadata) {
  const meta = parseMetadata(metadata);
  const projectRatio = normalizeRatio(meta.aspect_ratio || DEFAULT_PROJECT_ASPECT_RATIO);
  const spec = normalizeVideoSpec(meta.video_spec, projectRatio);
  const dim = dimensionsFromArea(VIDEO_TIER_AREAS[spec.tier] || VIDEO_TIER_AREAS[DEFAULT_VIDEO_TIER], spec.ratio);
  return { ...spec, width: dim.width, height: dim.height, resolution: spec.tier, aspect_ratio: spec.ratio, size: `${dim.width}x${dim.height}` };
}

function resolveProjectImageSpec(db, dramaId) {
  if (!db || !dramaId) return resolveProjectImageSpecFromMetadata({});
  try {
    const row = db.prepare('SELECT metadata FROM dramas WHERE id = ? AND deleted_at IS NULL').get(Number(dramaId));
    return resolveProjectImageSpecFromMetadata(row?.metadata || {});
  } catch (_) {
    return resolveProjectImageSpecFromMetadata({});
  }
}

function resolveProjectVideoSpec(db, dramaId) {
  if (!db || !dramaId) return resolveProjectVideoSpecFromMetadata({});
  try {
    const row = db.prepare('SELECT metadata FROM dramas WHERE id = ? AND deleted_at IS NULL').get(Number(dramaId));
    return resolveProjectVideoSpecFromMetadata(row?.metadata || {});
  } catch (_) {
    return resolveProjectVideoSpecFromMetadata({});
  }
}

function officialFixedOpenAiGptImageSize(size) {
  const m = String(size || '').trim().toLowerCase().match(/^(\d+)[x*](\d+)$/);
  if (!m) return 'auto';
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!w || !h) return 'auto';
  const r = w / h;
  if (r >= 1.2) return '1536x1024';
  if (r <= 0.83) return '1024x1536';
  return '1024x1024';
}

function flexibleOpenAiGptImageSize(size) {
  const m = String(size || '').trim().toLowerCase().match(/^(\d+)[x*](\d+)$/);
  if (!m) return 'auto';
  let w = Number(m[1]);
  let h = Number(m[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 'auto';

  if (w / h > OPENAI_GPT_IMAGE_MAX_RATIO) h = w / OPENAI_GPT_IMAGE_MAX_RATIO;
  if (h / w > OPENAI_GPT_IMAGE_MAX_RATIO) w = h / OPENAI_GPT_IMAGE_MAX_RATIO;

  let alignedW = multipleOf(w, 16);
  let alignedH = multipleOf(h, 16);
  if (alignedW / alignedH > OPENAI_GPT_IMAGE_MAX_RATIO) {
    alignedH = multipleOfCeil(alignedW / OPENAI_GPT_IMAGE_MAX_RATIO, 16);
  }
  if (alignedH / alignedW > OPENAI_GPT_IMAGE_MAX_RATIO) {
    alignedW = multipleOfCeil(alignedH / OPENAI_GPT_IMAGE_MAX_RATIO, 16);
  }

  if (alignedW * alignedH < OPENAI_GPT_IMAGE_MIN_PIXELS) {
    const scaleUp = Math.sqrt(OPENAI_GPT_IMAGE_MIN_PIXELS / (alignedW * alignedH));
    alignedW = multipleOfCeil(alignedW * scaleUp, 16);
    alignedH = multipleOfCeil(alignedH * scaleUp, 16);
  }

  const scaleDown = Math.min(
    1,
    OPENAI_GPT_IMAGE_MAX_EDGE / alignedW,
    OPENAI_GPT_IMAGE_MAX_EDGE / alignedH,
    Math.sqrt(OPENAI_GPT_IMAGE_MAX_PIXELS / (alignedW * alignedH)),
  );
  if (scaleDown < 1) {
    alignedW = multipleOfFloor(alignedW * scaleDown, 16);
    alignedH = multipleOfFloor(alignedH * scaleDown, 16);
  }

  while (
    alignedW > OPENAI_GPT_IMAGE_MAX_EDGE ||
    alignedH > OPENAI_GPT_IMAGE_MAX_EDGE ||
    alignedW * alignedH > OPENAI_GPT_IMAGE_MAX_PIXELS ||
    alignedW / alignedH > OPENAI_GPT_IMAGE_MAX_RATIO ||
    alignedH / alignedW > OPENAI_GPT_IMAGE_MAX_RATIO
  ) {
    if (alignedW >= alignedH) alignedW -= 16;
    else alignedH -= 16;
    if (alignedW < 16 || alignedH < 16) return officialFixedOpenAiGptImageSize(size);
  }

  if (alignedW * alignedH < OPENAI_GPT_IMAGE_MIN_PIXELS) {
    return officialFixedOpenAiGptImageSize(size);
  }
  return `${alignedW}x${alignedH}`;
}

function openAiGptImageSize(size, mode = 'direct') {
  const normalizedMode = String(mode || 'direct').trim().toLowerCase();
  if (normalizedMode === 'official_fixed' || normalizedMode === 'fixed') {
    return officialFixedOpenAiGptImageSize(size);
  }
  return flexibleOpenAiGptImageSize(size);
}

module.exports = {
  DEFAULT_PROJECT_ASPECT_RATIO,
  DEFAULT_IMAGE_TIER,
  DEFAULT_VIDEO_TIER,
  IMAGE_TIER_AREAS,
  VIDEO_TIER_AREAS,
  normalizeRatio,
  resolveProjectImageSpec,
  resolveProjectVideoSpec,
  resolveProjectImageSpecFromMetadata,
  resolveProjectVideoSpecFromMetadata,
  openAiGptImageSize,
};
