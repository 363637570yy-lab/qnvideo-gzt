import { ElMessage, ElMessageBox } from 'element-plus'

export function useStoryboardVideoWorkflow(deps = {}) {
  const {
    aiAPI,
    videosAPI,
    storyboardsAPI,
    uploadAPI,
    store,
    genStore,
    genResource = {},
    dramaId,
    currentEpisodeId,
    baseUrl,
    projectAspectRatio,
    videoResolution,
    pipelineRunning,
    pipelineVideoConcurrency,
    videoFrameContiguity,
    sbUniversalSegmentText,
    sbVideos,
    sbVideoErrors,
    sbSelectedVideoId,
    batchVideoRunning,
    batchVideoStopping,
    batchVideoProgress,
    batchVideoErrors,
    generatingSbVideoIds,
    storyboardUseFirstLastFrame,
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
    getSbVideoDurationForApi = () => undefined,
    buildSbGenMeta = () => ({}),
    getSelectedStyle = () => undefined,
    videoAiPayload = () => ({}),
    pollTask = async () => null,
    loadStoryboardMedia = async () => {},
    loadSingleStoryboardMedia = async () => {},
    confirmAdminProjectOperation = async () => true,
    recordHasPlayableVideoUrl = () => false,
  } = deps

  let activeVideoAiConfigCache = null
  let activeVideoAiConfigCacheAt = 0
  const ACTIVE_VIDEO_AI_CONFIG_TTL_MS = 15000

  function getRefValue(source, fallback = undefined) {
    return source?.value ?? source ?? fallback
  }

  function getDramaIdValue() {
    return getRefValue(dramaId, null)
  }

  function getCurrentEpisodeIdValue() {
    return getRefValue(currentEpisodeId, null)
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

  function toAbsoluteImageUrl(url) {
    if (!url || !String(url).trim()) return ''
    const s = String(url).trim()
    if (s.startsWith('http://') || s.startsWith('https://')) return s
    const base = (getRefValue(baseUrl, '') || '').replace(/\/$/, '') || (typeof window !== 'undefined' ? window.location.origin : '')
    return base ? base + (s.startsWith('/') ? s : '/' + s) : s
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

  function pushAbsUrl(urls, seen, url) {
    const abs = toAbsoluteImageUrl(url)
    if (!abs || seen.has(abs)) return
    seen.add(abs)
    urls.push(abs)
  }

  function storyboardRefName(img) {
    const aux = auxRoleLabel(img?.aux_role)
    if (aux) return aux
    if (img?.slot_index != null && img?.batch_count) return `关键帧 ${Number(img.slot_index) + 1}/${img.batch_count}`
    if (img?.frame_type === 'storyboard_first') return '首帧'
    if (img?.frame_type === 'storyboard_last') return '尾帧'
    return '分镜图'
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

  function invalidateActiveVideoAiConfigCache() {
    activeVideoAiConfigCache = null
    activeVideoAiConfigCacheAt = 0
  }

  async function getActiveVideoAiConfig() {
    const now = Date.now()
    if (activeVideoAiConfigCache && now - activeVideoAiConfigCacheAt < ACTIVE_VIDEO_AI_CONFIG_TTL_MS) {
      return activeVideoAiConfigCache
    }
    try {
      activeVideoAiConfigCache = await aiAPI.active('video')
    } catch {
      activeVideoAiConfigCache = null
    }
    activeVideoAiConfigCacheAt = now
    return activeVideoAiConfigCache
  }

  function videoModelNameFromAiConfig(cfg) {
    if (!cfg) return ''
    const dm = (cfg.default_model || '').toString().trim()
    if (dm) return dm
    const m = cfg.model
    if (Array.isArray(m) && m.length) return String(m[0]).trim()
    return String(m || '').trim()
  }

  function isSeedance2VideoModel(modelName) {
    const m = String(modelName || '').toLowerCase()
    if (!m.includes('seedance')) return false
    return /2[-_]0/.test(m) || /seedance[-_]?2|seedance2/.test(m)
  }

  function canUseUniversalOmniVideoApi(cfg) {
    if (!cfg) return false
    const proto = String(cfg.api_protocol || '').toLowerCase()
    if (proto === 'kling_omni') return true
    if (proto === 'volcengine_omni') {
      return isSeedance2VideoModel(videoModelNameFromAiConfig(cfg))
    }
    return false
  }

  async function confirmUniversalNonSeedance2Video() {
    await ElMessageBox.confirm(
      '你当前模型不是 Seedance 2.0，只能用分镜图片生成视频；当前可能只会传入场景作为参考图。是否强制继续？',
      '全能模式与模型不匹配',
      { confirmButtonText: '强制继续', cancelButtonText: '取消', type: 'warning' }
    )
  }

  async function onGenerateSbVideo(sb) {
    const dramaIdValue = getDramaIdValue()
    if (!dramaIdValue || !sb?.id || !sbCanSubmitVideo(sb)) return
    if (!(await confirmAdminProjectOperation('生成分镜视频'))) return
    const universal = isSbUniversalMode(sb.id)
    let universalOmniApi = universal
    if (universal) {
      const videoCfg = await getActiveVideoAiConfig()
      if (!canUseUniversalOmniVideoApi(videoCfg)) {
        try {
          await confirmUniversalNonSeedance2Video()
        } catch {
          return
        }
        universalOmniApi = false
      }
    }
    const omniRefs = universalOmniApi ? collectSbOmniReferenceAbsoluteUrls(sb) : []
    const sceneOnlyRefs = universal && !universalOmniApi ? collectSbSceneOnlyReferenceAbsoluteUrls(sb) : []
    const hasClassicFrame = !!getSbFirstFrameUrl(sb)
    let hasAnyImage = false
    if (universalOmniApi) {
      hasAnyImage = omniRefs.length > 0
    } else if (universal) {
      hasAnyImage = hasClassicFrame || sceneOnlyRefs.length > 0
    } else {
      hasAnyImage = hasClassicFrame
    }
    if (!hasAnyImage) {
      if (!universal) {
        await ElMessageBox.alert(
          '当前为传统模式，生视频需要分镜参考图。请先生成或上传分镜图片后再试。',
          '传统模式缺少分镜图',
          { confirmButtonText: '知道了', type: 'warning' }
        )
        return
      }
      try {
        await ElMessageBox.confirm(
          universalOmniApi
            ? '当前没有可用的参考图（已确认关键帧/辅助稿，或兜底场景/角色/道具），将按纯文案提交 Omni-Video（模型以 AI 配置为准），效果可能不稳定。确认继续？'
            : '当前没有分镜主图且无场景参考图，将仅按文字提示词生成视频，效果可能不稳定。确认继续？',
          universalOmniApi ? '全能模式无参考图' : '全能降级无参考图',
          { confirmButtonText: '继续生成', cancelButtonText: '取消', type: 'warning' }
        )
      } catch {
        return
      }
    }
    generatingSbVideoIds.add(sb.id)
    const meta = buildSbGenMeta(sb, genResource.SB_VIDEO, '分镜视频')
    genStore.markRunning(meta)
    const errors = { ...(getRefValue(sbVideoErrors, {}) || {}) }
    errors[sb.id] = ''
    sbVideoErrors.value = errors
    if (getRefValue(sbSelectedVideoId, {})[sb.id] != null) {
      const next = { ...getRefValue(sbSelectedVideoId, {}) }
      delete next[sb.id]
      sbSelectedVideoId.value = next
    }
    storyboardsAPI.update(sb.id, { video_url: null }).catch(() => {})
    try {
      let absoluteUrl = ''
      let referenceUrls = undefined
      if (universalOmniApi) {
        referenceUrls = omniRefs.length ? omniRefs : undefined
        absoluteUrl = omniRefs[0] || ''
      } else if (universal) {
        const firstFrameUrl = await getMainImageUrlForVideo(sb)
        absoluteUrl = toAbsoluteImageUrl(firstFrameUrl)
        if (absoluteUrl) {
          referenceUrls = sceneOnlyRefs.length ? sceneOnlyRefs : [absoluteUrl]
        } else {
          referenceUrls = sceneOnlyRefs.length ? sceneOnlyRefs : undefined
          absoluteUrl = sceneOnlyRefs[0] || ''
        }
      } else {
        const firstFrameUrl = await getMainImageUrlForVideo(sb)
        absoluteUrl = toAbsoluteImageUrl(firstFrameUrl)
        const classicRefs = collectSbClassicVideoReferenceAbsoluteUrls(sb)
        referenceUrls = classicRefs.length ? classicRefs : (absoluteUrl ? [absoluteUrl] : undefined)
      }
      const { first: vFirst, last: vLast } = sbVideoFirstLastUrls(sb, universalOmniApi, null)
      if (!universalOmniApi && vLast && referenceUrls && !referenceUrls.includes(vLast)) {
        referenceUrls = [...referenceUrls, vLast]
      }
      const preferClassicPrompt = universal && !universalOmniApi
      const res = await videosAPI.create({
        drama_id: dramaIdValue,
        storyboard_id: sb.id,
        prompt: buildSbVideoPromptForApi(sb, { preferClassicPrompt }),
        image_url: (vFirst || absoluteUrl) || undefined,
        first_frame_url: vFirst || absoluteUrl || undefined,
        last_frame_url: vLast,
        reference_image_urls: referenceUrls,
        style: getSelectedStyle(),
        aspect_ratio: getRefValue(projectAspectRatio, '16:9') || '16:9',
        resolution: getRefValue(videoResolution, undefined) || undefined,
        duration: getSbVideoDurationForApi(sb),
        ...videoAiPayload(),
      })
      if (res?.task_id) {
        const pollRes = await pollTask(res.task_id, () => loadSingleStoryboardMedia(sb.id), meta)
        if (pollRes?.status === 'failed') {
          sbVideoErrors.value = { ...getRefValue(sbVideoErrors, {}), [sb.id]: pollRes.error || '视频生成失败' }
        } else if (pollRes?.status === 'completed') {
          sbVideoErrors.value = { ...getRefValue(sbVideoErrors, {}), [sb.id]: '' }
          ElMessage.success('视频生成完成')
        }
      } else {
        await loadSingleStoryboardMedia(sb.id)
        genStore.markDone(meta)
        ElMessage.success('视频生成已提交，请稍后查看')
      }
    } catch (e) {
      sbVideoErrors.value = { ...getRefValue(sbVideoErrors, {}), [sb.id]: e.message || '提交失败' }
      genStore.markFailed(meta, e.message || '提交失败')
      ElMessage.error(e.message || '提交失败')
    } finally {
      generatingSbVideoIds.delete(sb.id)
      await loadSingleStoryboardMedia(sb.id)
    }
  }

  async function startBatchVideoGeneration() {
    if (!getCurrentEpisodeIdValue() || getRefValue(batchVideoRunning, false) || getRefValue(pipelineRunning, false)) return
    if (!(await confirmAdminProjectOperation('批量生成分镜视频'))) return
    batchVideoErrors.value = []
    batchVideoStopping.value = false
    batchVideoRunning.value = true
    try {
      if (Object.keys(getRefValue(sbVideos, {}) || {}).length === 0) {
        await loadStoryboardMedia()
      }
      const boards = store.storyboards || []
      const todo = boards.filter((sb) => {
        const vidList = getRefValue(sbVideos, {})[sb.id] || []
        if (vidList.some((v) => v.status === 'completed' && recordHasPlayableVideoUrl(v))) return false
        if (isSbUniversalMode(sb.id)) {
          if (!sbCanSubmitVideo(sb)) return false
          return collectSbOmniReferenceAbsoluteUrls(sb).length > 0
        }
        return !!getSbFirstFrameUrl(sb)
      })
      if (todo.length === 0) {
        ElMessage.info('没有需要生成视频的分镜（分镜缺少图片，或视频已全部生成）')
        return
      }
      batchVideoProgress.value = { current: 0, total: todo.length, failed: 0 }
      const contiguity = getRefValue(videoFrameContiguity, false)
      const videoConcurrency = contiguity ? 1 : (getRefValue(pipelineVideoConcurrency, 2) || 2)
      let videoDoneCount = 0
      let prevVideoItem = null

      let videoQueueIdx = 0
      const videoWorker = async () => {
        while (videoQueueIdx < todo.length) {
          if (getRefValue(batchVideoStopping, false)) break
          const sb = todo[videoQueueIdx++]
          const universal = isSbUniversalMode(sb.id)
          const omniRefs = universal ? collectSbOmniReferenceAbsoluteUrls(sb) : []
          if (!universal && !getSbFirstFrameUrl(sb)) {
            videoDoneCount++
            batchVideoProgress.value = { ...getRefValue(batchVideoProgress, {}), current: videoDoneCount }
            continue
          }
          if (universal && !omniRefs.length) {
            videoDoneCount++
            batchVideoProgress.value = { ...getRefValue(batchVideoProgress, {}), current: videoDoneCount }
            continue
          }
          try {
            storyboardsAPI.update(sb.id, { video_url: null }).catch(() => {})
            if (getRefValue(sbSelectedVideoId, {})[sb.id] != null) {
              const next = { ...getRefValue(sbSelectedVideoId, {}) }
              delete next[sb.id]
              sbSelectedVideoId.value = next
            }
            const firstFrameUrl = await getMainImageUrlForVideo(sb)
            const absoluteUrl = universal ? (omniRefs[0] || '') : toAbsoluteImageUrl(firstFrameUrl)
            let contiguityFirstFrameUrl = absoluteUrl
            if (contiguity && prevVideoItem && !universal) {
              const prevVideoUrl = prevVideoItem.local_path
                ? toAbsoluteImageUrl('/static/' + prevVideoItem.local_path.replace(/^\//, ''))
                : prevVideoItem.video_url
              if (prevVideoUrl) {
                try {
                  const lastFrameBlob = await captureVideoLastFrame(prevVideoUrl)
                  if (lastFrameBlob) {
                    const file = new File([lastFrameBlob], 'continuity_frame.jpg', { type: 'image/jpeg' })
                    const uploadRes = await uploadAPI.uploadImage(file, { dramaId: getDramaIdValue() })
                    if (uploadRes?.local_path) {
                      contiguityFirstFrameUrl = toAbsoluteImageUrl('/static/' + uploadRes.local_path.replace(/^\//, ''))
                    }
                  }
                } catch (_) {}
              }
            }
            const { first: vFirst, last: vLast } = sbVideoFirstLastUrls(sb, universal, contiguityFirstFrameUrl || undefined)
            const classicRefs = universal ? [] : collectSbClassicVideoReferenceAbsoluteUrls(sb)
            let refUrls = universal
              ? (omniRefs.length ? omniRefs : undefined)
              : (classicRefs.length ? classicRefs : (absoluteUrl ? [absoluteUrl] : undefined))
            if (!universal && vLast && refUrls && !refUrls.includes(vLast)) {
              refUrls = [...refUrls, vLast]
            }
            const res = await videosAPI.create({
              drama_id: getDramaIdValue(),
              storyboard_id: sb.id,
              prompt: buildSbVideoPromptForApi(sb),
              image_url: vFirst || undefined,
              first_frame_url: vFirst,
              last_frame_url: vLast,
              reference_image_urls: refUrls,
              style: getSelectedStyle(),
              aspect_ratio: getRefValue(projectAspectRatio, '16:9') || '16:9',
              resolution: getRefValue(videoResolution, undefined) || undefined,
              duration: getSbVideoDurationForApi(sb),
              ...videoAiPayload(),
            })
            if (res?.task_id) {
              const pollRes = await pollTask(res.task_id, () => loadSingleStoryboardMedia(sb.id))
              if (pollRes?.status === 'failed') {
                batchVideoErrors.value.push(`#${sb.storyboard_number ?? sb.id}: ${pollRes.error || '生成失败'}`)
                batchVideoProgress.value = { ...getRefValue(batchVideoProgress, {}), failed: getRefValue(batchVideoProgress, {}).failed + 1 }
                prevVideoItem = null
              } else if (contiguity && pollRes?.status === 'completed') {
                const vList = getRefValue(sbVideos, {})[sb.id] || []
                prevVideoItem = vList.find((v) => v.status === 'completed') || null
              }
            } else {
              await loadSingleStoryboardMedia(sb.id)
              if (contiguity) {
                const vList = getRefValue(sbVideos, {})[sb.id] || []
                prevVideoItem = vList.find((v) => v.status === 'completed') || null
              }
            }
          } catch (e) {
            batchVideoErrors.value.push(`#${sb.storyboard_number ?? sb.id}: ${e.message || '提交失败'}`)
            batchVideoProgress.value = { ...getRefValue(batchVideoProgress, {}), failed: getRefValue(batchVideoProgress, {}).failed + 1 }
            if (contiguity) prevVideoItem = null
          }
          videoDoneCount++
          batchVideoProgress.value = { ...getRefValue(batchVideoProgress, {}), current: videoDoneCount }
        }
      }
      await Promise.allSettled(Array.from({ length: Math.min(videoConcurrency, todo.length) }, () => videoWorker()))
      if (!getRefValue(batchVideoStopping, false)) {
        if (getRefValue(batchVideoProgress, {}).failed === 0) ElMessage.success(`分镜视频批量生成完成（共 ${todo.length} 条）`)
        else ElMessage.warning(`批量完成，${getRefValue(batchVideoProgress, {}).failed}/${todo.length} 条失败`)
      } else {
        ElMessage.info('批量生成已停止')
      }
    } finally {
      batchVideoRunning.value = false
    }
  }

  async function stopBatchVideoGeneration() {
    if (!(await confirmAdminProjectOperation('停止批量生成分镜视频'))) return
    batchVideoStopping.value = true
  }

  return {
    ACTIVE_VIDEO_AI_CONFIG_TTL_MS,
    buildSbAuxTimelinePrompt,
    buildSbKeyframeTimelinePrompt,
    buildSbVideoContextPrompt,
    buildSbVideoPromptForApi,
    canUseUniversalOmniVideoApi,
    captureVideoLastFrame,
    collectSbAssetReferenceItems,
    collectSbClassicVideoReferenceAbsoluteUrls,
    collectSbOmniReferenceAbsoluteUrls,
    collectSbSceneOnlyReferenceAbsoluteUrls,
    collectSbVideoReferenceItems,
    confirmUniversalNonSeedance2Video,
    getActiveVideoAiConfig,
    getMainImageUrlForVideo,
    getSbConfirmedKeyframeImages,
    getSbFirstFrameUrl,
    getSbLastFrameUrl,
    getSbLatestAuxImages,
    getSbLocalImage,
    getSbStoryboardReferenceImages,
    getSbUniversalOmniRefSlots,
    invalidateActiveVideoAiConfigCache,
    isSeedance2VideoModel,
    latestStoryboardKeyframeBatch,
    onGenerateSbVideo,
    sbCanSubmitVideo,
    sbUniversalSegmentTrimmed,
    sbVideoFirstLastUrls,
    sortStoryboardReferenceImages,
    startBatchVideoGeneration,
    stopBatchVideoGeneration,
    storyboardImageTimeValue,
    storyboardRefName,
    toAbsoluteImageUrl,
    videoModelNameFromAiConfig,
  }
}
