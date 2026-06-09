export const storyboardAuxRoleOptions = [
  { value: 'motion_sketch', label: '运动线稿', frameType: 'storyboard_motion_sketch' },
  { value: 'layout_sketch', label: '构图稿', frameType: 'storyboard_layout_sketch' },
  { value: 'pose_ref', label: '姿态参考', frameType: 'storyboard_pose_ref' },
  { value: 'camera_path', label: '镜头路径', frameType: 'storyboard_camera_path' },
  { value: 'aux_ref', label: '辅助参考', frameType: 'storyboard_aux_ref' },
]

export function useStoryboardMediaSelectors(options = {}) {
  const {
    store,
    sbImages,
    sbVideos,
    sbVideoErrors,
    sbSelectedImgId,
    sbSelectedLastImgId,
    sbSelectedVideoId,
    sbImageUploadSlotById,
    storyboardFrameCount,
    videoClipDuration,
    normalizeStoryboardFrameCount = (count) => Number(count) || 1,
    isFirstLastFrameMode = () => false,
    assetImageUrl = () => '',
    assetThumbUrl = () => '',
    assetVideoUrl = () => '',
    recordHasPlayableVideoUrl = () => false,
  } = options

  function groupByStoryboardId(items) {
    const map = {}
    for (const item of items || []) {
      const storyboardId = item?.storyboard_id
      if (storyboardId == null) continue
      if (!map[storyboardId]) map[storyboardId] = []
      map[storyboardId].push(item)
    }
    return map
  }

  /** 主播放器强制随记录/地址重建，避免重新生成后 <video> 仍缓存旧 src。 */
  function sbMainVideoPlayerKey(storyboardId) {
    const video = getSbVideo(storyboardId)
    if (!video) return ''
    const src = assetVideoUrl(video)
    return `${video.id}:${video.updated_at || ''}:${src.slice(0, 160)}`
  }

  function uploadingSbImageSlot(storyboardId) {
    return sbImageUploadSlotById.value[storyboardId] || null
  }

  function frameTypeForSlot(slot) {
    return slot === 'last' ? 'storyboard_last' : 'storyboard_first'
  }

  function resolveSbImageById(storyboardId, imageId) {
    if (imageId == null) return null
    const images = getSbAllImages(storyboardId)
    return images.find((image) => image.id === imageId) || null
  }

  function getSbFirstImage(storyboardId) {
    const images = getSbAllImages(storyboardId)
    const storyboard = (store?.storyboards || []).find((item) => item.id === storyboardId)

    if (storyboard?.first_frame_image_id != null) {
      const bound = resolveSbImageById(storyboardId, storyboard.first_frame_image_id)
      if (bound) return bound
    }

    const selectedId = sbSelectedImgId.value[storyboardId]
    if (selectedId != null) {
      const selected = images.find((image) => image.id === selectedId)
      if (selected) return selected
    }

    const typed = images.find((image) => image.frame_type === 'storyboard_first')
    if (typed) return typed
    return null
  }

  function getSbLastImage(storyboardId) {
    const images = getSbAllImages(storyboardId)
    const storyboard = (store?.storyboards || []).find((item) => item.id === storyboardId)

    if (storyboard?.last_frame_image_id != null) {
      const bound = resolveSbImageById(storyboardId, storyboard.last_frame_image_id)
      if (bound) return bound
    }

    const selectedId = sbSelectedLastImgId.value[storyboardId]
    if (selectedId != null) {
      const selected = images.find((image) => image.id === selectedId)
      if (selected) return selected
    }

    const typed = images.find((image) => image.frame_type === 'storyboard_last')
    if (typed) return typed

    if (storyboard?.last_frame_image_url || storyboard?.last_frame_local_path) {
      return {
        id: storyboard.last_frame_image_id,
        image_url: storyboard.last_frame_image_url,
        local_path: storyboard.last_frame_local_path,
        frame_type: 'storyboard_last',
      }
    }
    return null
  }

  function hasSbImage(storyboard) {
    if (isFirstLastFrameMode()) {
      return hasSbFirstLastPair(storyboard)
    }
    return !!(getSbImage(storyboard.id) || (storyboard && (storyboard.composed_image || storyboard.image_url)))
  }

  function hasSbFirstLastPair(storyboard) {
    return !!(getSbFirstImage(storyboard.id) && getSbLastImage(storyboard.id))
  }

  function getSbAllImages(storyboardId) {
    const list = sbImages.value[storyboardId]
    if (!Array.isArray(list)) return []
    return list.filter(
      (image) =>
        image.status === 'completed' &&
        image.frame_type !== 'quad_grid' &&
        image.frame_type !== 'nine_grid' &&
        (image.image_url || image.local_path)
    )
  }

  function isAuxStoryboardImage(image) {
    const frameType = String(image?.frame_type || '')
    return !!image?.aux_role ||
      frameType === 'storyboard_motion_sketch' ||
      frameType === 'storyboard_layout_sketch' ||
      frameType === 'storyboard_pose_ref' ||
      frameType === 'storyboard_camera_path' ||
      frameType === 'storyboard_aux_ref'
  }

  function getSbPrimaryImages(storyboardId) {
    return getSbAllImages(storyboardId).filter((image) => !isAuxStoryboardImage(image))
  }

  function getSbImage(storyboardId) {
    if (isFirstLastFrameMode()) return getSbFirstImage(storyboardId)
    const images = getSbPrimaryImages(storyboardId)
    if (!images.length) return null
    const selectedId = sbSelectedImgId.value[storyboardId]
    if (selectedId != null) {
      const found = images.find((image) => image.id === selectedId)
      if (found) return found
    }
    const confirmed = images
      .filter((image) => image.selected)
      .sort((a, b) => (Number(a.slot_index ?? 999) - Number(b.slot_index ?? 999)) || (Number(b.id || 0) - Number(a.id || 0)))[0]
    if (confirmed) return confirmed
    return images[0]
  }

  function getQuadGridImage(storyboardId) {
    const list = sbImages.value[storyboardId]
    if (!Array.isArray(list)) return null
    return list.find(
      (image) =>
        image.status === 'completed' &&
        (image.frame_type === 'quad_grid' || image.frame_type === 'nine_grid') &&
        (image.image_url || image.local_path)
    ) || null
  }

  function getSbAllVideos(storyboardId) {
    const list = sbVideos.value[storyboardId]
    if (!Array.isArray(list)) return []
    return list.filter((video) => video.status === 'completed' && recordHasPlayableVideoUrl(video))
  }

  function getSbVideo(storyboardId) {
    const all = getSbAllVideos(storyboardId)
    if (all.length === 0) return null
    const selectedId = sbSelectedVideoId.value[storyboardId]
    if (selectedId != null) {
      const found = all.find((video) => video.id === selectedId)
      if (found) return found
    }
    return all[0]
  }

  function getSbVideoError(storyboardId) {
    if (sbVideoErrors.value[storyboardId]) return sbVideoErrors.value[storyboardId]
    const list = sbVideos.value[storyboardId]
    if (!Array.isArray(list) || list.length === 0) return ''
    const hasCompleted = list.some((item) => item.status === 'completed' && recordHasPlayableVideoUrl(item))
    if (hasCompleted) return ''
    const bogusCompleted = list.find(
      (item) => item.status === 'completed' && item.video_url && !recordHasPlayableVideoUrl(item)
    )
    if (bogusCompleted) {
      const url = String(bogusCompleted.video_url || '').trim()
      if (url) return url
      if (bogusCompleted.error_msg) return bogusCompleted.error_msg
    }
    const failed = list.filter((item) => item.status === 'failed' && item.error_msg)
    if (failed.length === 0) return ''
    return failed[0].error_msg
  }

  function getNextStoryboard(storyboardId) {
    const list = store?.storyboards || []
    const index = list.findIndex((storyboard) => storyboard.id === storyboardId)
    if (index === -1 || index === list.length - 1) return null
    return list[index + 1]
  }

  function getPrevStoryboard(storyboardId) {
    const list = store?.storyboards || []
    const index = list.findIndex((storyboard) => storyboard.id === storyboardId)
    if (index === -1 || index === 0) return null
    return list[index - 1]
  }

  function canUsePrevTailAsFirst(storyboard) {
    const prev = getPrevStoryboard(storyboard?.id)
    return !!(prev && getSbLastImage(prev.id))
  }

  function getVideoStripItems(storyboardId) {
    const all = getSbAllVideos(storyboardId)
    const current = getSbVideo(storyboardId)
    return all
      .filter((video) => !current || video.id !== current.id)
      .map((video, index) => ({
        key: `vid-${video.id}`,
        video,
        src: assetVideoUrl(video),
        label: `历史${index + 2}`,
      }))
  }

  function getStripItems(storyboardId) {
    const allImages = getSbAllImages(storyboardId)
    const storyboard = (store?.storyboards || []).find((item) => Number(item.id) === Number(storyboardId)) || null
    const firstImage = isFirstLastFrameMode() ? getSbFirstImage(storyboardId) : getSbImage(storyboardId)
    const lastImage = isFirstLastFrameMode() ? getSbLastImage(storyboardId) : null
    const boundIds = new Set([firstImage?.id, lastImage?.id].filter((id) => id != null))
    return allImages
      .filter((image) => !boundIds.has(image.id))
      .sort((a, b) => {
        const batchA = String(a.batch_id || '')
        const batchB = String(b.batch_id || '')
        if (batchA !== batchB) return String(b.created_at || '').localeCompare(String(a.created_at || ''))
        return (Number(a.slot_index ?? 999) - Number(b.slot_index ?? 999)) || (Number(a.id || 0) - Number(b.id || 0))
      })
      .map((image) => ({
        key: `img-${image.id}`,
        src: assetImageUrl(image),
        thumbSrc: assetThumbUrl(image, 160),
        type: 'img',
        img: image,
        label: keyframeItemLabel(image),
        frameBadge: image.frame_type === 'storyboard_first' ? '首' : image.frame_type === 'storyboard_last' ? '尾' : null,
        prompt: image.prompt || '',
        locked: !!image.locked,
        selected: !!image.selected,
        aux: isAuxStoryboardImage(image),
        description: storyboard ? keyframeTimelineLine(storyboard, image) : '',
      }))
  }

  function keyframeItemLabel(image) {
    const aux = auxRoleLabel(image.aux_role)
    if (aux) return aux
    const panel = quadPanelLabel(image.frame_type)
    if (panel) return panel
    if (image.slot_index != null && image.batch_count) return `${Number(image.slot_index) + 1}/${image.batch_count}`
    if (image.frame_type === 'storyboard_keyframe') return '关键帧'
    return null
  }

  function parseJsonObject(value) {
    if (!value) return {}
    if (typeof value === 'object' && !Array.isArray(value)) return { ...value }
    try {
      const parsed = JSON.parse(String(value))
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }

  function parseImageParamsJson(image) {
    return parseJsonObject(image?.params_json)
  }

  function compactKeyframeText(value, max = 90) {
    const text = (value || '').toString().replace(/\s+/g, ' ').trim()
    if (!text) return ''
    return text.length > max ? `${text.slice(0, max)}...` : text
  }

  function keyframeIndexInfo(image) {
    const frameType = String(image?.frame_type || '')
    const countRaw = Number(image?.batch_count)
    const count = Number.isFinite(countRaw) && countRaw > 0
      ? countRaw
      : frameType === 'storyboard_first' || frameType === 'storyboard_last'
        ? 2
        : normalizeStoryboardFrameCount(storyboardFrameCount?.value ?? storyboardFrameCount)
    const idxRaw = Number(image?.slot_index)
    const index = Number.isFinite(idxRaw) && idxRaw >= 0
      ? idxRaw
      : frameType === 'storyboard_last'
        ? Math.max(0, count - 1)
        : 0
    return {
      index: Math.min(Math.max(0, index), Math.max(0, count - 1)),
      count: Math.max(1, count),
    }
  }

  function keyframeTimeRange(sb, image) {
    const { index, count } = keyframeIndexInfo(image)
    const duration = Math.max(1, Number(sb?.duration) || Number(videoClipDuration?.value ?? videoClipDuration) || 10)
    const start = Math.round((duration * index / count) * 10) / 10
    const end = Math.round((duration * (index + 1) / count) * 10) / 10
    return { start, end, index, count, duration }
  }

  function formatKeyframeSecond(value) {
    const n = Number(value)
    if (!Number.isFinite(n)) return '0'
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10)
  }

  function defaultKeyframeDescription(sb, image = {}) {
    const { start, end, index, count } = keyframeTimeRange(sb, image)
    const phase = count <= 2
      ? (index === 0 ? '首帧' : '尾帧')
      : index === 0
        ? '开场'
        : index === count - 1
          ? '收束'
          : '过渡'
    const action = compactKeyframeText(sb?.action || sb?.description || sb?.image_prompt || '', 72)
    const result = compactKeyframeText(sb?.result || '', 56)
    const layout = compactKeyframeText(sb?.layout_description || '', 56)
    const core = [
      action || '承接本分镜动作时间线',
      result ? `结果：${result}` : '',
      layout ? `站位：${layout}` : '',
    ].filter(Boolean).join('；')
    return `${formatKeyframeSecond(start)}-${formatKeyframeSecond(end)}秒 ${phase}：${core}`
  }

  function keyframeDescriptionFromParams(image) {
    const params = parseImageParamsJson(image)
    return compactKeyframeText(
      params.keyframe_description || params.timeline_description || params.description || '',
      160
    )
  }

  function keyframeTimelineLine(storyboard, image) {
    if (!image || isAuxStoryboardImage(image)) return ''
    return keyframeDescriptionFromParams(image) || defaultKeyframeDescription(storyboard, image)
  }

  function buildKeyframeParamsJson(sb, index, count, extra = null, frameType = 'storyboard_keyframe') {
    const base = parseJsonObject(extra)
    if (auxRoleLabel(base.aux_role) || isAuxStoryboardImage({ frame_type: frameType, aux_role: base.aux_role })) return base
    const imageLike = { slot_index: index, batch_count: count, frame_type: frameType }
    const range = keyframeTimeRange(sb, imageLike)
    return {
      ...base,
      keyframe_index: range.index + 1,
      keyframe_count: range.count,
      keyframe_timeline_start: range.start,
      keyframe_timeline_end: range.end,
      keyframe_description: compactKeyframeText(base.keyframe_description || defaultKeyframeDescription(sb, imageLike), 180),
    }
  }

  function auxRoleLabel(role) {
    const option = storyboardAuxRoleOptions.find((item) => item.value === role)
    return option?.label || ''
  }

  function auxRoleFrameType(role) {
    const option = storyboardAuxRoleOptions.find((item) => item.value === role)
    return option?.frameType || 'storyboard_aux_ref'
  }

  function stripItemTitle(storyboardId, item) {
    const lines = [item.label, item.description, item.prompt].filter(Boolean)
    if (item.aux) {
      lines.unshift('点击预览辅助稿')
      return lines.join('\n\n')
    }
    if (isFirstLastFrameMode()) {
      lines.unshift('点击：设为首帧或尾帧')
    } else {
      lines.unshift('点击设为主图')
    }
    return lines.join('\n\n')
  }

  function quadPanelLabel(frameType) {
    const map = {
      quad_panel_0: '左上',
      quad_panel_1: '右上',
      quad_panel_2: '左下',
      quad_panel_3: '右下',
      nine_panel_0: '左上',
      nine_panel_1: '中上',
      nine_panel_2: '右上',
      nine_panel_3: '左中',
      nine_panel_4: '中间',
      nine_panel_5: '右中',
      nine_panel_6: '左下',
      nine_panel_7: '中下',
      nine_panel_8: '右下',
    }
    return map[frameType] || null
  }

  return {
    auxRoleFrameType,
    auxRoleLabel,
    buildKeyframeParamsJson,
    canUsePrevTailAsFirst,
    compactKeyframeText,
    defaultKeyframeDescription,
    formatKeyframeSecond,
    frameTypeForSlot,
    getNextStoryboard,
    getPrevStoryboard,
    getQuadGridImage,
    getSbAllImages,
    getSbAllVideos,
    getSbFirstImage,
    getSbImage,
    getSbLastImage,
    getSbPrimaryImages,
    getSbVideo,
    getSbVideoError,
    getStripItems,
    getVideoStripItems,
    groupByStoryboardId,
    hasSbFirstLastPair,
    hasSbImage,
    isAuxStoryboardImage,
    keyframeDescriptionFromParams,
    keyframeIndexInfo,
    keyframeItemLabel,
    keyframeTimelineLine,
    keyframeTimeRange,
    parseImageParamsJson,
    parseJsonObject,
    quadPanelLabel,
    resolveSbImageById,
    sbMainVideoPlayerKey,
    stripItemTitle,
    uploadingSbImageSlot,
  }
}
