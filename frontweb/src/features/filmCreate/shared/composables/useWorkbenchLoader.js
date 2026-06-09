import { computed, nextTick, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { workbenchAPI } from '@/api/workbench'
import { normalizeImageSpec, normalizeVideoSpec } from '@/utils/filmCreate/mediaSpec'

function assetTypeForWorkbenchTab(tab) {
  if (tab === 'characters') return 'character'
  if (tab === 'scenes') return 'scene'
  if (tab === 'props') return 'prop'
  return ''
}

export function useWorkbenchLoader(deps) {
  const {
    store,
    dramaAPI,
    workbenchTabLoaded,
    filmWorkbenchTab,
    selectedEpisodeId,
    savedCurrentEpisodeNumber,
    storyInput,
    storyStyle,
    storyType,
    scriptTitle,
    generationStyle,
    projectAspectRatio,
    projectImageSpec,
    projectVideoSpec,
    videoClipDuration,
    scriptLanguage,
    defaultGenerationStyle,
    setProjectSettingsHydrating,
    applyProjectAiRouteSelection,
    syncStoryboardStateFromEpisode,
    loadStoryboardMedia,
    recoverAndSyncEpisodeTasks,
    groupByStoryboardId,
    getSbVideosRef,
    restoreSelectionsFromBackend,
  } = deps

  const dramaId = computed(() => store.dramaId)
  const workbenchSummary = ref(null)
  const workbenchSummaryLoading = ref(false)
  const projectTitle = computed(() => workbenchSummary.value?.project?.title || store.drama?.title || '项目')

  const characters = computed(() => store.characters)
  const scenes = computed(() => store.scenes)
  const props = computed(() => store.props)
  const storyboards = computed(() => store.storyboards)
  const currentEpisode = computed(() => store.currentEpisode)
  const currentEpisodeId = computed(() => store.currentEpisode?.id ?? null)
  const videoProgress = computed(() => store.videoProgress)
  const videoStatus = computed(() => store.videoStatus)

  function applyWorkbenchSummarySettings(summary) {
    const settings = summary?.settings || {}
    if (!settings || !Object.keys(settings).length) return
    setProjectSettingsHydrating?.(true)
    try {
      generationStyle.value = settings.style || defaultGenerationStyle
      projectAspectRatio.value = settings.aspect_ratio || '16:9'
      projectImageSpec.value = normalizeImageSpec(settings.image_spec || {})
      projectVideoSpec.value = normalizeVideoSpec(settings.video_spec || {})
      videoClipDuration.value = Number(settings.default_segment_duration) || 10
      scriptLanguage.value = settings.language || 'zh'
    } finally {
      nextTick(() => {
        setProjectSettingsHydrating?.(false)
      })
    }
  }

  async function loadWorkbenchSummary({ applySettings = true, silent = true } = {}) {
    const id = store.dramaId
    if (!id) return null
    workbenchSummaryLoading.value = true
    try {
      const summary = await workbenchAPI.summary(id)
      workbenchSummary.value = summary || null
      if (applySettings) applyWorkbenchSummarySettings(summary)
      return summary
    } catch (err) {
      if (!silent) ElMessage.error(err.message || '加载制作工作台摘要失败')
      workbenchSummary.value = null
      return null
    } finally {
      workbenchSummaryLoading.value = false
    }
  }

  function resetWorkbenchTabLoaded() {
    Object.keys(workbenchTabLoaded).forEach((key) => {
      workbenchTabLoaded[key] = false
    })
  }

  function markAllWorkbenchTabsLoaded() {
    Object.keys(workbenchTabLoaded).forEach((key) => {
      workbenchTabLoaded[key] = true
    })
  }

  function mergeCurrentEpisodePatch(patch = {}) {
    const current = store.currentEpisode || {}
    const merged = { ...current, ...patch }
    store.setCurrentEpisode(merged)
    const drama = store.drama
    if (drama?.episodes?.length && merged.id != null) {
      const episodes = drama.episodes.map((ep) => Number(ep.id) === Number(merged.id) ? { ...ep, ...patch } : ep)
      store.setDrama({ ...drama, episodes })
    }
    return merged
  }

  function applyScriptWorkbenchTab(data) {
    const project = data?.project || {}
    const episodes = Array.isArray(data?.episodes) ? data.episodes : []
    const prevDrama = store.drama || {}
    store.setDrama({ ...prevDrama, ...project, episodes })
    storyInput.value = (project.description || '').toString().trim()
    storyStyle.value = project.metadata?.story_style || ''
    storyType.value = project.genre || ''
    applyProjectAiRouteSelection(project.metadata || {})

    const currentId = selectedEpisodeId.value
    let ep = currentId != null ? episodes.find((item) => Number(item.id) === Number(currentId)) : null
    if (!ep) {
      const wantNum = savedCurrentEpisodeNumber.value
      ep = episodes.find((item) => Number(item.episode_number) === Number(wantNum)) || episodes[0] || null
    }
    if (ep) {
      const existing = store.currentEpisode && Number(store.currentEpisode.id) === Number(ep.id) ? store.currentEpisode : {}
      const merged = {
        ...ep,
        characters: existing.characters || [],
        scenes: existing.scenes || [],
        props: existing.props || [],
        storyboards: existing.storyboards || [],
      }
      store.setCurrentEpisode(merged)
      store.setScriptContent(ep.script_content || '')
      scriptTitle.value = ep.title || '第' + (ep.episode_number || 0) + '集'
      selectedEpisodeId.value = ep.id
      syncStoryboardStateFromEpisode(merged)
    } else {
      store.setCurrentEpisode(null)
      store.setScriptContent('')
      scriptTitle.value = ''
      selectedEpisodeId.value = null
      syncStoryboardStateFromEpisode(null)
    }
  }

  function applyAssetsWorkbenchTab(data) {
    const type = data?.type
    const items = Array.isArray(data?.items) ? data.items : []
    if (type === 'character') mergeCurrentEpisodePatch({ characters: items })
    if (type === 'scene') mergeCurrentEpisodePatch({ scenes: items })
    if (type === 'prop') mergeCurrentEpisodePatch({ props: items })
  }

  function applyStoryboardsWorkbenchTab(data) {
    const boards = Array.isArray(data?.storyboards) ? data.storyboards : []
    const episodePatch = {
      ...(data?.episode || {}),
      storyboards: boards,
    }
    const merged = mergeCurrentEpisodePatch(episodePatch)
    if (merged?.id) {
      selectedEpisodeId.value = merged.id
      store.setScriptContent(merged.script_content || store.scriptContent || '')
      scriptTitle.value = merged.title || '第' + (merged.episode_number || 0) + '集'
    }
    syncStoryboardStateFromEpisode(merged)
  }

  async function refreshStoryboardsForEpisode(episodeId) {
    if (!episodeId) return
    try {
      const res = await dramaAPI.getStoryboards(episodeId)
      const list = Array.isArray(res) ? res : (res?.storyboards ?? null)
      if (!Array.isArray(list)) return
      if (Number(store.currentEpisode?.id) === Number(episodeId)) {
        store.currentEpisode.storyboards = list
      }
      const epInDrama = store.drama?.episodes?.find((episode) => Number(episode.id) === Number(episodeId))
      if (epInDrama) {
        epInDrama.storyboards = list
      }
    } catch (_) { /* 生成期间的轻量刷新失败不阻断主流程 */ }
  }

  async function refreshStoryboardsOnly() {
    return refreshStoryboardsForEpisode(currentEpisodeId.value)
  }

  function applyVideoComposeWorkbenchTab(data) {
    const boards = Array.isArray(data?.storyboards) ? data.storyboards : []
    const latestMerge = data?.latest_merge || null
    const episode = data?.episode || {}
    const episodePatch = {
      ...episode,
      storyboards: boards,
      video_url: episode.video_url || latestMerge?.merged_url || null,
      status: latestMerge?.status === 'completed' ? 'completed' : (episode.status || undefined),
    }
    const merged = mergeCurrentEpisodePatch(episodePatch)
    if (merged?.id) {
      selectedEpisodeId.value = merged.id
      store.setScriptContent(merged.script_content || store.scriptContent || '')
      scriptTitle.value = merged.title || '第' + (merged.episode_number || 0) + '集'
    }
    syncStoryboardStateFromEpisode(merged)

    const ids = boards.map((sb) => Number(sb.id)).filter((id) => Number.isFinite(id) && id > 0)
    if (Array.isArray(data?.videos)) {
      const videoMap = groupByStoryboardId(data.videos)
      const nextVideos = {}
      for (const id of ids) nextVideos[id] = videoMap[id] || []
      const sbVideos = getSbVideosRef?.()
      if (sbVideos) {
        sbVideos.value = { ...sbVideos.value, ...nextVideos }
      }
      restoreSelectionsFromBackend()
    }
    if (merged?.id && latestMerge?.status === 'completed' && latestMerge.merged_url) {
      store.setVideoStatus('done', dramaId.value, merged.id)
      store.setVideoProgress(100, dramaId.value, merged.id)
    } else if (merged?.id && (latestMerge?.status === 'processing' || latestMerge?.status === 'pending')) {
      store.setVideoStatus('generating', dramaId.value, merged.id)
    }
  }

  async function loadScriptWorkbenchTab({ force = false, recoverTasks = false } = {}) {
    if (!store.dramaId || (!force && workbenchTabLoaded.script)) return
    const data = await workbenchAPI.scriptTab(store.dramaId)
    applyScriptWorkbenchTab(data)
    workbenchTabLoaded.script = true
    if (recoverTasks) await recoverAndSyncEpisodeTasks(currentEpisodeId.value)
  }

  async function loadAssetWorkbenchTab(tab, { force = false } = {}) {
    const type = assetTypeForWorkbenchTab(tab)
    if (!store.dramaId || !type || (!force && workbenchTabLoaded[tab])) return
    if (!workbenchTabLoaded.script) {
      await loadScriptWorkbenchTab({ force: false })
    }
    const data = await workbenchAPI.assetsTab(store.dramaId, {
      type,
      episode_id: currentEpisodeId.value || undefined,
    })
    applyAssetsWorkbenchTab(data)
    workbenchTabLoaded[tab] = true
  }

  async function loadStoryboardsWorkbenchTab({ force = false, recoverTasks = false } = {}) {
    if (!store.dramaId || (!force && workbenchTabLoaded.storyboards)) return
    if (!workbenchTabLoaded.script) {
      await loadScriptWorkbenchTab({ force: false })
    }
    const data = await workbenchAPI.storyboardsTab(store.dramaId, {
      episode_id: currentEpisodeId.value || selectedEpisodeId.value || undefined,
    })
    applyStoryboardsWorkbenchTab(data)
    workbenchTabLoaded.storyboards = true
    await loadStoryboardMedia({ force: true })
    if (recoverTasks) await recoverAndSyncEpisodeTasks(currentEpisodeId.value)
  }

  async function loadVideoComposeWorkbenchTab({ force = false, recoverTasks = false } = {}) {
    if (!store.dramaId || (!force && workbenchTabLoaded.videoCompose)) return
    if (!workbenchTabLoaded.script) {
      await loadScriptWorkbenchTab({ force: false })
    }
    const data = await workbenchAPI.videoComposeTab(store.dramaId, {
      episode_id: currentEpisodeId.value || selectedEpisodeId.value || undefined,
    })
    applyVideoComposeWorkbenchTab(data)
    workbenchTabLoaded.videoCompose = true
    if (recoverTasks) await recoverAndSyncEpisodeTasks(currentEpisodeId.value)
  }

  async function loadWorkbenchTab(tab = filmWorkbenchTab.value, options = {}) {
    if (tab === 'script') return loadScriptWorkbenchTab(options)
    if (['characters', 'scenes', 'props'].includes(tab)) return loadAssetWorkbenchTab(tab, options)
    if (tab === 'storyboards') return loadStoryboardsWorkbenchTab(options)
    if (tab === 'videoCompose') return loadVideoComposeWorkbenchTab(options)
  }

  async function loadInitialWorkbenchData({ recoverTasks = false } = {}) {
    await loadWorkbenchSummary({ applySettings: true })
    await loadWorkbenchTab(filmWorkbenchTab.value || 'script', { force: true, recoverTasks })
  }

  return {
    dramaId,
    workbenchSummary,
    workbenchSummaryLoading,
    projectTitle,
    characters,
    scenes,
    props,
    storyboards,
    currentEpisode,
    currentEpisodeId,
    videoProgress,
    videoStatus,
    assetTypeForWorkbenchTab,
    applyWorkbenchSummarySettings,
    loadWorkbenchSummary,
    resetWorkbenchTabLoaded,
    markAllWorkbenchTabsLoaded,
    mergeCurrentEpisodePatch,
    applyScriptWorkbenchTab,
    applyAssetsWorkbenchTab,
    applyStoryboardsWorkbenchTab,
    refreshStoryboardsForEpisode,
    refreshStoryboardsOnly,
    applyVideoComposeWorkbenchTab,
    loadScriptWorkbenchTab,
    loadAssetWorkbenchTab,
    loadStoryboardsWorkbenchTab,
    loadVideoComposeWorkbenchTab,
    loadWorkbenchTab,
    loadInitialWorkbenchData,
  }
}
