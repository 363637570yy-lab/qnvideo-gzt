import { ref } from 'vue'
import { ElMessage } from 'element-plus'

function getFirstImageFile(dataTransfer) {
  if (!dataTransfer?.files?.length) return null
  const file = Array.from(dataTransfer.files).find((item) => item.type.startsWith('image/'))
  return file || null
}

function isFreshUploadPreconfirm(marker) {
  return !!(marker && Number(marker.expiresAt) > Date.now())
}

export function useStoryboardImageUpload(options = {}) {
  const {
    store,
    imagesAPI,
    uploadAPI,
    sbImageUploadSlotById,
    sbSelectedImgId,
    getDramaIdValue = () => null,
    isFirstLastFrameMode = () => false,
    frameTypeForSlot = (slot) => slot,
    confirmAdminProjectOperation = async () => true,
    loadSingleStoryboardMedia = async () => {},
    restoreSelectionsFromBackend = () => {},
    onSelectSbFrameImage = () => {},
  } = options

  const uploadingSbImageId = ref(null)
  const sbImageFileInput = ref(null)
  const sbImageUploadForId = ref(null)
  const dragOverSbId = ref(null)
  let sbImageUploadPreconfirm = null

  function consumeSbImageUploadPreconfirm(storyboardId, slot) {
    const marker = sbImageUploadPreconfirm
    sbImageUploadPreconfirm = null
    return !!(
      isFreshUploadPreconfirm(marker) &&
      String(marker.storyboardId) === String(storyboardId) &&
      String(marker.slot) === String(slot)
    )
  }

  async function onUploadSbImageClick(storyboard, slot = 'first') {
    if (!storyboard?.id) return
    const useSlot = isFirstLastFrameMode() ? slot : 'first'
    if (!(await confirmAdminProjectOperation(useSlot === 'last' ? '上传尾帧图片' : '上传分镜图片'))) return
    sbImageUploadPreconfirm = {
      storyboardId: String(storyboard.id),
      slot: String(useSlot),
      expiresAt: Date.now() + 60000,
    }
    sbImageUploadForId.value = storyboard.id
    sbImageUploadSlotById.value = { ...sbImageUploadSlotById.value, [storyboard.id]: slot }
    if (!isFirstLastFrameMode()) {
      uploadingSbImageId.value = storyboard.id
    }
    if (sbImageFileInput.value) {
      sbImageFileInput.value.value = ''
      sbImageFileInput.value.click()
    }
  }

  async function doUploadSbImage(storyboardId, file, slot = 'first') {
    const dramaIdValue = getDramaIdValue()
    if (!file || !storyboardId || !dramaIdValue) return
    const useSlot = isFirstLastFrameMode() ? slot : 'first'
    if (
      !consumeSbImageUploadPreconfirm(storyboardId, useSlot) &&
      !(await confirmAdminProjectOperation(useSlot === 'last' ? '上传尾帧图片' : '上传分镜图片'))
    ) {
      return
    }
    if (isFirstLastFrameMode()) {
      sbImageUploadSlotById.value = { ...sbImageUploadSlotById.value, [storyboardId]: useSlot }
    } else {
      uploadingSbImageId.value = storyboardId
    }
    try {
      if (!uploadAPI?.uploadImage) throw new Error('上传接口不可用')
      const res = await uploadAPI.uploadImage(file, { dramaId: dramaIdValue })
      const url = res?.url || res?.path
      const localPath = res?.local_path
      if (!url && !localPath) {
        ElMessage.error('上传未返回地址')
        return
      }
      const uploaded = await imagesAPI.upload({
        storyboard_id: storyboardId,
        drama_id: dramaIdValue,
        image_url: url || '',
        local_path: localPath || undefined,
        frame_type: isFirstLastFrameMode() ? frameTypeForSlot(useSlot) : undefined,
      })
      ElMessage.success(useSlot === 'last' ? '尾帧上传成功' : '首帧上传成功')
      if (uploaded?.id) {
        const storyboard = (store?.storyboards || []).find((item) => item.id === storyboardId)
        if (storyboard) onSelectSbFrameImage(storyboard, uploaded, useSlot)
      } else if (!isFirstLastFrameMode()) {
        const { [storyboardId]: _removed, ...rest } = sbSelectedImgId.value
        sbSelectedImgId.value = rest
      }
      await loadSingleStoryboardMedia(storyboardId)
      restoreSelectionsFromBackend()
    } catch (error) {
      ElMessage.error(error.message || '上传失败')
    } finally {
      uploadingSbImageId.value = null
      const nextSlots = { ...sbImageUploadSlotById.value }
      delete nextSlots[storyboardId]
      sbImageUploadSlotById.value = nextSlots
    }
  }

  function onSbImageFileChange(event) {
    const file = event.target?.files?.[0]
    const storyboardId = sbImageUploadForId.value
    if (!file || !storyboardId) {
      sbImageUploadPreconfirm = null
      event.target.value = ''
      return
    }
    const slot = sbImageUploadSlotById.value[storyboardId] || 'first'
    doUploadSbImage(storyboardId, file, slot).finally(() => {
      sbImageUploadForId.value = null
      event.target.value = ''
    })
  }

  function onSbImageDragOver(event, storyboardId) {
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    dragOverSbId.value = storyboardId
  }

  function onSbImageDragLeave(event, storyboardId) {
    event.preventDefault()
    if (event.relatedTarget && event.currentTarget.contains(event.relatedTarget)) return
    if (storyboardId != null && dragOverSbId.value !== storyboardId) return
    dragOverSbId.value = null
  }

  function onSbImageDrop(event, storyboard) {
    event.preventDefault()
    event.stopPropagation()
    dragOverSbId.value = null
    const file = getFirstImageFile(event.dataTransfer)
    if (file && storyboard?.id) doUploadSbImage(storyboard.id, file)
  }

  return {
    dragOverSbId,
    doUploadSbImage,
    onSbImageDragLeave,
    onSbImageDragOver,
    onSbImageDrop,
    onSbImageFileChange,
    onUploadSbImageClick,
    sbImageFileInput,
    sbImageUploadForId,
    uploadingSbImageId,
  }
}
