import { nextTick, ref } from 'vue'
import { ElMessage } from 'element-plus'

export function useFilmCreateProject(deps = {}) {
  const {
    route,
    store,
    dramaAPI,
    backfillDramaStylePromptMetadataIfNeeded,
    workbenchTabLoaded,
    filmWorkbenchTab,
    selectedEpisodeId,
    savedCurrentEpisodeNumber,
    scriptTitle,
    storyInput,
    storyStyle,
    storyType,
    workbenchSummary,
    clearPendingProjectSettingsSave = () => {},
    setProjectSettingsHydrating = () => {},
    hydrateProjectSettingsFromDrama = () => {},
    hydrateStoryboardSettingsFromMetadata = () => {},
    applyProjectAiRouteSelection = () => {},
    syncStoryboardStateFromEpisode = () => {},
    loadStoryboardMedia = async () => {},
    markAllWorkbenchTabsLoaded = () => {},
    loadWorkbenchSummary = async () => {},
    loadWorkbenchTab = async () => {},
    loadInitialWorkbenchData = async () => {},
    resetWorkbenchTabLoaded = () => {},
    resetScriptWorkbenchState = () => {},
    resetProjectSettings = () => {},
    resetStoryboardSettings = () => {},
    recoverAndSyncEpisodeTasks = async () => {},
  } = deps

  const loadDramaPromise = ref(null)

  function resetEpisodeWorkbenches() {
    ;['characters', 'scenes', 'props', 'storyboards', 'videoCompose'].forEach((key) => {
      workbenchTabLoaded[key] = false
    })
  }

  function onEpisodeSelect(epId) {
    if (epId == null) {
      store.setCurrentEpisode(null)
      store.setScriptContent('')
      scriptTitle.value = ''
      syncStoryboardStateFromEpisode(null)
      return
    }
    resetEpisodeWorkbenches()
    const list = store.drama?.episodes || []
    const ep = list.find((item) => Number(item.id) === Number(epId))
    if (!ep) return
    store.setCurrentEpisode(ep)
    store.setScriptContent(ep.script_content || '')
    scriptTitle.value = ep.title || '第' + (ep.episode_number || 0) + '集'
    syncStoryboardStateFromEpisode(ep)
    loadWorkbenchTab(filmWorkbenchTab.value, { force: true }).catch(() => {})
    recoverAndSyncEpisodeTasks(epId)
  }

  async function loadDrama({ force = false, recoverTasks = false } = {}) {
    if (!store.dramaId) return
    if (!force && loadDramaPromise.value) return loadDramaPromise.value
    loadDramaPromise.value = (async () => {
      let drama = await dramaAPI.get(store.dramaId)
      drama = await backfillDramaStylePromptMetadataIfNeeded(dramaAPI, store.dramaId, drama)
      store.setDrama(drama)
      setProjectSettingsHydrating(true)
      try {
        storyInput.value = (drama.description || '').toString().trim()
        storyStyle.value = drama.metadata?.story_style || ''
        storyType.value = drama.genre || ''
        hydrateProjectSettingsFromDrama(drama)
        hydrateStoryboardSettingsFromMetadata(drama.metadata || {})
        applyProjectAiRouteSelection(drama.metadata || {})
      } finally {
        nextTick(() => {
          setProjectSettingsHydrating(false)
        })
      }

      const episodes = drama.episodes || []
      const currentId = selectedEpisodeId.value
      let episode = currentId != null ? episodes.find((item) => Number(item.id) === Number(currentId)) : null
      if (!episode) {
        const wantNum = savedCurrentEpisodeNumber.value
        episode = episodes.find((item) => Number(item.episode_number) === Number(wantNum)) || episodes[0] || null
      }
      store.setCurrentEpisode(episode)
      if (episode) {
        store.setScriptContent(episode.script_content || '')
        scriptTitle.value = episode.title || '第' + (episode.episode_number || 0) + '集'
        selectedEpisodeId.value = episode.id
      } else {
        store.setScriptContent('')
        scriptTitle.value = ''
        selectedEpisodeId.value = null
      }
      syncStoryboardStateFromEpisode(episode)
      await loadStoryboardMedia()
      markAllWorkbenchTabsLoaded()
      loadWorkbenchSummary({ applySettings: false })
      if (recoverTasks) {
        await recoverAndSyncEpisodeTasks(episode?.id)
      }
    })()
    try {
      return await loadDramaPromise.value
    } catch (err) {
      ElMessage.error(err.message || '加载失败')
    } finally {
      loadDramaPromise.value = null
    }
  }

  function applyRouteToStore() {
    clearPendingProjectSettingsSave()
    const id = route.params.id
    if (id && id !== 'new') {
      resetWorkbenchTabLoaded()
      store.setDrama({ id: Number(id) })
      if (route.query.episode) {
        selectedEpisodeId.value = Number(route.query.episode)
      }
      loadInitialWorkbenchData({ recoverTasks: true })
    } else {
      store.reset()
      resetWorkbenchTabLoaded()
      workbenchSummary.value = null
      resetScriptWorkbenchState()
      resetProjectSettings()
      resetStoryboardSettings()
      applyProjectAiRouteSelection({})
    }
  }

  return {
    applyRouteToStore,
    loadDrama,
    loadDramaPromise,
    onEpisodeSelect,
  }
}
