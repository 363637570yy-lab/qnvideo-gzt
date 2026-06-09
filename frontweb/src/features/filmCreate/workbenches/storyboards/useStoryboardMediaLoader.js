export function useStoryboardMediaLoader(options = {}) {
  const {
    store,
    imagesAPI,
    videosAPI,
    sbImages,
    sbVideos,
    sbSelectedImgId,
    sbSelectedLastImgId,
    groupByStoryboardId = () => ({}),
    getSbAllImages = () => [],
  } = options

  let storyboardMediaPromise = null
  let storyboardMediaKey = ''

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
    loadSingleStoryboardMedia,
    loadStoryboardMedia,
    restoreSelectionsFromBackend,
    updateStoryboardImageMeta,
  }
}
