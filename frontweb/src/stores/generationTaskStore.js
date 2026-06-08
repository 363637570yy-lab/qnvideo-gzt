import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { taskAPI } from '@/api/task'
import { imagesAPI } from '@/api/images'
import { videosAPI } from '@/api/videos'
import { normalizeAiFriendlyMessage } from '@/utils/aiFriendlyErrors'

/** 资源类型常量 */
export const GEN_RESOURCE = {
  CHAR_IMAGE: 'char_image',
  PROP_IMAGE: 'prop_image',
  SCENE_IMAGE: 'scene_image',
  SB_IMAGE: 'sb_image',
  SB_FIRST_IMAGE: 'sb_first_image',
  SB_LAST_IMAGE: 'sb_last_image',
  SB_VIDEO: 'sb_video',
  EPISODE_MERGE: 'episode_merge',
  EXTRACT_CHARACTERS: 'extract_characters',
  EXTRACT_PROPS: 'extract_props',
  EXTRACT_SCENES: 'extract_scenes',
  GENERATE_STORYBOARD: 'generate_storyboard',
}

/** 超过此时间仍为 running 且无进展则自动清理（毫秒） */
const STALE_TASK_MS = 30 * 60 * 1000

const LAST_FRAME_TYPES = new Set(['last', 'storyboard_last', 'tail', 'last_frame'])
const FIRST_FRAME_TYPES = new Set(['first', 'storyboard_first', 'head', 'first_frame'])

function taskKey({ dramaId, episodeId, resourceType, resourceId }) {
  return `${dramaId}:${episodeId}:${resourceType}:${resourceId}`
}

function isLastFrameType(frameType) {
  if (frameType == null || frameType === '') return false
  return LAST_FRAME_TYPES.has(String(frameType).toLowerCase())
}

function isFirstFrameType(frameType) {
  if (frameType == null || frameType === '') return false
  return FIRST_FRAME_TYPES.has(String(frameType).toLowerCase())
}

function sbImageResourceType(frameType) {
  if (isLastFrameType(frameType)) return GEN_RESOURCE.SB_LAST_IMAGE
  if (isFirstFrameType(frameType)) return GEN_RESOURCE.SB_FIRST_IMAGE
  return GEN_RESOURCE.SB_IMAGE
}

function isActiveTaskStatus(status) {
  return status === 'queued' || status === 'pending' || status === 'processing' || status === 'running'
}

function isCancelledTaskStatus(status) {
  return status === 'cancelled' || status === 'canceled'
}

function taskFailMessage(t) {
  if (!t) return '任务失败'
  return normalizeAiFriendlyMessage((t.error || t.message || '任务失败').trim())
}

