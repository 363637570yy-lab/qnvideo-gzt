import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { taskAPI } from '@/api/task'
import { GEN_RESOURCE } from '@/stores/generationTaskStore'

export function useTaskRuntime(deps) {
  const {
    genStore,
    store,
    dramaId,
    currentEpisodeId,
    loadDrama,
    confirmAdminProjectOperation,
    getLocalGeneratingSets = () => ({}),
    getPipelineState = () => ({}),
    getGlobalGenerationState = () => ({}),
  } = deps

  const taskClockNow = ref(Date.now())
  let taskClockTimer = null

  const allActiveTasks = computed(() => {
    const tasks = []
    const seen = new Set()
    const addTask = (label) => {
      const s = (label || '').trim()
      if (!s || seen.has(s)) return
      seen.add(s)
      tasks.push(s)
    }

    for (const t of genStore.getAllRunningTasks()) {
      addTask(t.label)
    }

    const pipeline = getPipelineState()
    if (pipeline.pipelineRunning?.value) {
      const step = pipeline.pipelineCurrentStep?.value
      addTask(step ? step.replace(/^\[步骤 \d+\/\d+\] /, '') : '一键全流程运行中...')
    }

    const global = getGlobalGenerationState()
    if (global.storyGenerating?.value || global.scriptGenerating?.value) addTask('生成剧本...')
    if (global.universalOmniPolishRunning?.value) {
      const p = global.universalOmniPolishProgress?.value || {}
      addTask(`润色全能分镜 ${p.current || 0}/${p.total || 0}${p.label ? ' ' + p.label : ''}`)
    }
    if (global.batchImageRunning?.value) addTask('批量生成分镜图...')
    if (global.batchVideoRunning?.value) addTask('批量生成分镜视频...')
    return tasks
  })

  function buildResourceTaskMeta(resourceType, resourceId) {
    return {
      dramaId: dramaId.value,
      episodeId: currentEpisodeId.value,
      resourceType,
      resourceId,
    }
  }

  function getRunningResourceTask(resourceType, resourceId) {
    if (dramaId.value == null || currentEpisodeId.value == null || resourceId == null) return null
    return genStore.getRunningTask(buildResourceTaskMeta(resourceType, resourceId))
  }

  function isResourceGenerating(resourceType, resourceId) {
    return !!getRunningResourceTask(resourceType, resourceId)
  }

  function formatElapsed(ms) {
    const total = Math.max(0, Math.floor(Number(ms || 0) / 1000))
    const m = Math.floor(total / 60)
    const s = total % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  function resourceElapsedLabel(resourceType, resourceId) {
    const task = getRunningResourceTask(resourceType, resourceId)
    return formatElapsed(task?.startedAt ? taskClockNow.value - task.startedAt : 0)
  }

  function clearLocalGeneratingState(resourceType, resourceId) {
    const id = Number(resourceId)
    const sets = getLocalGeneratingSets()
    switch (resourceType) {
      case GEN_RESOURCE.CHAR_IMAGE:
        sets.generatingCharIds?.delete(id)
        break
      case GEN_RESOURCE.PROP_IMAGE:
        sets.generatingPropIds?.delete(id)
        break
      case GEN_RESOURCE.SCENE_IMAGE:
        sets.generatingSceneIds?.delete(id)
        break
      case GEN_RESOURCE.SB_IMAGE:
        sets.generatingSbImageIds?.delete(id)
        break
      case GEN_RESOURCE.SB_FIRST_IMAGE:
        sets.generatingSbFirstImageIds?.delete(id)
        break
      case GEN_RESOURCE.SB_LAST_IMAGE:
        sets.generatingSbLastImageIds?.delete(id)
        break
      case GEN_RESOURCE.SB_VIDEO:
        sets.generatingSbVideoIds?.delete(id)
        break
      default:
        break
    }
  }

  async function stopResourceGeneration(resourceType, resourceId, reason = '已停止生成', skipConfirm = false) {
    if (!skipConfirm && !(await confirmAdminProjectOperation('停止当前生成任务'))) return
    genStore.stopResourceTask(buildResourceTaskMeta(resourceType, resourceId), reason)
    clearLocalGeneratingState(resourceType, resourceId)
    ElMessage.info('已停止生成，可修改提示词后重新生成')
  }

  async function stopSbFramePair(sb) {
    if (!sb?.id) return
    if (!(await confirmAdminProjectOperation('停止首尾帧生成任务'))) return
    stopResourceGeneration(GEN_RESOURCE.SB_FIRST_IMAGE, sb.id, '已停止首帧生成', true)
    stopResourceGeneration(GEN_RESOURCE.SB_LAST_IMAGE, sb.id, '已停止尾帧生成', true)
  }

  async function stopEpisodeTask(resourceType, reason = '已停止生成') {
    if (!currentEpisodeId.value) return
    if (!(await confirmAdminProjectOperation('停止当前集任务'))) return
    genStore.stopResourceTask(buildResourceTaskMeta(resourceType, currentEpisodeId.value), reason)
    ElMessage.info('已停止生成，可调整设置后重新生成')
  }

  async function pollUntilResourceHasImage(checker, maxAttempts = 20, intervalMs = 3000) {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
      await loadDrama()
      if (checker()) return
    }
  }

  function pollTask(taskId, onDone, meta = {}) {
    const resolvedMeta = {
      dramaId: meta.dramaId ?? dramaId.value,
      episodeId: meta.episodeId ?? currentEpisodeId.value,
      dramaTitle: meta.dramaTitle ?? store.drama?.title,
      episodeNumber: meta.episodeNumber ?? store.currentEpisode?.episode_number,
      resourceType: meta.resourceType || 'unknown',
      resourceId: meta.resourceId,
      label: meta.label,
      ...meta,
    }
    const longVideoTask =
      resolvedMeta.resourceType === GEN_RESOURCE.SB_VIDEO ||
      resolvedMeta.resourceType === GEN_RESOURCE.EPISODE_MERGE
    return genStore.pollTask(taskId, resolvedMeta, onDone, {
      ElMessage,
      maxAttempts: longVideoTask ? 1800 : 450,
      timeoutMessage: longVideoTask
        ? '视频任务仍在排队或生成中，请稍后刷新查看'
        : undefined,
    })
  }

  function pollTaskWithPause(taskId, onDone) {
    const maxAttempts = 1800
    const interval = 2000
    let attempts = 0
    return new Promise((resolve) => {
      const tick = async () => {
        const pipeline = getPipelineState()
        if (pipeline.pipelinePaused?.value) {
          resolve({ paused: true })
          return
        }
        attempts++
        try {
          const t = await taskAPI.get(taskId)
          if (t.status === 'completed') {
            if (onDone) await onDone()
            resolve({ result: t.result })
            return
          }
          if (t.status === 'failed') {
            resolve({ error: t.error || '任务失败' })
            return
          }
          if (t.status === 'queued' || t.status === 'pending') {
            attempts = 0
          }
        } catch (pollErr) {
          console.warn('[pollTaskWithPause] poll attempt failed:', pollErr?.message)
        }
        if (attempts < maxAttempts) setTimeout(tick, interval)
        else {
          resolve({ error: '任务查询超时（超过60分钟）' })
        }
      }
      setTimeout(tick, interval)
    })
  }

  onMounted(() => {
    taskClockTimer = setInterval(() => {
      taskClockNow.value = Date.now()
    }, 1000)
  })

  onBeforeUnmount(() => {
    if (taskClockTimer) {
      clearInterval(taskClockTimer)
      taskClockTimer = null
    }
  })

  return {
    allActiveTasks,
    taskClockNow,
    buildResourceTaskMeta,
    getRunningResourceTask,
    isResourceGenerating,
    formatElapsed,
    resourceElapsedLabel,
    clearLocalGeneratingState,
    stopResourceGeneration,
    stopSbFramePair,
    stopEpisodeTask,
    pollUntilResourceHasImage,
    pollTask,
    pollTaskWithPause,
  }
}
