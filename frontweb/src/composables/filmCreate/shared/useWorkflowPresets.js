import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { workflowPresetAPI } from '@/api/workflowPresets'

const DEFAULT_PRESET_TYPES = ['character', 'scene', 'prop', 'storyboard']

function createPresetMap(types, initialValue) {
  return Object.fromEntries(types.map((type) => [type, typeof initialValue === 'function' ? initialValue(type) : initialValue]))
}

export function useWorkflowPresets(options = {}) {
  const presetTypes = options.presetTypes || DEFAULT_PRESET_TYPES
  const workflowPresetLoading = ref(false)
  const workflowPresetOptions = reactive(createPresetMap(presetTypes, () => []))
  const selectedWorkflowPresetIds = reactive(createPresetMap(presetTypes, ''))

  function workflowPresetLabel(preset) {
    return preset?.is_default ? `${preset.name}（默认）` : preset?.name || '未命名规范'
  }

  function selectedWorkflowPreset(type) {
    const id = String(selectedWorkflowPresetIds[type] || '')
    return (workflowPresetOptions[type] || []).find((item) => String(item.id) === id) || null
  }

  function selectedWorkflowPresetName(type) {
    return selectedWorkflowPreset(type)?.name || '默认生成规范'
  }

  function workflowPresetPayload(type) {
    const id = Number(selectedWorkflowPresetIds[type])
    return Number.isFinite(id) && id > 0 ? { workflow_preset_id: id } : {}
  }

  function applyDefaultWorkflowSelections() {
    for (const type of presetTypes) {
      const list = workflowPresetOptions[type] || []
      const selected = String(selectedWorkflowPresetIds[type] || '')
      if (selected && list.some((item) => String(item.id) === selected)) continue
      const next = list.find((item) => item.is_default) || list[0]
      selectedWorkflowPresetIds[type] = next ? String(next.id) : ''
    }
  }

  async function loadWorkflowPresets() {
    workflowPresetLoading.value = true
    try {
      const res = await workflowPresetAPI.list({ active: 1 })
      const items = res?.items || []
      for (const type of presetTypes) {
        workflowPresetOptions[type] = items.filter((item) => item.preset_type === type)
      }
      applyDefaultWorkflowSelections()
    } catch (err) {
      if (options.onError) options.onError(err)
      else ElMessage.error(err.message || '加载工作流规范失败')
    } finally {
      workflowPresetLoading.value = false
    }
  }

  return {
    workflowPresetLoading,
    workflowPresetOptions,
    selectedWorkflowPresetIds,
    workflowPresetLabel,
    selectedWorkflowPreset,
    selectedWorkflowPresetName,
    workflowPresetPayload,
    applyDefaultWorkflowSelections,
    loadWorkflowPresets,
  }
}
