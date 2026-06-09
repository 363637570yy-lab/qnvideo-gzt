import { ref } from 'vue'

export function useMediaPreview(deps = {}) {
  const {
    getCharacters = () => [],
    getProps = () => [],
    getScenes = () => [],
    getStoryboardImagesMap = () => ({}),
    getStoryboards = () => [],
    getCharLibraryList = () => [],
    getDramaAllCharList = () => [],
    getPropLibraryList = () => [],
    getDramaAllPropList = () => [],
    getSceneLibraryList = () => [],
    getDramaAllSceneList = () => [],
    parseExtraImages = () => [],
    localPathToUrl = (path) => path || '',
  } = deps

  const baseUrl = ref('')
  const previewImageUrl = ref(null)
  const previewGallery = ref([])
  const previewImageIndex = ref(0)

  function imageUrl(url) {
    if (!url) return ''
    if (url.startsWith('http')) return url
    const base = (baseUrl.value || '').replace(/\/$/, '')
    return base ? base + '/' + url.replace(/^\//, '') : url
  }

  function staticThumbUrlFromRel(rel, width = 320) {
    const clean = String(rel || '').replace(/^\/+/, '')
    if (!clean) return ''
    return `/static-thumb/${width}/` + clean.split('/').map(encodeURIComponent).join('/')
  }

  function thumbImageUrl(url, width = 320) {
    if (!url) return ''
    const raw = String(url)
    if (raw.startsWith('/static/')) return staticThumbUrlFromRel(raw.slice('/static/'.length), width)
    if (raw.startsWith('static/')) return staticThumbUrlFromRel(raw.slice('static/'.length), width)
    if (!raw.startsWith('http')) return imageUrl(raw)
    try {
      const u = new URL(raw, window.location.origin)
      const marker = '/static/'
      const idx = u.pathname.indexOf(marker)
      if (u.origin === window.location.origin && idx >= 0) {
        return staticThumbUrlFromRel(decodeURIComponent(u.pathname.slice(idx + marker.length)), width)
      }
    } catch (_) {}
    return imageUrl(raw)
  }

  function assetImageUrl(item) {
    if (!item) return ''
    if (typeof item === 'string') return imageUrl(item)
    const localPath = item.local_path && String(item.local_path).trim()
    if (localPath) return '/static/' + localPath.replace(/^\//, '')
    if (item.image_url) return imageUrl(item.image_url)
    return ''
  }

  function assetThumbUrl(item, width = 320) {
    if (!item) return ''
    if (typeof item === 'string') return thumbImageUrl(item, width)
    const localPath = item.local_path && String(item.local_path).trim()
    if (localPath) return staticThumbUrlFromRel(localPath.replace(/^\//, ''), width)
    if (item.thumbnail_url) return imageUrl(item.thumbnail_url)
    if (item.image_url) return thumbImageUrl(item.image_url, width)
    return ''
  }

  function hasAssetImage(item) {
    if (!item) return false
    return !!(item.image_url || item.local_path)
  }

  function collectImagePreviewGallery() {
    const out = []
    const seen = new Set()
    const add = (url) => {
      const u = imageUrl(url)
      if (!u || seen.has(u)) return
      seen.add(u)
      out.push({ url: u })
    }
    const addAsset = (item) => add(assetImageUrl(item))

    ;(getCharacters() || []).forEach((item) => {
      addAsset(item)
      parseExtraImages(item).forEach((p) => add(localPathToUrl(p)))
    })
    ;(getProps() || []).forEach((item) => {
      addAsset(item)
      parseExtraImages(item).forEach((p) => add(localPathToUrl(p)))
    })
    ;(getScenes() || []).forEach((item) => {
      addAsset(item)
      parseExtraImages(item).forEach((p) => add(localPathToUrl(p)))
    })
    Object.values(getStoryboardImagesMap() || {}).forEach((list) => {
      ;(Array.isArray(list) ? list : []).forEach(addAsset)
    })
    ;(getStoryboards() || []).forEach((sb) => {
      if (sb?.composed_image || sb?.image_url) add(imageUrl(sb.composed_image || sb.image_url))
      if (sb?.last_frame_image_url || sb?.last_frame_local_path) {
        add(assetImageUrl({ image_url: sb.last_frame_image_url, local_path: sb.last_frame_local_path }))
      }
    })
    ;(getCharLibraryList() || []).forEach(addAsset)
    ;(getDramaAllCharList() || []).forEach(addAsset)
    ;(getPropLibraryList() || []).forEach(addAsset)
    ;(getDramaAllPropList() || []).forEach(addAsset)
    ;(getSceneLibraryList() || []).forEach(addAsset)
    ;(getDramaAllSceneList() || []).forEach(addAsset)
    return out
  }

  function openImagePreview(url, gallery = null) {
    const target = imageUrl(url)
    if (!target) return
    const list = Array.isArray(gallery) && gallery.length ? gallery : collectImagePreviewGallery()
    let idx = list.findIndex((item) => item?.url === target)
    if (idx < 0) {
      previewGallery.value = [{ url: target }, ...list.filter((item) => item?.url !== target)]
      idx = 0
    } else {
      previewGallery.value = list
    }
    previewImageIndex.value = idx
    previewImageUrl.value = previewGallery.value[idx]?.url || target
  }

  function closeImagePreview() {
    previewImageUrl.value = null
    previewGallery.value = []
    previewImageIndex.value = 0
  }

  function showPreviewImage(offset) {
    if (!previewGallery.value.length) return
    const total = previewGallery.value.length
    previewImageIndex.value = (previewImageIndex.value + offset + total) % total
    previewImageUrl.value = previewGallery.value[previewImageIndex.value]?.url || null
  }

  function onImagePreviewKeydown(e) {
    if (!previewImageUrl.value) return
    if (e.key === 'Escape') closeImagePreview()
    else if (e.key === 'ArrowLeft') showPreviewImage(-1)
    else if (e.key === 'ArrowRight') showPreviewImage(1)
  }

  function assetVideoUrl(item) {
    if (!item) return ''
    const localPath = item.local_path && String(item.local_path).trim()
    if (localPath) return '/static/' + localPath.replace(/^\//, '')
    if (item.video_url) return imageUrl(item.video_url)
    return ''
  }

  function isHttpVideoUrl(url) {
    if (!url || typeof url !== 'string') return false
    const t = url.trim()
    return t.startsWith('http://') || t.startsWith('https://')
  }

  function recordHasPlayableVideoUrl(i) {
    if (!i) return false
    const lp = i.local_path && String(i.local_path).trim()
    if (lp) return true
    return isHttpVideoUrl(i.video_url)
  }

  return {
    baseUrl,
    previewImageUrl,
    previewGallery,
    previewImageIndex,
    imageUrl,
    staticThumbUrlFromRel,
    thumbImageUrl,
    assetImageUrl,
    assetThumbUrl,
    hasAssetImage,
    collectImagePreviewGallery,
    openImagePreview,
    closeImagePreview,
    showPreviewImage,
    onImagePreviewKeydown,
    assetVideoUrl,
    isHttpVideoUrl,
    recordHasPlayableVideoUrl,
  }
}
