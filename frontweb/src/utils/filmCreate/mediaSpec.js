export const imageTierOptions = [
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
]

export const videoTierOptions = [
  { value: '480p', label: '480P' },
  { value: '720p', label: '720P' },
  { value: '1080p', label: '1080P' },
]

export const imageRatioOptions = [
  { value: 'follow_project', label: '跟随项目', aspect: '16 / 9' },
  { value: '1:1', label: '1:1', aspect: '1 / 1' },
  { value: '3:2', label: '3:2', aspect: '3 / 2' },
  { value: '2:3', label: '2:3', aspect: '2 / 3' },
  { value: '16:9', label: '16:9', aspect: '16 / 9' },
  { value: '9:16', label: '9:16', aspect: '9 / 16' },
  { value: '4:3', label: '4:3', aspect: '4 / 3' },
  { value: '3:4', label: '3:4', aspect: '3 / 4' },
  { value: '21:9', label: '21:9', aspect: '21 / 9' },
]

export const IMAGE_TIER_AREAS = {
  '1K': 1280 * 720,
  '2K': 1920 * 1080,
  '4K': 3840 * 2160,
}

export const VIDEO_TIER_AREAS = {
  '480p': 854 * 480,
  '720p': 1280 * 720,
  '1080p': 1920 * 1080,
}

export function defaultImageSpec() {
  return { mode: 'ratio', tier: '4K', ratio: 'follow_project', width: 3840, height: 2160 }
}

export function defaultVideoSpec() {
  return { mode: 'ratio', tier: '720p', ratio: 'follow_project' }
}

export function parseRatioValue(value, fallback = '16:9', projectAspectRatio = '16:9') {
  const raw = value === 'follow_project' ? projectAspectRatio : value
  const s = String(raw || fallback || '16:9').trim()
  const m = s.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/)
  if (!m) return parseRatioValue(fallback === s ? '16:9' : fallback, '16:9', projectAspectRatio)
  const w = Number(m[1])
  const h = Number(m[2])
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return { ratio: '16:9', w: 16, h: 9 }
  }
  return { ratio: `${m[1]}:${m[2]}`, w, h }
}

export function roundToMultiple(value, multiple = 8) {
  return Math.max(multiple, Math.round(value / multiple) * multiple)
}

export function dimensionsForArea(area, ratioValue, projectAspectRatio = '16:9') {
  const parsed = parseRatioValue(ratioValue, '16:9', projectAspectRatio)
  const ratio = parsed.w / parsed.h
  const width = roundToMultiple(Math.sqrt(area * ratio))
  const height = roundToMultiple(width / ratio)
  return { width, height, aspect_ratio: parsed.ratio }
}

export function normalizeImageSpec(spec = {}) {
  const base = defaultImageSpec()
  const mode = ['auto', 'ratio', 'custom'].includes(spec.mode) ? spec.mode : base.mode
  const tier = IMAGE_TIER_AREAS[spec.tier] ? spec.tier : base.tier
  const ratioValues = new Set(imageRatioOptions.map((item) => item.value))
  const ratio = ratioValues.has(spec.ratio) ? spec.ratio : base.ratio
  const width = Math.max(256, Math.min(8192, Number(spec.width) || base.width))
  const height = Math.max(256, Math.min(8192, Number(spec.height) || base.height))
  return { mode, tier, ratio, width: Math.round(width), height: Math.round(height) }
}

export function normalizeVideoSpec(spec = {}) {
  const base = defaultVideoSpec()
  const rawTier = String(spec.tier || spec.resolution || base.tier).trim().toLowerCase()
  const tier = VIDEO_TIER_AREAS[rawTier] ? rawTier : base.tier
  return { mode: 'ratio', tier, ratio: 'follow_project' }
}

export function resolveImageSpec(spec, projectAspectRatio = '16:9') {
  const normalized = normalizeImageSpec(spec)
  if (normalized.mode === 'custom') {
    return { ...normalized, aspect_ratio: `${normalized.width}:${normalized.height}` }
  }
  const tier = normalized.mode === 'auto' ? '4K' : normalized.tier
  const ratio = normalized.mode === 'auto' ? 'follow_project' : normalized.ratio
  return {
    ...normalized,
    tier,
    ratio,
    ...dimensionsForArea(IMAGE_TIER_AREAS[tier], ratio, projectAspectRatio),
  }
}

export function resolveVideoSpec(spec, projectAspectRatio = '16:9') {
  const normalized = normalizeVideoSpec(spec)
  const tier = normalized.tier
  const ratio = 'follow_project'
  return {
    ...normalized,
    tier,
    ratio,
    resolution: tier,
    ...dimensionsForArea(VIDEO_TIER_AREAS[tier], ratio, projectAspectRatio),
  }
}
