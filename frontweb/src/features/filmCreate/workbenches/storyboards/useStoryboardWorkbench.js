import { reactive, ref } from 'vue'

export function useStoryboardWorkbench(deps = {}) {
  const {
    store,
    imagesAPI,
    videosAPI,
    getSbAllImages = () => [],
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
    groupByStoryboardId,
    inferringParams,
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
    loadSingleStoryboardMedia,
    loadStoryboardMedia,
    restoreSelectionsFromBackend,
    showFramePromptEditor,
    showSbPromptDialog,
    showVideoParamsDialog,
    splitByAudioLoading,
    ttsSbIds,
    ttsSbNarrationIds,
    uploadingSbImageId,
    upscalingSbIds,
    usingPrevTailAsFirstIds,
    videoFrameContiguity,
    videoParamsSaving,
    videoParamsTarget,
  }
}
