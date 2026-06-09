import { ref } from 'vue'
import { ElMessage } from 'element-plus'

export function useStoryboardFramePrompts(options = {}) {
  const {
    store,
    storyboardsAPI,
    pollTask = async () => null,
    sbLocation,
    sbTime,
    sbShotType,
    sbAngleH,
    sbAngleV,
    sbAngleS,
    sbResult,
    sbAction,
    sbAtmosphere,
    angleToPromptFragment = () => ({ label: '' }),
    getSelectedStylePrompt = () => '',
    getSelectedStylePromptZh = () => '',
  } = options

  const showFramePromptEditor = ref(false)
  const editingFramePromptSb = ref(null)
  const editingFramePromptSlot = ref('first')
  const editingFramePromptText = ref('')
  const editingFramePromptSaving = ref(false)
  const editingFramePromptRegenerating = ref(false)

  function buildFirstFrameImagePrompt(storyboardId) {
    const storyboard = (store?.storyboards || []).find((item) => item.id === storyboardId)
    return (storyboard?.polished_prompt || storyboard?.image_prompt || storyboard?.description || '').toString().trim()
  }

  function buildLastFrameImagePrompt(storyboardId) {
    const parts = []
    const loc = (sbLocation.value[storyboardId] || '').toString().trim()
    const time = (sbTime.value[storyboardId] || '').toString().trim()
    if (loc) parts.push(time ? `${loc}，${time}` : loc)
    const shotType = (sbShotType.value[storyboardId] || '').toString().trim()
    if (shotType) parts.push(shotType)
    const angleH = sbAngleH.value[storyboardId] || ''
    const angleV = sbAngleV.value[storyboardId] || ''
    const angleS = sbAngleS.value[storyboardId] || ''
    if (angleH && angleV && angleS) {
      const { label } = angleToPromptFragment(angleH, angleV, angleS)
      parts.push(label)
    }
    const result = (sbResult.value[storyboardId] || '').toString().trim()
    const action = (sbAction.value[storyboardId] || '').toString().trim()
    if (result) parts.push(result)
    else if (action) parts.push(action)
    const atmosphere = (sbAtmosphere.value[storyboardId] || '').toString().trim()
    if (atmosphere) parts.push(atmosphere)
    const style = getSelectedStylePromptZh() || getSelectedStylePrompt() || ''
    if (style) parts.push(style)
    parts.push('尾帧静止画面，展示动作完成后的最终状态与情绪余韵')
    return parts.join('，')
  }

  async function getCachedFramePromptFromDb(storyboardId, slot) {
    const frameType = slot === 'last' ? 'last' : 'first'
    try {
      const res = await storyboardsAPI.getFramePrompts(storyboardId)
      const row = (res?.frame_prompts || []).find((item) => item.frame_type === frameType)
      return row?.prompt?.trim() || ''
    } catch (_) {
      return ''
    }
  }

  async function ensureProfessionalFramePrompt(storyboard, slot, { forceRegenerate = false } = {}) {
    const frameType = slot === 'last' ? 'last' : 'first'
    if (!forceRegenerate) {
      const cached = await getCachedFramePromptFromDb(storyboard.id, slot)
      if (cached) return cached
    }
    try {
      const genRes = await storyboardsAPI.generateFramePrompt(storyboard.id, { frame_type: frameType })
      if (!genRes?.task_id) throw new Error('帧提示词任务未创建')
      const pollRes = await pollTask(genRes.task_id)
      if (pollRes?.status !== 'completed') {
        throw new Error(pollRes?.error || '帧提示词生成失败')
      }
      const fromTask = pollRes.result?.response?.single_frame?.prompt
      if (fromTask && String(fromTask).trim()) return String(fromTask).trim()
      const cached2 = await getCachedFramePromptFromDb(storyboard.id, slot)
      if (cached2) return cached2
    } catch (error) {
      console.warn('[首尾帧] 专业帧提示词生成失败，使用拼接回退', error?.message)
    }
    return slot === 'last' ? buildLastFrameImagePrompt(storyboard.id) : buildFirstFrameImagePrompt(storyboard.id)
  }

  async function openFramePromptEditor(storyboard, slot) {
    if (!storyboard?.id) return
    editingFramePromptSb.value = storyboard
    editingFramePromptSlot.value = slot
    editingFramePromptText.value = ''
    showFramePromptEditor.value = true
    try {
      const prompt = await ensureProfessionalFramePrompt(storyboard, slot)
      editingFramePromptText.value = prompt || ''
    } catch (_) {
      editingFramePromptText.value = slot === 'last'
        ? buildLastFrameImagePrompt(storyboard.id)
        : buildFirstFrameImagePrompt(storyboard.id)
    }
  }

  async function saveEditingFramePrompt() {
    const storyboard = editingFramePromptSb.value
    const slot = editingFramePromptSlot.value
    if (!storyboard?.id || !slot) return
    const text = (editingFramePromptText.value || '').trim()
    if (!text) {
      ElMessage.warning('提示词不能为空')
      return
    }
    editingFramePromptSaving.value = true
    try {
      const frameType = slot === 'last' ? 'last' : 'first'
      await storyboardsAPI.saveFramePrompt(storyboard.id, frameType, { prompt: text })
      ElMessage.success('提示词已保存，后续生成将使用此版本')
      showFramePromptEditor.value = false
    } catch (error) {
      ElMessage.error(error.message || '保存失败')
    } finally {
      editingFramePromptSaving.value = false
    }
  }

  async function regenerateEditingFramePrompt() {
    const storyboard = editingFramePromptSb.value
    const slot = editingFramePromptSlot.value
    if (!storyboard?.id || !slot) return
    editingFramePromptRegenerating.value = true
    try {
      ElMessage.info('正在重新生成专业帧提示词…')
      const fresh = await ensureProfessionalFramePrompt(storyboard, slot, { forceRegenerate: true })
      editingFramePromptText.value = fresh || ''
      ElMessage.success('已重新生成，可编辑后保存')
    } catch (error) {
      ElMessage.error(error.message || '生成失败')
    } finally {
      editingFramePromptRegenerating.value = false
    }
  }

  const showSbFramePromptPreview = openFramePromptEditor

  return {
    buildFirstFrameImagePrompt,
    buildLastFrameImagePrompt,
    editingFramePromptRegenerating,
    editingFramePromptSaving,
    editingFramePromptSb,
    editingFramePromptSlot,
    editingFramePromptText,
    ensureProfessionalFramePrompt,
    openFramePromptEditor,
    regenerateEditingFramePrompt,
    saveEditingFramePrompt,
    showFramePromptEditor,
    showSbFramePromptPreview,
  }
}
