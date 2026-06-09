export function useStoryboardVideoReferences(deps = {}) {
  const {
    baseUrl,
    storyboardUseFirstLastFrame,
    sbUniversalSegmentText,
    assetImageUrl = () => '',
    assetThumbUrl = () => '',
    imageUrl = () => '',
    getSbFirstImage = () => null,
    getSbImage = () => null,
    getSbLastImage = () => null,
    getSbPrimaryImages = () => [],
    getSbAllImages = () => [],
    getSbSelectedScene = () => null,
    getSbSelectedCharacters = () => [],
    getSbSelectedProps = () => [],
    isAuxStoryboardImage = () => false,
    hasAssetImage = () => false,
    storyboardAuxRoleOptions = [],
    auxRoleLabel = () => '',
    keyframeTimelineLine = () => '',
    isSbUniversalMode = () => false,
  } = deps

  function getRefValue(source, fallback = undefined) {
    return source?.value ?? source ?? fallback
  }

  function getSbFirstFrameUrl(sb) {
    const img = getRefValue(storyboardUseFirstLastFrame, false) ? getSbFirstImage(sb.id) : getSbImage(sb.id)
    if (img && (img.image_url || img.local_path)) return assetImageUrl(img)
    if (sb.composed_image || sb.image_url) return imageUrl(sb.composed_image || sb.image_url)
    return ''
  }

  function getSbLastFrameUrl(sb) {
    const img = getSbLastImage(sb.id)
    if (img && (img.image_url || img.local_path)) return assetImageUrl(img)
    if (sb.last_frame_image_url || sb.last_frame_local_path) {
      return assetImageUrl({ image_url: sb.last_frame_image_url, local_path: sb.last_frame_local_path })
    }
    return ''
  }

  function toAbsoluteImageUrl(url) {
    if (!url || !String(url).trim()) return ''
    const s = String(url).trim()
    if (s.startsWith('http://') || s.startsWith('https://')) return s
    const base = (getRefValue(baseUrl, '') || '').replace(/\/$/, '') || (typeof window !== 'undefined' ? window.location.origin : '')
    return base ? base + (s.startsWith('/') ? s : '/' + s) : s
  }

  function sbVideoFirstLastUrls(sb, universal, contiguityFirstFrameUrl) {
    let first =
      contiguityFirstFrameUrl ||
      (universal ? '' : toAbsoluteImageUrl(getSbFirstFrameUrl(sb) || ''))
    if (!first && !universal) {
      first = toAbsoluteImageUrl(getSbFirstFrameUrl(sb) || '')
    }
    let last = undefined
    if (getRefValue(storyboardUseFirstLastFrame, false) && !universal) {
      const lu = getSbLastFrameUrl(sb)
      if (lu) last = toAbsoluteImageUrl(lu)
    }
    return { first: first || undefined, last }
  }

  function getSbLocalImage(sb) {
    const img = getSbImage(sb.id)
    return img?.local_path || sb.local_path || null
  }

  async function captureVideoLastFrame(videoUrl) {
    return new Promise((resolve) => {
      if (!videoUrl) return resolve(null)
      const video = document.createElement('video')
      video.crossOrigin = 'anonymous'
      video.muted = true
      video.preload = 'metadata'
      let captured = false
      const timeout = setTimeout(() => { if (!captured) resolve(null) }, 12000)
      video.addEventListener('error', () => { clearTimeout(timeout); if (!captured) resolve(null) })
      video.addEventListener('loadedmetadata', () => {
        video.currentTime = Math.max(0, video.duration - 0.5)
      })
      video.addEventListener('seeked', () => {
        if (captured) return
        captured = true
        clearTimeout(timeout)
        try {
          const canvas = document.createElement('canvas')
          canvas.width = video.videoWidth || 512
          canvas.height = video.videoHeight || 288
          const ctx = canvas.getContext('2d')
          ctx.drawImage(video, 0, 0)
          canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85)
        } catch (_) {
          resolve(null)
        }
      })
      video.src = videoUrl
    })
  }

  async function getMainImageUrlForVideo(sb) {
    return getSbFirstFrameUrl(sb)
  }

  function sbUniversalSegmentTrimmed(sb) {
    if (!sb?.id) return ''
    const textMap = getRefValue(sbUniversalSegmentText, {})
    return (textMap[sb.id] ?? sb.universal_segment_text ?? '').toString().trim()
  }

  function sbCanSubmitVideo(sb) {
    if (!sb) return false
    const vp = (sb.video_prompt || '').toString().trim()
    if (vp) return true
    if (isSbUniversalMode(sb.id)) return !!sbUniversalSegmentTrimmed(sb)
    return false
  }

  function storyboardImageTimeValue(img) {
    const t = Date.parse(img?.created_at || img?.updated_at || '')
    return Number.isFinite(t) ? t : Number(img?.id || 0)
  }

  function sortStoryboardReferenceImages(a, b) {
    const sa = Number(a?.slot_index ?? 999)
    const sb = Number(b?.slot_index ?? 999)
    if (sa !== sb) return sa - sb
    return storyboardImageTimeValue(a) - storyboardImageTimeValue(b)
  }

  function latestStoryboardKeyframeBatch(images) {
    const list = Array.isArray(images) ? images.filter(Boolean) : []
    const withBatch = list.filter((img) => img.batch_id)
    if (!withBatch.length) return list
    const batches = new Map()
    for (const img of withBatch) {
      const key = String(img.batch_id)
      const item = batches.get(key) || { images: [], newest: 0 }
      item.images.push(img)
      item.newest = Math.max(item.newest, storyboardImageTimeValue(img))
      batches.set(key, item)
    }
    let chosen = null
    for (const item of batches.values()) {
      if (!chosen || item.newest > chosen.newest) chosen = item
    }
    return chosen?.images || list
  }

  function getSbConfirmedKeyframeImages(storyboardId) {
    const keyframes = getSbPrimaryImages(storyboardId)
      .filter((img) => img.frame_type === 'storyboard_keyframe')
    if (!keyframes.length) return []
    const confirmed = keyframes.filter((img) => img.selected)
    return (confirmed.length ? confirmed : latestStoryboardKeyframeBatch(keyframes))
      .slice()
      .sort(sortStoryboardReferenceImages)
  }

  function getSbLatestAuxImages(storyboardId) {
    const aux = getSbAllImages(storyboardId).filter(isAuxStoryboardImage)
    const latestByRole = new Map()
    for (const img of aux.slice().sort((a, b) => storyboardImageTimeValue(b) - storyboardImageTimeValue(a))) {
      const key = img.aux_role || img.frame_type || String(img.id)
      if (!latestByRole.has(key)) latestByRole.set(key, img)
    }
    return Array.from(latestByRole.values()).sort((a, b) => {
      const ra = storyboardAuxRoleOptions.findIndex((x) => x.value === a.aux_role)
      const rb = storyboardAuxRoleOptions.findIndex((x) => x.value === b.aux_role)
      return (ra < 0 ? 999 : ra) - (rb < 0 ? 999 : rb)
    })
  }

  function getSbStoryboardReferenceImages(sb, { includeAux = true, fallbackMain = true } = {}) {
    if (!sb?.id) return []
    const out = []
    const add = (img) => {
      if (!img || isAuxStoryboardImage(img) || !hasAssetImage(img)) return
      if (!out.some((x) => Number(x.id) === Number(img.id))) out.push(img)
    }
    if (getRefValue(storyboardUseFirstLastFrame, false)) {
      add(getSbFirstImage(sb.id))
      add(getSbLastImage(sb.id))
    } else {
      getSbConfirmedKeyframeImages(sb.id).forEach(add)
    }
    if (!out.length && fallbackMain) add(getSbImage(sb.id))
    if (!out.length && fallbackMain && (sb.local_path || sb.image_url || sb.composed_image)) {
      add({
        id: `storyboard-${sb.id}`,
        image_url: sb.composed_image || sb.image_url || '',
        local_path: sb.local_path || '',
        frame_type: 'storyboard_legacy',
      })
    }
    if (includeAux) {
      for (const img of getSbLatestAuxImages(sb.id)) {
        if (hasAssetImage(img) && !out.some((x) => Number(x.id) === Number(img.id))) out.push(img)
      }
    }
    return out
  }

  function storyboardRefName(img) {
    const aux = auxRoleLabel(img?.aux_role)
    if (aux) return aux
    if (img?.slot_index != null && img?.batch_count) return `关键帧 ${Number(img.slot_index) + 1}/${img.batch_count}`
    if (img?.frame_type === 'storyboard_first') return '首帧'
    if (img?.frame_type === 'storyboard_last') return '尾帧'
    return '分镜图'
  }

  function buildSbKeyframeTimelinePrompt(sb) {
    const refs = getSbStoryboardReferenceImages(sb, { includeAux: false, fallbackMain: true })
      .filter((img) => !isAuxStoryboardImage(img))
    if (!refs.length) return ''
    const lines = refs.slice(0, 12).map((img, idx) => {
      const label = storyboardRefName(img)
      const desc = keyframeTimelineLine(sb, img) || label
      return `${idx + 1}. ${label}: ${desc}`
    })
    return ['KEYFRAME_TIMELINE（已确认关键帧，按顺序承接生成视频）:', ...lines].join('\n')
  }

  function buildSbAuxTimelinePrompt(sb) {
    const aux = getSbLatestAuxImages(sb?.id)
    if (!aux.length) return ''
    const lines = aux.slice(0, 6).map((img, idx) => `${idx + 1}. ${storyboardRefName(img)}`)
    return ['AUXILIARY_REFERENCES（可选辅助稿，仅用于运动/构图/姿态理解）:', ...lines].join('\n')
  }

  function buildSbVideoContextPrompt(sb) {
    if (!sb?.id) return ''
    return [
      sb.layout_description ? `LAYOUT_DESCRIPTION（人物站位和承上启下空间合同）: ${sb.layout_description}` : '',
      buildSbKeyframeTimelinePrompt(sb),
      buildSbAuxTimelinePrompt(sb),
    ].filter(Boolean).join('\n')
  }

  function buildSbVideoPromptForApi(sb, { preferClassicPrompt = false } = {}) {
    const vp = (sb.video_prompt || '').toString().trim()
    const seg = sbUniversalSegmentTrimmed(sb)
    let base = ''
    if (preferClassicPrompt) base = vp || seg
    else if (isSbUniversalMode(sb.id)) base = seg || vp
    else base = vp
    const context = buildSbVideoContextPrompt(sb)
    if (!context) return base
    return [base, context].filter(Boolean).join('\n\n')
  }

  function collectSbAssetReferenceItems(sb) {
    if (!sb?.id) return []
    const items = []
    const scene = getSbSelectedScene(sb.id)
    if (scene && hasAssetImage(scene)) items.push({ kind: 'scene', name: (scene.name || '场景').toString(), item: scene })
    for (const c of getSbSelectedCharacters(sb.id)) {
      if (hasAssetImage(c)) items.push({ kind: 'character', name: (c.name || '角色').toString(), item: c })
    }
    for (const p of getSbSelectedProps(sb.id)) {
      if (hasAssetImage(p)) items.push({ kind: 'prop', name: (p.name || '物品').toString(), item: p })
    }
    return items
  }

  function collectSbVideoReferenceItems(sb) {
    if (!sb?.id) return []
    const storyRefs = getSbStoryboardReferenceImages(sb, { includeAux: true, fallbackMain: true })
    const primaryCount = storyRefs.filter((img) => !isAuxStoryboardImage(img)).length
    const out = storyRefs.map((img) => ({
      kind: isAuxStoryboardImage(img) ? 'aux' : 'storyboard',
      name: storyboardRefName(img),
      item: img,
    }))
    if (primaryCount < 2) {
      for (const ref of collectSbAssetReferenceItems(sb)) out.push(ref)
    }
    return out
  }

  function pushAbsUrl(urls, seen, url) {
    const abs = toAbsoluteImageUrl(url)
    if (!abs || seen.has(abs)) return
    seen.add(abs)
    urls.push(abs)
  }

  function getSbUniversalOmniRefSlots(sb) {
    if (!sb?.id) return []
    const out = []
    let idx = 1
    for (const ref of collectSbVideoReferenceItems(sb)) {
      out.push({
        index: idx++,
        kind: ref.kind,
        name: ref.name,
        thumbUrl: assetThumbUrl(ref.item, 160) || assetImageUrl(ref.item),
      })
    }
    return out.slice(0, 10)
  }

  function collectSbOmniReferenceAbsoluteUrls(sb) {
    if (!sb?.id) return []
    const urls = []
    const seen = new Set()
    for (const ref of collectSbVideoReferenceItems(sb)) pushAbsUrl(urls, seen, assetImageUrl(ref.item))
    return urls.slice(0, 10)
  }

  function collectSbClassicVideoReferenceAbsoluteUrls(sb) {
    if (!sb?.id) return []
    const urls = []
    const seen = new Set()
    for (const ref of collectSbVideoReferenceItems(sb)) pushAbsUrl(urls, seen, assetImageUrl(ref.item))
    return urls.slice(0, 10)
  }

  function collectSbSceneOnlyReferenceAbsoluteUrls(sb) {
    if (!sb?.id) return []
    const scene = getSbSelectedScene(sb.id)
    if (scene && hasAssetImage(scene)) {
      const abs = toAbsoluteImageUrl(assetImageUrl(scene))
      return abs ? [abs] : []
    }
    return []
  }

  return {
    buildSbAuxTimelinePrompt,
    buildSbKeyframeTimelinePrompt,
    buildSbVideoContextPrompt,
    buildSbVideoPromptForApi,
    captureVideoLastFrame,
    collectSbAssetReferenceItems,
    collectSbClassicVideoReferenceAbsoluteUrls,
    collectSbOmniReferenceAbsoluteUrls,
    collectSbSceneOnlyReferenceAbsoluteUrls,
    collectSbVideoReferenceItems,
    getMainImageUrlForVideo,
    getSbConfirmedKeyframeImages,
    getSbFirstFrameUrl,
    getSbLastFrameUrl,
    getSbLatestAuxImages,
    getSbLocalImage,
    getSbStoryboardReferenceImages,
    getSbUniversalOmniRefSlots,
    latestStoryboardKeyframeBatch,
    sbCanSubmitVideo,
    sbUniversalSegmentTrimmed,
    sbVideoFirstLastUrls,
    sortStoryboardReferenceImages,
    storyboardImageTimeValue,
    storyboardRefName,
    toAbsoluteImageUrl,
  }
}
