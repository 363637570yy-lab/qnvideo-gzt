import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { localPathToUrl, parseExtraImages, resourceImageKey } from '../utils/resourceImages'

export function useResourceImageManager(deps = {}) {
  const {
    store,
    dramaId,
    uploadAPI,
    characterAPI,
    propAPI,
    sceneAPI,
    loadDrama = async () => {},
    confirmAdminProjectOperation = async () => true,
    thumbImageUrl = (url) => url,
    staticThumbUrlFromRel = (path) => localPathToUrl(path),
    addCharRefImage,
    addPropRefImage,
    addSceneRefImage,
    addPropAddRefImage,
    extractingCharAppearance,
    extractingPropDesc,
    extractingSceneDesc,
    editCharacterForm,
    editPropForm,
    editSceneForm,
  } = deps

  const resourceImageFileInput = ref(null)
  const resourceUploadType = ref(null)
  const resourceUploadId = ref(null)
  const uploadingResourceId = ref(null)
  const dragOverResourceKey = ref(null)
  let resourceUploadPreconfirm = null

  function isFreshPreconfirm(marker) {
    return !!(marker && Number(marker.expiresAt) > Date.now())
  }

  function consumeResourceUploadPreconfirm(type, id) {
    const marker = resourceUploadPreconfirm
    resourceUploadPreconfirm = null
    return !!(
      isFreshPreconfirm(marker) &&
      String(marker.type) === String(type) &&
      String(marker.id) === String(id)
    )
  }

  function getFirstImageFile(dataTransfer) {
    if (!dataTransfer?.files?.length) return null
    const file = Array.from(dataTransfer.files).find((f) => f.type.startsWith('image/'))
    return file || null
  }

  function readFileAsRefImage(file) {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (ev) => resolve({ dataUrl: ev.target.result, filename: file.name })
      reader.readAsDataURL(file)
    })
  }

  async function onRefImageFileChange(type, event) {
    const file = event.target?.files?.[0]
    if (!file) return
    const result = await readFileAsRefImage(file)
    if (type === 'character') addCharRefImage.value = result
    else if (type === 'prop') addPropRefImage.value = result
    else if (type === 'scene') addSceneRefImage.value = result
    event.target.value = ''
  }

  async function onRefImageDrop(type, event) {
    const file = getFirstImageFile(event.dataTransfer)
    if (!file) return
    const result = await readFileAsRefImage(file)
    if (type === 'character') addCharRefImage.value = result
    else if (type === 'prop') addPropRefImage.value = result
    else if (type === 'scene') addSceneRefImage.value = result
  }

  async function onRefImageFileChange2(type, event) {
    const file = event.target?.files?.[0]
    if (!file) return
    const result = await readFileAsRefImage(file)
    if (type === 'addProp') addPropAddRefImage.value = result
    event.target.value = ''
  }

  async function onRefImageDrop2(type, event) {
    const file = getFirstImageFile(event.dataTransfer)
    if (!file) return
    const result = await readFileAsRefImage(file)
    if (type === 'addProp') addPropAddRefImage.value = result
  }

  async function doExtractFromRef(type) {
    if (type === 'character') {
      const refImage = addCharRefImage.value
      if (!refImage) return
      extractingCharAppearance.value = true
      try {
        const name = editCharacterForm.value?.name || ''
        const res = await uploadAPI.extractDescriptionFromImage('character', refImage.dataUrl, name)
        if (res?.description && editCharacterForm.value) {
          editCharacterForm.value.appearance = res.description
          ElMessage.success('已从参考图提取外貌描述')
        }
      } catch (e) {
        ElMessage.error(e.message || '提取失败，请检查 AI 配置中是否有支持视觉的模型')
      } finally {
        extractingCharAppearance.value = false
      }
      return
    }

    if (type === 'prop') {
      const refImage = addPropRefImage.value
      if (!refImage) return
      extractingPropDesc.value = true
      try {
        const name = editPropForm.value?.name || ''
        const res = await uploadAPI.extractDescriptionFromImage('prop', refImage.dataUrl, name)
        if (res?.description && editPropForm.value) {
          editPropForm.value.description = res.description
          ElMessage.success('已从参考图提取特征描述')
        }
      } catch (e) {
        ElMessage.error(e.message || '提取失败，请检查 AI 配置中是否有支持视觉的模型')
      } finally {
        extractingPropDesc.value = false
      }
      return
    }

    if (type === 'scene') {
      const refImage = addSceneRefImage.value
      if (!refImage) return
      extractingSceneDesc.value = true
      try {
        const name = editSceneForm.value?.name || ''
        const res = await uploadAPI.extractDescriptionFromImage('scene', refImage.dataUrl, name)
        if (res?.description && editSceneForm.value) {
          editSceneForm.value.description = res.description
          ElMessage.success('已从参考图提取场景描述')
        }
      } catch (e) {
        ElMessage.error(e.message || '提取失败，请检查 AI 配置中是否有支持视觉的模型')
      } finally {
        extractingSceneDesc.value = false
      }
    }
  }

  function onResourceDragOver(e, type, id) {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    dragOverResourceKey.value = resourceImageKey(type, id)
  }

  function onResourceDragLeave(e, key) {
    e.preventDefault()
    if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return
    if (key && dragOverResourceKey.value !== key) return
    dragOverResourceKey.value = null
  }

  function onResourceDrop(e, type, id) {
    e.preventDefault()
    e.stopPropagation()
    dragOverResourceKey.value = null
    const file = getFirstImageFile(e.dataTransfer)
    if (file) doUploadResourceImage(type, id, file)
  }

  async function onUploadResourceClick(type, id) {
    if (!(await confirmAdminProjectOperation('上传素材图片'))) return
    resourceUploadPreconfirm = { type: String(type), id: String(id), expiresAt: Date.now() + 60000 }
    resourceUploadType.value = type
    resourceUploadId.value = id
    resourceImageFileInput.value?.click()
  }

  function localPathToThumbUrl(path, width = 160) {
    if (!path) return ''
    if (String(path).startsWith('http')) return thumbImageUrl(path, width)
    return staticThumbUrlFromRel(String(path).replace(/^\//, ''), width)
  }

  function findResource(type, id) {
    const list = type === 'character' ? (store.characters ?? [])
      : type === 'prop' ? (store.props ?? [])
      : (store.scenes ?? [])
    return list.find((item) => Number(item.id) === Number(id)) || null
  }

  async function updateResourceImage(type, id, payload) {
    if (type === 'character') return characterAPI.putImage(id, payload)
    if (type === 'prop') return propAPI.update(id, payload)
    if (type === 'scene') return sceneAPI.update(id, payload)
    return null
  }

  async function doUploadResourceImage(type, id, file) {
    if (!file || !type || id == null) return
    if (!consumeResourceUploadPreconfirm(type, id) && !(await confirmAdminProjectOperation('上传素材图片'))) return
    uploadingResourceId.value = resourceImageKey(type, id)
    try {
      const res = await uploadAPI.uploadImage(file, { dramaId: dramaId.value })
      const data = res?.data ?? res
      const uploadedLocalPath = data?.local_path || data?.path || null
      const url = data?.url || uploadedLocalPath
      if (!url) {
        ElMessage.error('上传未返回地址')
        return
      }

      const current = findResource(type, id)
      const hasPrimary = !!(current?.local_path || current?.image_url)
      if (hasPrimary) {
        const extras = parseExtraImages(current)
        const newPath = uploadedLocalPath || url
        if (!extras.includes(newPath)) extras.push(newPath)
        await updateResourceImage(type, id, { extra_images: JSON.stringify(extras) })
      } else {
        await updateResourceImage(type, id, { image_url: url, local_path: uploadedLocalPath ?? null })
      }
      await loadDrama()
      ElMessage.success('上传成功')
    } catch (e) {
      ElMessage.error(e.message || '上传失败')
    } finally {
      uploadingResourceId.value = null
    }
  }

  async function onSetPrimaryImage(type, item, extraPath) {
    if (!(await confirmAdminProjectOperation('切换素材主图'))) return
    const extras = parseExtraImages(item)
    const oldPrimary = item.local_path || ''
    const newExtras = extras.filter((p) => p !== extraPath)
    if (oldPrimary) newExtras.unshift(oldPrimary)
    try {
      await updateResourceImage(type, item.id, {
        local_path: extraPath,
        image_url: '',
        extra_images: JSON.stringify(newExtras),
      })
      await loadDrama()
    } catch (e) {
      ElMessage.error(e.message || '操作失败')
    }
  }

  async function onRemoveExtraImage(type, item, extraPath) {
    if (!(await confirmAdminProjectOperation('删除素材历史图'))) return
    const extras = parseExtraImages(item).filter((p) => p !== extraPath)
    const extraJson = extras.length ? JSON.stringify(extras) : null
    try {
      await updateResourceImage(type, item.id, { extra_images: extraJson })
      await loadDrama()
    } catch (e) {
      ElMessage.error(e.message || '删除失败')
    }
  }

  function onResourceImageFileChange(ev) {
    const file = ev.target?.files?.[0]
    const type = resourceUploadType.value
    const id = resourceUploadId.value
    if (!file || !type || id == null) {
      resourceUploadPreconfirm = null
      ev.target.value = ''
      return
    }
    doUploadResourceImage(type, id, file).finally(() => {
      resourceUploadType.value = null
      resourceUploadId.value = null
      ev.target.value = ''
    })
  }

  return {
    resourceImageFileInput,
    resourceUploadType,
    resourceUploadId,
    uploadingResourceId,
    dragOverResourceKey,
    parseExtraImages,
    localPathToUrl,
    localPathToThumbUrl,
    onRefImageFileChange,
    onRefImageDrop,
    onRefImageFileChange2,
    onRefImageDrop2,
    doExtractFromRef,
    onResourceDragOver,
    onResourceDragLeave,
    onResourceDrop,
    onUploadResourceClick,
    doUploadResourceImage,
    onSetPrimaryImage,
    onRemoveExtraImage,
    onResourceImageFileChange,
  }
}
