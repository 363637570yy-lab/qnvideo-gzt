import { reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { storyboardsAPI } from '@/api/storyboards'

const EMPTY_ARR = []
const storyboardAuxRoleOptions = [
  { value: 'motion_sketch', label: '运动线稿', frameType: 'storyboard_motion_sketch' },
  { value: 'layout_sketch', label: '构图稿', frameType: 'storyboard_layout_sketch' },
  { value: 'pose_ref', label: '姿态参考', frameType: 'storyboard_pose_ref' },
  { value: 'camera_path', label: '镜头路径', frameType: 'storyboard_camera_path' },
  { value: 'aux_ref', label: '辅助参考', frameType: 'storyboard_aux_ref' },
]

export function useStoryboardWorkbench(deps = {}) {
  const {
    store,
    imagesAPI,
    videosAPI,
    videoClipDuration,
    storyboardUseFirstLastFrame,
    storyboardFrameCount,
    normalizeStoryboardFrameCount = (count) => Number(count) || 1,
    assetImageUrl = () => '',
    assetThumbUrl = () => '',
    assetVideoUrl = () => '',
    recordHasPlayableVideoUrl = () => false,
    openImagePreview = () => {},
    confirmAdminProjectOperation = async () => true,
  } = deps

  const sbCharacterIds = ref({})
  const sbPropIds = ref({})
  const sbSceneId = ref({})
  const sbDialogue = ref({})
  const sbNarration = ref({})
  const sbShotType = ref({})
  const sbTitle = ref({})
  const sbLocation = ref({})
  const sbTime = ref({})
  const sbDuration = ref({})
  const sbAction = ref({})
  const sbResult = ref({})
  const sbAtmosphere = ref({})
  const sbAngle = ref({})
  const sbAngleH = ref({})
  const sbAngleV = ref({})
  const sbAngleS = ref({})
  const sbMovement = ref({})
  const sbLighting = ref({})
  const sbDof = ref({})
  const sbLayoutDescription = ref({})
  const sbCreationMode = ref({})
  const sbUniversalSegmentText = ref({})

  const sbImages = ref({})
  const sbVideos = ref({})
  const sbVideoErrors = ref({})
  const sbSelectedImgId = ref({})
  const sbSelectedLastImgId = ref({})
  const sbSelectedVideoId = ref({})
  const sbImageUploadSlotById = ref({})

  const generatingSbImageIds = reactive(new Set())
  const generatingSbFirstImageIds = reactive(new Set())
  const generatingSbLastImageIds = reactive(new Set())
  const generatingSbVideoIds = reactive(new Set())
  const generatingUniversalSegmentIds = reactive(new Set())
  const regenSbImagesForAsset = reactive(new Set())
  const regeneratingLayoutSbIds = reactive(new Set())
  const upscalingSbIds = reactive(new Set())
  const ttsSbIds = reactive(new Set())
  const ttsSbNarrationIds = reactive(new Set())
  const linkingTailFrameIds = reactive(new Set())
  const usingPrevTailAsFirstIds = reactive(new Set())

  const regenSbImagesProgress = ref({})
  const batchImageRunning = ref(false)
  const batchImageStopping = ref(false)
  const batchImageProgress = ref({ current: 0, total: 0, failed: 0 })
  const batchImageErrors = ref([])
  const batchVideoRunning = ref(false)
  const batchVideoStopping = ref(false)
  const batchVideoProgress = ref({ current: 0, total: 0, failed: 0 })
  const batchVideoErrors = ref([])

  const inferringParams = ref(false)
  const showVideoParamsDialog = ref(false)
  const videoParamsTarget = ref(null)
  const videoParamsSaving = ref(false)
  const splitByAudioLoading = ref(false)
  const videoFrameContiguity = ref(false)

  const sbDialogueAudioPaths = ref({})
  const sbNarrationAudioPaths = ref({})
  const editingSbVideoPromptId = ref(null)
  const editingSbVideoPromptText = ref('')
  const editingSbImagePromptId = ref(null)
  const editingSbImagePromptText = ref('')
  const showSbPromptDialog = ref(false)
  const sbPromptTarget = ref(null)
  const sbPromptImageText = ref('')
  const sbPromptPolishedText = ref('')
  const sbPromptVideoText = ref('')
  const sbPromptSaving = ref(false)
  const sbPromptPolishing = ref(false)
  const showFramePromptEditor = ref(false)
  const editingFramePromptSb = ref(null)
  const editingFramePromptSlot = ref('first')
  const editingFramePromptText = ref('')
  const editingFramePromptSaving = ref(false)
  const editingFramePromptRegenerating = ref(false)

  const uploadingSbImageId = ref(null)
  const sbImageFileInput = ref(null)
  const sbImageUploadForId = ref(null)
  const dragOverSbId = ref(null)

  let storyboardMediaPromise = null
  let storyboardMediaKey = ''

  function defaultStoryboardDuration() {
    return Number(videoClipDuration?.value ?? videoClipDuration) || 10
  }

  function isFirstLastFrameMode() {
    return !!(storyboardUseFirstLastFrame?.value ?? storyboardUseFirstLastFrame)
  }

  function syncStoryboardStateFromEpisode(episode) {
    const boards = episode?.storyboards || []
    const nextCharIds = {}
    const nextPropIds = {}
    const nextScene = {}
    const nextDialogue = {}
    const nextNarration = {}
    const nextShot = {}
    const nextTitle = {}
    const nextLocation = {}
    const nextTime = {}
    const nextDuration = {}
    const nextAction = {}
    const nextResult = {}
    const nextAtmosphere = {}
    const nextAngle = {}
    const nextAngleH = {}
    const nextAngleV = {}
    const nextAngleS = {}
    const nextMovement = {}
    const nextLighting = {}
    const nextDof = {}
    const nextLayoutDescription = {}
    const nextCreationMode = {}
    const nextUniversalSegment = {}

    for (const storyboard of boards) {
      nextScene[storyboard.id] = storyboard.scene_id ?? null
      nextDialogue[storyboard.id] = storyboard.dialogue ?? ''
      nextNarration[storyboard.id] = storyboard.narration ?? ''
      nextShot[storyboard.id] = (storyboard.shot_type ?? '').toString() || ''
      nextTitle[storyboard.id] = (storyboard.title ?? '').toString()
      nextLocation[storyboard.id] = (storyboard.location ?? '').toString()
      nextTime[storyboard.id] = (storyboard.time ?? '').toString()
      nextDuration[storyboard.id] = storyboard.duration != null ? Number(storyboard.duration) : defaultStoryboardDuration()
      nextAction[storyboard.id] = (storyboard.action ?? '').toString()
      nextResult[storyboard.id] = (storyboard.result ?? '').toString()
      nextAtmosphere[storyboard.id] = (storyboard.atmosphere ?? '').toString()
      nextAngle[storyboard.id] = (storyboard.angle ?? '').toString()
      nextAngleH[storyboard.id] = storyboard.angle_h || ''
      nextAngleV[storyboard.id] = storyboard.angle_v || ''
      nextAngleS[storyboard.id] = storyboard.angle_s || ''
      nextMovement[storyboard.id] = (storyboard.movement ?? '').toString()
      nextLighting[storyboard.id] = storyboard.lighting_style || ''
      nextDof[storyboard.id] = storyboard.depth_of_field || ''
      nextLayoutDescription[storyboard.id] = (storyboard.layout_description ?? '').toString()
      const charList = Array.isArray(storyboard.characters)
        ? storyboard.characters
        : (storyboard.characters != null ? [storyboard.characters] : [])
      nextCharIds[storyboard.id] = charList
        .map((character) => (typeof character === 'object' && character != null ? Number(character.id) : Number(character)))
        .filter((id) => Number.isFinite(id))
        .slice(0, 1)
      nextPropIds[storyboard.id] = (Array.isArray(storyboard.prop_ids) ? storyboard.prop_ids : [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id))
        .slice(0, 1)
      nextCreationMode[storyboard.id] = storyboard.creation_mode === 'universal' ? 'universal' : 'classic'
      nextUniversalSegment[storyboard.id] = (storyboard.universal_segment_text ?? '').toString()
    }

    sbCharacterIds.value = nextCharIds
    sbPropIds.value = nextPropIds
    sbSceneId.value = nextScene
    sbDialogue.value = nextDialogue
    sbNarration.value = nextNarration
    sbShotType.value = nextShot
    sbTitle.value = nextTitle
    sbLocation.value = nextLocation
    sbTime.value = nextTime
    sbDuration.value = nextDuration
    sbAction.value = nextAction
    sbResult.value = nextResult
    sbAtmosphere.value = nextAtmosphere
    sbAngle.value = nextAngle
    sbAngleH.value = nextAngleH
    sbAngleV.value = nextAngleV
    sbAngleS.value = nextAngleS
    sbMovement.value = nextMovement
    sbLighting.value = nextLighting
    sbDof.value = nextDof
    sbLayoutDescription.value = nextLayoutDescription
    sbCreationMode.value = nextCreationMode
    sbUniversalSegmentText.value = nextUniversalSegment
  }

  function getSbCharacterIds(storyboardId) {
    const ids = sbCharacterIds.value[storyboardId]
    return Array.isArray(ids) && ids.length > 0 ? ids : EMPTY_ARR
  }

  function getSbCharacterId(storyboardId) {
    const ids = getSbCharacterIds(storyboardId)
    return ids.length ? ids[0] : null
  }

  function setSbCharacterId(storyboardId, value) {
    const id = Number(value)
    const next = Number.isFinite(id) && id > 0 ? [id] : []
    sbCharacterIds.value = { ...sbCharacterIds.value, [storyboardId]: next }
    onStoryboardCharacterChange(storyboardId)
  }

  function getSbPropIds(storyboardId) {
    const ids = sbPropIds.value[storyboardId]
    return Array.isArray(ids) && ids.length > 0 ? ids : EMPTY_ARR
  }

  function getSbPropId(storyboardId) {
    const ids = getSbPropIds(storyboardId)
    return ids.length ? ids[0] : null
  }

  function setSbPropId(storyboardId, value) {
    const id = Number(value)
    sbPropIds.value = { ...sbPropIds.value, [storyboardId]: Number.isFinite(id) && id > 0 ? [id] : [] }
    onStoryboardPropChange(storyboardId)
  }

  async function onStoryboardCharacterChange(storyboardId) {
    const ids = sbCharacterIds.value[storyboardId] || []
    try {
      await storyboardsAPI.update(storyboardId, { character_ids: ids })
    } catch (error) {
      console.warn('[分镜] 保存角色失败', error)
    }
  }

  function onStoryboardPropChange(storyboardId) {
    const ids = sbPropIds.value[storyboardId] || []
    storyboardsAPI.update(storyboardId, { prop_ids: ids }).catch(() => {})
  }

  function onStoryboardSceneChange(storyboardId) {
    const sceneId = sbSceneId.value[storyboardId] ?? null
    storyboardsAPI.update(storyboardId, { scene_id: sceneId }).catch(() => {})
  }

  function getSbSelectedScene(storyboardId) {
    const sceneId = sbSceneId.value[storyboardId]
    if (sceneId == null) return null
    return (store?.scenes || []).find((scene) => Number(scene.id) === Number(sceneId)) || null
  }

  function getSbSelectedCharacters(storyboardId) {
    const ids = getSbCharacterIds(storyboardId)
    if (!ids.length) return []
    const list = store?.characters || []
    return ids.map((id) => list.find((character) => Number(character.id) === Number(id))).filter(Boolean)
  }

  function getSbSelectedProps(storyboardId) {
    const ids = getSbPropIds(storyboardId)
    if (!ids.length) return []
    const list = store?.props || []
    return ids.map((id) => list.find((prop) => Number(prop.id) === Number(id))).filter(Boolean)
  }

  function charactersAvailableToAddToSb(storyboardId) {
    const currentId = Number(getSbCharacterId(storyboardId))
    return (store?.characters || []).filter((character) => character && Number(character.id) !== currentId)
  }

  function onSbAddCharacterCommand(storyboardId, characterId) {
    const id = Number(characterId)
    if (!Number.isFinite(id)) return
    setSbCharacterId(storyboardId, id)
  }

  function getMovementLabel(value) {
    if (!value) return ''
    const labels = {
      static: '固定',
      push: '推镜',
      pull: '拉镜',
      pan: '横摇',
      tilt: '纵摇',
      tracking: '跟镜',
      crane_up: '升镜',
      crane_dn: '降镜',
      orbit: '环绕',
      handheld: '手持',
      zoom: '变焦',
      roll: '旋转',
      whip_pan: '甩镜',
      spiral: '螺旋',
      hitchcock_zoom: '希区柯克',
      bullet_time: '子弹时间',
      dutch_angle_move: '荷兰角',
      dolly_track: '推轨',
      slowmo_orbit: '升格环绕',
    }
    return labels[value] || value
  }

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

  async function updateStoryboardImageMeta(storyboardId, image, patch) {
    if (!image?.id) return null
    const updated = await imagesAPI.update(image.id, patch)
    const list = sbImages.value[storyboardId] || []
    sbImages.value = {
      ...sbImages.value,
      [storyboardId]: list.map((item) => Number(item.id) === Number(image.id) ? { ...item, ...updated } : item),
    }
    return updated
  }

  async function onEditKeyframeDescription(storyboard, item) {
    if (!storyboard?.id || !item?.img || item.aux) return
    const current = keyframeTimelineLine(storyboard, item.img)
    let value = ''
    try {
      const result = await ElMessageBox.prompt(
        '这段文字会随关键帧一起进入视频提示词，用来补充时间轴、动作承接和剪辑意图。',
        '编辑关键帧描述',
        {
          confirmButtonText: '保存',
          cancelButtonText: '取消',
          inputType: 'textarea',
          inputValue: current,
          inputPlaceholder: '例如：0-5秒 首帧：角色站在门口迟疑，镜头缓慢推近，右侧留出进入空间',
        }
      )
      value = (result?.value || '').toString().trim()
    } catch {
      return
    }
    const params = parseImageParamsJson(item.img)
    const nextParams = {
      ...params,
      keyframe_description: value || defaultKeyframeDescription(storyboard, item.img),
      keyframe_description_updated_at: new Date().toISOString(),
    }
    try {
      await updateStoryboardImageMeta(storyboard.id, item.img, { params_json: nextParams })
      ElMessage.success('关键帧描述已保存')
    } catch (error) {
      ElMessage.error(error.message || '保存失败')
    }
  }

  async function onToggleKeyframeLocked(storyboard, item) {
    if (!storyboard?.id || !item?.img) return
    try {
      await updateStoryboardImageMeta(storyboard.id, item.img, { locked: !item.img.locked })
      ElMessage.success(item.img.locked ? '已解锁' : '已锁定')
    } catch (error) {
      ElMessage.error(error.message || '操作失败')
    }
  }

  async function onToggleKeyframeSelected(storyboard, item) {
    if (!storyboard?.id || !item?.img) return
    if (item.aux || isAuxStoryboardImage(item.img)) {
      ElMessage.info('辅助稿只作为视频参考，不设为主图')
      return
    }
    try {
      const next = !item.img.selected
      await updateStoryboardImageMeta(storyboard.id, item.img, { selected: next })
      if (next) sbSelectedImgId.value = { ...sbSelectedImgId.value, [storyboard.id]: item.img.id }
      ElMessage.success(next ? '已确认该格' : '已取消确认')
    } catch (error) {
      ElMessage.error(error.message || '操作失败')
    }
  }

  async function onStripItemClick(storyboard, item) {
    if (item?.aux || isAuxStoryboardImage(item?.img)) {
      openImagePreview(item.src)
      return
    }
    if (!isFirstLastFrameMode()) {
      onSelectStripItem(storyboard, item)
      return
    }
    try {
      await ElMessageBox.confirm('将此图绑定到哪个槽位？', '设置参考帧', {
        confirmButtonText: '设为首帧',
        cancelButtonText: '设为尾帧',
        distinguishCancelAndClose: true,
        type: 'info',
      })
      onSelectSbFrameImage(storyboard, item.img, 'first')
      ElMessage.success('已设为首帧')
    } catch (action) {
      if (action === 'cancel') {
        onSelectSbFrameImage(storyboard, item.img, 'last')
        ElMessage.success('已设为尾帧')
      }
    }
  }

  function onSelectStripItem(storyboard, item) {
    if (item?.aux || isAuxStoryboardImage(item?.img)) {
      openImagePreview(item.src)
      return
    }
    onSelectSbMainImage(storyboard, item.img)
  }

  function onSelectSbFrameImage(storyboard, image, slot) {
    if (!storyboard?.id || !image) return
    const isLast = slot === 'last'

    if (isLast) {
      sbSelectedLastImgId.value = { ...sbSelectedLastImgId.value, [storyboard.id]: image.id }
    } else {
      sbSelectedImgId.value = { ...sbSelectedImgId.value, [storyboard.id]: image.id }
    }

    const list = store?.currentEpisode?.storyboards
    if (Array.isArray(list)) {
      const row = list.find((item) => Number(item.id) === Number(storyboard.id))
      if (row) {
        const now = new Date().toISOString()
        if (isLast) {
          row.last_frame_image_id = image.id
          row.last_frame_image_url = image.image_url || null
          row.last_frame_local_path = image.local_path || null
        } else {
          row.first_frame_image_id = image.id
          row.image_url = image.image_url || null
          row.local_path = image.local_path || null
        }
        row.updated_at = now
      }
    }

    const patch = { updated_at: new Date().toISOString() }
    if (isLast) {
      patch.last_frame_image_id = image.id
      patch.last_frame_image_url = image.image_url || null
      patch.last_frame_local_path = image.local_path || undefined
    } else {
      patch.image_url = image.image_url || null
      patch.local_path = image.local_path || undefined
      patch.first_frame_image_id = image.id
    }

    storyboardsAPI.update(storyboard.id, patch).catch((error) => console.warn('[参考帧] 保存失败', error))
  }

  function onSelectSbMainImage(storyboard, image) {
    onSelectSbFrameImage(storyboard, image, 'first')
  }

  async function onRemoveSbHistoryImage(storyboardId, imageGenId) {
    if (!storyboardId || !imageGenId) return
    if (!(await confirmAdminProjectOperation('删除历史参考图'))) return
    try {
      await ElMessageBox.confirm('确定删除这张历史参考图？此操作不可恢复。', '删除历史图', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
        distinguishCancelAndClose: true,
      })
      await imagesAPI.delete(imageGenId)
      await loadSingleStoryboardMedia(storyboardId)
      ElMessage.success('历史图已删除')
    } catch (error) {
      if (error !== 'cancel' && error !== 'close') {
        ElMessage.error(error?.message || '删除失败')
      }
    }
  }

  function onSelectSbMainVideo(storyboard, video) {
    sbSelectedVideoId.value = { ...sbSelectedVideoId.value, [storyboard.id]: video.id }
    storyboardsAPI.update(storyboard.id, {
      video_url: video.video_url || null,
      local_path: video.local_path || undefined,
    }).catch((error) => console.warn('[主视频] 保存后端失败', error))
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

  function restoreSelectionsFromBackend() {
    const boards = store?.storyboards || []
    for (const storyboard of boards) {
      const images = getSbAllImages(storyboard.id)
      if (sbSelectedImgId.value[storyboard.id] == null) {
        const confirmed = images.find((img) => img.selected && img.frame_type === 'storyboard_keyframe')
        if (confirmed) {
          sbSelectedImgId.value = { ...sbSelectedImgId.value, [storyboard.id]: confirmed.id }
        } else if (storyboard.first_frame_image_id != null) {
          sbSelectedImgId.value = { ...sbSelectedImgId.value, [storyboard.id]: storyboard.first_frame_image_id }
        } else {
          const storyboardPath = (storyboard.local_path || '').trim()
          const storyboardUrl = (storyboard.image_url || '').trim()
          if (storyboardPath || storyboardUrl) {
            const matched = images.find(
              (img) =>
                (storyboardPath && img.local_path && img.local_path === storyboardPath) ||
                (storyboardUrl && img.image_url && img.image_url === storyboardUrl)
            )
            if (matched) {
              sbSelectedImgId.value = { ...sbSelectedImgId.value, [storyboard.id]: matched.id }
            }
          }
        }
      }
      if (sbSelectedLastImgId.value[storyboard.id] == null && storyboard.last_frame_image_id != null) {
        sbSelectedLastImgId.value = { ...sbSelectedLastImgId.value, [storyboard.id]: storyboard.last_frame_image_id }
      }
    }
  }

  async function loadStoryboardMedia({ force = false } = {}) {
    const boards = store?.storyboards || []
    if (boards.length === 0) {
      sbImages.value = {}
      sbVideos.value = {}
      return
    }
    const ids = boards.map((storyboard) => Number(storyboard.id)).filter((id) => Number.isFinite(id) && id > 0)
    const key = ids.join(',')
    if (!force && storyboardMediaPromise && storyboardMediaKey === key) return storyboardMediaPromise
    storyboardMediaKey = key
    storyboardMediaPromise = (async () => {
      const nextImages = {}
      const nextVideos = {}
      for (const id of ids) {
        nextImages[id] = []
        nextVideos[id] = []
      }
      try {
        const [imageResult, videoResult] = await Promise.all([
          imagesAPI.list({ storyboard_ids: key, page: 1, page_size: 500 }),
          videosAPI.list({ storyboard_ids: key, page: 1, page_size: 500 }),
        ])
        const imageMap = groupByStoryboardId(imageResult?.items || [])
        const videoMap = groupByStoryboardId(videoResult?.items || [])
        for (const id of ids) {
          nextImages[id] = imageMap[id] || []
          nextVideos[id] = videoMap[id] || []
        }
      } catch (_) {
        // 保留空数组，避免单次媒体加载失败时旧数据误显示到新剧集。
      }
      if (storyboardMediaKey === key) {
        sbImages.value = nextImages
        sbVideos.value = nextVideos
        restoreSelectionsFromBackend()
      }
    })()
    return storyboardMediaPromise.finally(() => {
      if (storyboardMediaKey === key) storyboardMediaPromise = null
    })
  }

  async function loadSingleStoryboardMedia(storyboardId) {
    if (!storyboardId) return
    try {
      const [imageResult, videoResult] = await Promise.all([
        imagesAPI.list({ storyboard_id: storyboardId, page: 1, page_size: 100 }),
        videosAPI.list({ storyboard_id: storyboardId, page: 1, page_size: 50 }),
      ])
      sbImages.value = {
        ...sbImages.value,
        [storyboardId]: (imageResult && imageResult.items) ? imageResult.items : [],
      }
      sbVideos.value = {
        ...sbVideos.value,
        [storyboardId]: (videoResult && videoResult.items) ? videoResult.items : [],
      }
      restoreSelectionsFromBackend()
    } catch (_) {
      // 静默忽略，不影响其他分镜的显示。
    }
  }

  return {
    batchImageErrors,
    batchImageProgress,
    batchImageRunning,
    batchImageStopping,
    batchVideoErrors,
    batchVideoProgress,
    batchVideoRunning,
    batchVideoStopping,
    charactersAvailableToAddToSb,
    canUsePrevTailAsFirst,
    dragOverSbId,
    editingFramePromptRegenerating,
    editingFramePromptSaving,
    editingFramePromptSb,
    editingFramePromptSlot,
    editingFramePromptText,
    editingSbImagePromptId,
    editingSbImagePromptText,
    editingSbVideoPromptId,
    editingSbVideoPromptText,
    generatingSbFirstImageIds,
    generatingSbImageIds,
    generatingSbLastImageIds,
    generatingSbVideoIds,
    generatingUniversalSegmentIds,
    frameTypeForSlot,
    auxRoleFrameType,
    auxRoleLabel,
    buildKeyframeParamsJson,
    compactKeyframeText,
    defaultKeyframeDescription,
    formatKeyframeSecond,
    getMovementLabel,
    getNextStoryboard,
    getPrevStoryboard,
    getQuadGridImage,
    getStripItems,
    getSbAllImages,
    getSbAllVideos,
    getSbCharacterId,
    getSbCharacterIds,
    getSbFirstImage,
    getSbImage,
    getSbLastImage,
    getSbPrimaryImages,
    getSbPropId,
    getSbPropIds,
    getSbSelectedCharacters,
    getSbSelectedProps,
    getSbSelectedScene,
    getSbVideo,
    getSbVideoError,
    getVideoStripItems,
    keyframeDescriptionFromParams,
    keyframeIndexInfo,
    keyframeItemLabel,
    keyframeTimelineLine,
    keyframeTimeRange,
    groupByStoryboardId,
    hasSbFirstLastPair,
    hasSbImage,
    inferringParams,
    isAuxStoryboardImage,
    linkingTailFrameIds,
    regeneratingLayoutSbIds,
    regenSbImagesForAsset,
    regenSbImagesProgress,
    sbAction,
    sbAngle,
    sbAngleH,
    sbAngleS,
    sbAngleV,
    sbAtmosphere,
    sbCharacterIds,
    sbCreationMode,
    sbDialogue,
    sbDialogueAudioPaths,
    sbDof,
    sbDuration,
    sbImageFileInput,
    sbImages,
    sbImageUploadForId,
    sbImageUploadSlotById,
    sbLayoutDescription,
    sbLighting,
    sbLocation,
    sbMovement,
    sbNarration,
    sbNarrationAudioPaths,
    sbPropIds,
    sbPromptImageText,
    sbPromptPolishedText,
    sbPromptPolishing,
    sbPromptSaving,
    sbPromptTarget,
    sbPromptVideoText,
    sbResult,
    sbSceneId,
    sbSelectedImgId,
    sbSelectedLastImgId,
    sbSelectedVideoId,
    sbShotType,
    sbTime,
    sbTitle,
    sbUniversalSegmentText,
    sbVideoErrors,
    sbVideos,
    storyboardAuxRoleOptions,
    loadSingleStoryboardMedia,
    loadStoryboardMedia,
    onSbAddCharacterCommand,
    onEditKeyframeDescription,
    onRemoveSbHistoryImage,
    onSelectSbFrameImage,
    onSelectSbMainImage,
    onSelectSbMainVideo,
    onSelectStripItem,
    onStoryboardCharacterChange,
    onStoryboardPropChange,
    onStoryboardSceneChange,
    onStripItemClick,
    onToggleKeyframeLocked,
    onToggleKeyframeSelected,
    parseImageParamsJson,
    parseJsonObject,
    quadPanelLabel,
    resolveSbImageById,
    restoreSelectionsFromBackend,
    sbMainVideoPlayerKey,
    setSbCharacterId,
    setSbPropId,
    showFramePromptEditor,
    showSbPromptDialog,
    showVideoParamsDialog,
    splitByAudioLoading,
    syncStoryboardStateFromEpisode,
    ttsSbIds,
    ttsSbNarrationIds,
    updateStoryboardImageMeta,
    uploadingSbImageId,
    uploadingSbImageSlot,
    upscalingSbIds,
    usingPrevTailAsFirstIds,
    videoFrameContiguity,
    videoParamsSaving,
    videoParamsTarget,
  }
}