export const useGenerationTaskStore = defineStore('generationTask', () => {
  /** @type {Map<string, object>} */
  const tasks = ref(new Map())
  /** @type {Map<string, Promise>} taskId → poll promise */
  const pollPromises = ref(new Map())
  /** 本会话已处理过的恢复 taskId，避免切集重复注册 */
  const recoveredTaskIds = ref(new Set())
  /** 用户或系统主动停止轮询的 taskId */
  const cancelledPollTaskIds = ref(new Set())

  const runningTasks = computed(() => {
    return [...tasks.value.values()].filter((t) => t.status === 'running')
  })

  function _setTask(key, task) {
    const next = new Map(tasks.value)
    next.set(key, task)
    tasks.value = next
  }

  function _deleteTask(key) {
    const next = new Map(tasks.value)
    next.delete(key)
    tasks.value = next
  }

  function _findKeysByTaskId(taskId) {
    if (!taskId) return []
    return [...tasks.value.entries()]
      .filter(([, t]) => t.taskId === taskId)
      .map(([k]) => k)
  }

  function _finishKeys(keys, status, error) {
    for (const key of keys) {
      const existing = tasks.value.get(key)
      if (!existing) continue
      _setTask(key, {
        ...existing,
        status,
        error: error || '',
        finishedAt: Date.now(),
      })
      const delay = status === 'failed' ? 8000 : 3000
      setTimeout(() => _deleteTask(key), delay)
    }
  }

  function markRunning(meta) {
    const key = taskKey(meta)
    if (!key || key.includes('undefined') || key.includes('null')) return key
    _setTask(key, {
      ...meta,
      key,
      status: 'running',
      startedAt: Date.now(),
    })
    return key
  }

  function markDone(meta) {
    const key = typeof meta === 'string' ? meta : taskKey(meta)
    const existing = tasks.value.get(key)
    const taskId = existing?.taskId || (typeof meta === 'object' ? meta?.taskId : null)
    const keys = taskId ? _findKeysByTaskId(taskId) : [key]
    if (keys.length === 0 && key) keys.push(key)
    _finishKeys(keys, 'completed')
  }

  function markFailed(meta, error) {
    const key = typeof meta === 'string' ? meta : taskKey(meta)
    const existing = tasks.value.get(key)
    const taskId = existing?.taskId || (typeof meta === 'object' ? meta?.taskId : null)
    const keys = taskId ? _findKeysByTaskId(taskId) : [key]
    if (keys.length === 0 && key) keys.push(key)
    _finishKeys(keys, 'failed', normalizeAiFriendlyMessage(error || '任务失败'))
  }

  function isRunning(meta) {
    const key = taskKey(meta)
    const t = tasks.value.get(key)
    return t?.status === 'running'
  }

  function getRunningForEpisode(dramaId, episodeId) {
    if (dramaId == null || episodeId == null) return []
    return runningTasks.value.filter(
      (t) => Number(t.dramaId) === Number(dramaId) && Number(t.episodeId) === Number(episodeId)
    )
  }

  function getAllRunningTasks() {
    return runningTasks.value
  }

  function getRunningTask(meta) {
    const key = typeof meta === 'string' ? meta : taskKey(meta)
    const direct = tasks.value.get(key)
    if (direct?.status === 'running') return direct
    if (meta && typeof meta === 'object' && meta.taskId) {
      return [...tasks.value.values()].find((t) => t.taskId === meta.taskId && t.status === 'running') || null
    }
    return null
  }

  function stopResourceTask(meta, reason) {
    const task = getRunningTask(meta)
    if (!task) return false
    if (task.taskId) {
      stopPollingTask(task.taskId, reason || '任务已停止')
      return true
    }
    markFailed(task, reason || '任务已停止')
    return true
  }

  /** 停止指定 taskId 的轮询并清除 store 中的 running 状态 */
  function stopPollingTask(taskId, reason) {
    if (!taskId) return
    cancelledPollTaskIds.value = new Set([...cancelledPollTaskIds.value, taskId])
    taskAPI.cancel(taskId, reason || '任务已停止').catch(() => {})
    markFailed({ taskId }, reason || '任务已停止')
  }

  /** 清除所有 running 任务（页面级兜底） */
  function clearAllRunningTasks(reason) {
    for (const t of [...runningTasks.value]) {
      if (t.taskId) stopPollingTask(t.taskId, reason)
      else markFailed(t, reason || '已清除')
    }
  }

  /** 切换账号/退出登录时只清本地轮询，不向后端取消真实任务。 */
  function clearSessionTasks(reason = '账号已切换') {
    const taskIds = new Set()
    for (const taskId of pollPromises.value.keys()) {
      if (taskId) taskIds.add(taskId)
    }
    for (const t of tasks.value.values()) {
      if (t.taskId) taskIds.add(t.taskId)
    }
    cancelledPollTaskIds.value = new Set([...cancelledPollTaskIds.value, ...taskIds])
    tasks.value = new Map()
    pollPromises.value = new Map()
    recoveredTaskIds.value = new Set()
    void reason
  }

  /**
   * 校验 store 中 running 任务是否与后端一致；清理已完成/失败/超时的僵尸条目。
   */
  async function reconcileRunningTasks(ctx = {}) {
    const { characters = [], props = [], scenes = [], storyboards = [] } = ctx
    const running = [...runningTasks.value]
    const now = Date.now()

    for (const t of running) {
      if (t.startedAt && now - t.startedAt > STALE_TASK_MS) {
        markFailed(t, '任务等待超时，已自动清除（请刷新确认是否已完成）')
        continue
      }

      if (t.taskId) {
        try {
          const remote = await taskAPI.get(t.taskId)
          if (remote.status === 'completed') {
            markDone(t)
            continue
          }
          if (remote.status === 'failed') {
            markFailed(t, taskFailMessage(remote))
            continue
          }
          if (isCancelledTaskStatus(remote.status)) {
            markFailed(t, taskFailMessage(remote) || '任务已停止')
            continue
          }
          if (!isActiveTaskStatus(remote.status)) {
            markDone(t)
          }
        } catch (_) {
          // 网络异常跳过，下次 reconcile 再试
        }
        continue
      }

      if (t.resourceType === GEN_RESOURCE.CHAR_IMAGE && t.resourceId != null) {
        const c = characters.find((x) => Number(x.id) === Number(t.resourceId))
        if (c && (c.image_url || c.local_path)) markDone(t)
      } else if (t.resourceType === GEN_RESOURCE.PROP_IMAGE && t.resourceId != null) {
        const p = props.find((x) => Number(x.id) === Number(t.resourceId))
        if (p && (p.image_url || p.local_path)) markDone(t)
      } else if (t.resourceType === GEN_RESOURCE.SCENE_IMAGE && t.resourceId != null) {
        const s = scenes.find((x) => Number(x.id) === Number(t.resourceId))
        if (s && (s.image_url || s.local_path)) markDone(t)
      }
    }

    void storyboards
  }

  /**
   * 轮询异步任务；同一 taskId 只轮询一次，多路 await 共享结果。
   */
  function pollTask(taskId, meta, onDone, options = {}) {
    if (!taskId) return Promise.resolve({ status: 'failed', error: '缺少 task_id' })

    const key = markRunning({ ...meta, taskId })

    if (pollPromises.value.has(taskId)) {
      return pollPromises.value.get(taskId)
    }

    const maxAttempts = options.maxAttempts ?? 450
    const interval = options.interval ?? 2000
    const showErrorToast = options.showErrorToast !== false
    const showTimeoutToast = options.showTimeoutToast !== false

    let attempts = 0
    let stopped = false
    const promise = new Promise((resolve) => {
      const tick = async () => {
        if (stopped || cancelledPollTaskIds.value.has(taskId)) {
          markFailed(key, '任务轮询已停止')
          return resolve({ status: 'cancelled', error: '任务轮询已停止' })
        }
        attempts++
        try {
          const t = await taskAPI.get(taskId)
          if (t.status === 'completed') {
            if (onDone) {
              try {
                await onDone()
              } catch (e) {
                console.warn('[generationTaskStore] onDone failed:', e?.message)
              }
            }
            markDone(key)
            return resolve({ status: 'completed', result: t.result })
          }
          if (t.status === 'failed') {
            const errMsg = taskFailMessage(t)
            markFailed(key, errMsg)
            if (showErrorToast && options.ElMessage) {
              options.ElMessage.error(errMsg)
            }
            return resolve({ status: 'failed', error: errMsg })
          }
          if (isCancelledTaskStatus(t.status)) {
            const errMsg = taskFailMessage(t) || '任务已停止'
            markFailed(key, errMsg)
            return resolve({ status: 'cancelled', error: errMsg })
          }
          if (t.status === 'queued' || t.status === 'pending') {
            attempts = 0
          }
        } catch (pollErr) {
          console.warn('[generationTaskStore] poll attempt failed:', pollErr?.message)
        }
        if (attempts < maxAttempts) {
          setTimeout(tick, interval)
        } else {
          const timeoutMsg = options.timeoutMessage
            || '生成任务已超时（超过15分钟），请刷新页面查看是否已完成'
          markFailed(key, timeoutMsg)
          if (showTimeoutToast && options.ElMessage) {
            options.ElMessage.warning(timeoutMsg)
          }
          resolve({ status: 'timeout', error: timeoutMsg })
        }
      }
      setTimeout(tick, interval)
    })

    const nextPolls = new Map(pollPromises.value)
    nextPolls.set(taskId, promise)
    pollPromises.value = nextPolls

    return promise.finally(() => {
      stopped = true
      const cleaned = new Map(pollPromises.value)
      cleaned.delete(taskId)
      pollPromises.value = cleaned
    })
  }

  /**
   * 若 task 仍在运行且尚未轮询，则 attach 轮询（用于页面刷新/切集恢复）。
   */
  async function attachPollIfNeeded(taskId, meta, onDone, options = {}) {
    if (!taskId) return null

    if (pollPromises.value.has(taskId)) {
      markRunning({ ...meta, taskId })
      return pollPromises.value.get(taskId)
    }

    try {
      const t = await taskAPI.get(taskId)
      if (t.status === 'completed') {
        if (onDone) await onDone()
        markDone({ ...meta, taskId })
        return { status: 'completed', result: t.result }
      }
      if (t.status === 'failed') {
        markFailed({ ...meta, taskId }, taskFailMessage(t))
        return { status: 'failed', error: taskFailMessage(t) }
      }
      if (isCancelledTaskStatus(t.status)) {
        markFailed({ ...meta, taskId }, taskFailMessage(t) || '任务已停止')
        return { status: 'cancelled', error: taskFailMessage(t) || '任务已停止' }
      }
      if (!isActiveTaskStatus(t.status)) {
        markDone({ ...meta, taskId })
        return { status: 'completed', result: t.result }
      }
    } catch (_) {
      // 网络异常时仍尝试轮询
    }

    markRunning({ ...meta, taskId })
    return pollTask(taskId, meta, onDone, { ...options, showErrorToast: false, showTimeoutToast: false })
  }

  async function _recoverAttachTask(taskId, meta, onDone, pollOpts) {
    if (!taskId) return
    if (recoveredTaskIds.value.has(taskId)) {
      try {
        const t = await taskAPI.get(taskId)
        if (t.status === 'completed') markDone({ ...meta, taskId })
        else if (t.status === 'failed') markFailed({ ...meta, taskId }, taskFailMessage(t))
        else if (isCancelledTaskStatus(t.status)) markFailed({ ...meta, taskId }, taskFailMessage(t) || '任务已停止')
        else if (!isActiveTaskStatus(t.status)) markDone({ ...meta, taskId })
        else if (cancelledPollTaskIds.value.has(taskId)) markFailed({ ...meta, taskId }, '任务轮询已停止')
      } catch (_) {}
      return
    }
    recoveredTaskIds.value = new Set([...recoveredTaskIds.value, taskId])
    const res = await attachPollIfNeeded(taskId, meta, onDone, pollOpts)
    if (res?.status === 'failed' || res?.status === 'timeout' || res?.status === 'cancelled') {
      markFailed({ ...meta, taskId }, res.error)
    }
  }

  /**
   * 从后端恢复当前集进行中的图片/视频/合成任务，并重新 attach 轮询。
   */
  async function recoverPendingForEpisode(ctx) {
    const {
      dramaId,
      episodeId,
      dramaTitle,
      episodeNumber,
      storyboards = [],
      characters = [],
      scenes = [],
      props = [],
      allCharacters = [],
      allProps = [],
      allScenes = [],
      callbacks = {},
      ElMessage,
      recoverResourceTypes = null,
      recoverAssetTasks = true,
    } = ctx

    if (dramaId == null || episodeId == null) return
    const recoverTypeSet = Array.isArray(recoverResourceTypes) && recoverResourceTypes.length
      ? new Set(recoverResourceTypes)
      : null
    const shouldRecover = (resourceType) => !recoverTypeSet || recoverTypeSet.has(resourceType)

    const reconcileAssets = {
      characters: allCharacters.length ? allCharacters : characters,
      props: allProps.length ? allProps : props,
      scenes: allScenes.length ? allScenes : scenes,
      storyboards,
    }

    await reconcileRunningTasks(reconcileAssets)

    const sbIdSet = new Set(storyboards.map((s) => Number(s.id)))
    const charIdSet = new Set(characters.map((c) => Number(c.id)))
    const sceneIdSet = new Set(scenes.map((s) => Number(s.id)))
    const propIdSet = new Set(props.map((p) => Number(p.id)))
    const epLabel = dramaTitle
      ? `${dramaTitle} · 第${episodeNumber ?? ''}集`
      : `第${episodeNumber ?? episodeId}集`

    const pollOpts = { ElMessage, showErrorToast: false, showTimeoutToast: false }

    const attachImage = (img) => {
      if (!img || !['pending', 'processing'].includes(img.status)) return
      if (!img.task_id) return

      let resourceType = GEN_RESOURCE.SB_IMAGE
      let resourceId = null
      let label = ''

      if (img.storyboard_id != null && sbIdSet.has(Number(img.storyboard_id))) {
        resourceType = sbImageResourceType(img.frame_type)
        if (!shouldRecover(resourceType)) return
        resourceId = Number(img.storyboard_id)
        const sb = storyboards.find((s) => Number(s.id) === resourceId)
        const num = sb?.storyboard_number ?? resourceId
        label = resourceType === GEN_RESOURCE.SB_LAST_IMAGE
          ? `${epLabel} 尾帧 #${num}`
          : resourceType === GEN_RESOURCE.SB_FIRST_IMAGE
            ? `${epLabel} 首帧 #${num}`
            : `${epLabel} 分镜图 #${num}`
      } else if (img.character_id != null && charIdSet.has(Number(img.character_id))) {
        resourceType = GEN_RESOURCE.CHAR_IMAGE
        if (!recoverAssetTasks || !shouldRecover(resourceType)) return
        resourceId = Number(img.character_id)
        const c = characters.find((x) => Number(x.id) === resourceId)
        label = `${epLabel} 角色图: ${c?.name || resourceId}`
      } else if (img.scene_id != null && sceneIdSet.has(Number(img.scene_id))) {
        resourceType = GEN_RESOURCE.SCENE_IMAGE
        if (!recoverAssetTasks || !shouldRecover(resourceType)) return
        resourceId = Number(img.scene_id)
        const s = scenes.find((x) => Number(x.id) === resourceId)
        label = `${epLabel} 场景图: ${s?.location || resourceId}`
      } else {
        return
      }

      const meta = {
        dramaId,
        episodeId,
        dramaTitle,
        episodeNumber,
        resourceType,
        resourceId,
        label,
      }
      const onDone = resourceType.startsWith('sb_')
        ? () => callbacks.onStoryboardMedia?.(resourceId)
        : () => callbacks.onDramaRefresh?.()
      _recoverAttachTask(img.task_id, meta, onDone, pollOpts)
    }

    const attachVideo = (vid) => {
      if (!vid?.storyboard_id || !sbIdSet.has(Number(vid.storyboard_id))) return
      if (!['queued', 'pending', 'processing'].includes(vid.status)) return
      if (!vid.task_id) return
      if (!shouldRecover(GEN_RESOURCE.SB_VIDEO)) return
      const resourceId = Number(vid.storyboard_id)
      const sb = storyboards.find((s) => Number(s.id) === resourceId)
      const num = sb?.storyboard_number ?? resourceId
      const meta = {
        dramaId,
        episodeId,
        dramaTitle,
        episodeNumber,
        resourceType: GEN_RESOURCE.SB_VIDEO,
        resourceId,
        label: `${epLabel} 分镜视频 #${num}`,
      }
      _recoverAttachTask(vid.task_id, meta, () => callbacks.onStoryboardMedia?.(resourceId), pollOpts)
    }

    try {
      const [pendingImg, processingImg, pendingVid, processingVid, episodeTasks] = await Promise.all([
        imagesAPI.list({ drama_id: dramaId, status: 'pending', page_size: 100 }).catch(() => ({ items: [] })),
        imagesAPI.list({ drama_id: dramaId, status: 'processing', page_size: 100 }).catch(() => ({ items: [] })),
        videosAPI.list({ drama_id: dramaId, status: 'pending', page_size: 100 }).catch(() => ({ items: [] })),
        videosAPI.list({ drama_id: dramaId, status: 'processing', page_size: 100 }).catch(() => ({ items: [] })),
        taskAPI.listByResource(String(episodeId), {
          drama_id: dramaId,
          episode_id: episodeId,
          types: 'video_merge,prop_extraction,background_extraction,storyboard_generation',
        }).catch(() => []),
      ])

      const seenImg = new Set()
      for (const img of [...(pendingImg.items || []), ...(processingImg.items || [])]) {
        const dedupe = `${img.id}:${img.status}`
        if (seenImg.has(dedupe)) continue
        seenImg.add(dedupe)
        attachImage(img)
      }

      for (const vid of [...(pendingVid.items || []), ...(processingVid.items || [])]) {
        attachVideo(vid)
      }

      for (const t of episodeTasks || []) {
        if (!isActiveTaskStatus(t.status)) continue
        if (t.type === 'video_merge') {
          if (!shouldRecover(GEN_RESOURCE.EPISODE_MERGE)) continue
          const meta = {
            dramaId,
            episodeId,
            dramaTitle,
            episodeNumber,
            resourceType: GEN_RESOURCE.EPISODE_MERGE,
            resourceId: Number(episodeId),
            label: `${epLabel} 合成视频`,
            taskId: t.id,
          }
          _recoverAttachTask(t.id, meta, () => callbacks.onDramaRefresh?.(), pollOpts)
          continue
        }
        const extractTypeMap = {
          prop_extraction: { resourceType: GEN_RESOURCE.EXTRACT_PROPS, label: `${epLabel} 提取道具` },
          background_extraction: { resourceType: GEN_RESOURCE.EXTRACT_SCENES, label: `${epLabel} 提取场景` },
          storyboard_generation: { resourceType: GEN_RESOURCE.GENERATE_STORYBOARD, label: `${epLabel} AI生成分镜` },
        }
        const extractCfg = extractTypeMap[t.type]
        if (extractCfg) {
          if (!shouldRecover(extractCfg.resourceType)) continue
          const meta = {
            dramaId,
            episodeId,
            dramaTitle,
            episodeNumber,
            resourceType: extractCfg.resourceType,
            resourceId: Number(episodeId),
            label: extractCfg.label,
            taskId: t.id,
          }
          _recoverAttachTask(t.id, meta, () => callbacks.onDramaRefresh?.(), pollOpts)
        }
      }

      // 角色提取 task 挂在 dramaId 上，同一 taskId 只恢复一次（避免多集重复显示）
      const dramaTasks = await taskAPI.listByResource(String(dramaId), {
        drama_id: dramaId,
        type: 'character_generation',
      }).catch(() => [])
      for (const t of dramaTasks || []) {
        if (!isActiveTaskStatus(t.status)) continue
        if (t.type !== 'character_generation') continue
        if (!shouldRecover(GEN_RESOURCE.EXTRACT_CHARACTERS)) continue
        if (recoveredTaskIds.value.has(t.id)) continue
        if (pollPromises.value.has(t.id)) continue
        const meta = {
          dramaId,
          episodeId,
          dramaTitle,
          episodeNumber,
          resourceType: GEN_RESOURCE.EXTRACT_CHARACTERS,
          resourceId: Number(episodeId),
          label: `${epLabel} 提取角色`,
          taskId: t.id,
        }
        _recoverAttachTask(t.id, meta, () => callbacks.onDramaRefresh?.(), pollOpts)
        break
      }

      // 只有道具图生成任务目前只落在 async_tasks(resource_id=prop.id) 上。
      // 角色/场景/分镜图片都有 image_generations 行，已在 pending/processing images 中按 drama_id 精准恢复。
      const propResourceIds = [...new Set([...propIdSet].map((id) => String(id)))]
      const resourceTasks = propResourceIds.length
        ? await taskAPI.listByResources(propResourceIds, {
          drama_id: dramaId,
          episode_id: episodeId,
          type: 'prop_image_generation',
        }).catch(() => [])
        : []
      const tasksByResource = new Map()
      for (const t of resourceTasks || []) {
        if (!isActiveTaskStatus(t.status)) continue
        const key = String(t.resource_id)
        const list = tasksByResource.get(key) || []
        list.push(t)
        tasksByResource.set(key, list)
      }
      const attachResourceTasks = (resourceId, resourceType, label) => {
        for (const t of tasksByResource.get(String(resourceId)) || []) {
          const meta = {
            dramaId,
            episodeId,
            dramaTitle,
            episodeNumber,
            resourceType,
            resourceId: Number(resourceId),
            label,
            taskId: t.id,
          }
          _recoverAttachTask(t.id, meta, () => callbacks.onDramaRefresh?.(), pollOpts)
        }
      }
      for (const id of propIdSet) {
        if (!recoverAssetTasks || !shouldRecover(GEN_RESOURCE.PROP_IMAGE)) continue
        const p = props.find((x) => Number(x.id) === Number(id))
        attachResourceTasks(id, GEN_RESOURCE.PROP_IMAGE, `${epLabel} 道具图: ${p?.name || id}`)
      }

      await reconcileRunningTasks(reconcileAssets)
    } catch (e) {
      console.warn('[generationTaskStore] recoverPendingForEpisode failed:', e?.message)
    }
  }

  return {
    GEN_RESOURCE,
    tasks,
    runningTasks,
    markRunning,
    markDone,
    markFailed,
    isRunning,
    getRunningForEpisode,
    getAllRunningTasks,
    getRunningTask,
    pollTask,
    attachPollIfNeeded,
    recoverPendingForEpisode,
    reconcileRunningTasks,
    stopPollingTask,
    stopResourceTask,
    clearAllRunningTasks,
    clearSessionTasks,
    taskKey,
  }
})
