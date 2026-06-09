import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { dramaAPI } from '@/api/drama'
import { parseScriptIntoEpisodes, episodesListToPlainScript } from '@/utils/scriptEpisodes'

export function useScriptWorkbench(deps = {}) {
  const {
    store,
    route,
    router,
    loadDrama = async () => {},
    maxStoryEpisodeCount = 100,
  } = deps

  const storyInput = ref('')
  const storyStyle = ref('')
  const storyType = ref('')
  const storyEpisodeCount = ref(1)
  const storyGenerating = ref(false)
  const scriptWorkbenchMode = ref('create')
  const showSelectScriptDialog = ref(false)
  const selectScriptLoading = ref(false)
  const selectScriptImporting = ref(false)
  const selectScriptDramas = ref([])
  const selectPreviewEpisodeId = ref('')
  const showNovelImport = ref(false)
  const novelImportMode = ref('text')
  const novelText = ref('')
  const novelFileName = ref('')
  const novelFileContent = ref('')
  const novelMaxChapters = ref(10)
  const novelAiSummarize = ref(false)
  const novelImporting = ref(false)
  const scriptTitle = ref('')
  const selectedEpisodeId = ref(null)
  const savedCurrentEpisodeNumber = ref(1)
  const scriptGenerating = ref(false)

  const scriptContent = computed({
    get: () => store?.scriptContent,
    set: (value) => store?.setScriptContent?.(value),
  })

  const selectableScriptDramas = computed(() => {
    const cur = store?.dramaId
    const list = selectScriptDramas.value || []
    if (cur == null) return list
    return list.filter((drama) => Number(drama.id) !== Number(cur))
  })

  function normalizeStoryEpisodeCount() {
    const n = Number(storyEpisodeCount.value)
    if (!Number.isFinite(n)) {
      storyEpisodeCount.value = 1
      return
    }
    storyEpisodeCount.value = Math.max(1, Math.min(maxStoryEpisodeCount, Math.trunc(n)))
  }

  function openSelectScriptDialog() {
    showSelectScriptDialog.value = true
  }

  async function loadSelectScriptList() {
    selectScriptLoading.value = true
    try {
      const res = await dramaAPI.list({ page: 1, page_size: 100 })
      const items = res?.items ?? []
      selectScriptDramas.value = items.filter((drama) => drama?.metadata?.script_template === true)
    } catch {
      selectScriptDramas.value = []
    } finally {
      selectScriptLoading.value = false
    }
  }

  async function onPickScriptFromDialog(sourceId) {
    if (!sourceId || selectScriptImporting.value) return
    const srcNum = Number(sourceId)
    const routeId = route?.params?.id
    const targetFromRoute = routeId && routeId !== 'new' ? Number(routeId) : null
    const targetId = store?.dramaId ?? targetFromRoute ?? null

    if (targetId != null && Number(targetId) === srcNum) {
      ElMessage.info('当前打开的就是该项目')
      return
    }

    if (targetId != null) {
      try {
        await ElMessageBox.confirm(
          '将把所选剧本的「故事梗概」与「各集剧本正文」写入当前工程。不会导入角色、场景、分镜与视频。若源剧本集数更少，多出来的分集将从本工程移除（原分镜可能失效）。是否继续？',
          '导入剧本到当前工程',
          { type: 'warning', confirmButtonText: '导入', cancelButtonText: '取消' }
        )
      } catch {
        return
      }
    }

    selectScriptImporting.value = true
    try {
      const src = await dramaAPI.get(srcNum)
      const rawEps = [...(src.episodes || [])].sort(
        (a, b) => (Number(a.episode_number) || 0) - (Number(b.episode_number) || 0)
      )
      const summary = (src.description || '').toString().trim()
      const episodesPayload = rawEps.map((ep, index) => ({
        episode_number: ep.episode_number != null ? Number(ep.episode_number) : index + 1,
        title: (ep.title || '').toString(),
        script_content: ep.script_content ?? '',
        description: ep.description ?? null,
        duration: ep.duration ?? 0,
      }))

      if (!targetId) {
        if (episodesPayload.length === 0 && !summary) {
          ElMessage.warning('所选剧本没有可导入的梗概或分集正文')
          return
        }
        const title = (src.title || '新故事').toString().trim() || '新故事'
        const created = await dramaAPI.create({
          title,
          description: summary || undefined,
          metadata: {},
        })
        const workId = created.id
        store?.setDrama?.({ id: workId })
        if (episodesPayload.length > 0) {
          await dramaAPI.saveEpisodes(workId, episodesPayload)
        }
        if (summary) {
          await dramaAPI.saveOutline(workId, { summary }).catch(() => {})
        }
        showSelectScriptDialog.value = false
        router?.replace?.('/film/' + workId)
        ElMessage.success('已根据所选剧本创建项目并导入梗概与正文')
        scriptWorkbenchMode.value = 'select'
        return
      }

      if (summary) {
        await dramaAPI.saveOutline(targetId, { summary }).catch(() => {})
      }
      if (episodesPayload.length > 0) {
        await dramaAPI.saveEpisodes(targetId, episodesPayload)
      } else if (!summary) {
        ElMessage.warning('所选剧本没有可导入的梗概或分集正文')
        return
      }

      showSelectScriptDialog.value = false
      await loadDrama()
      ElMessage.success('已导入故事梗概与剧本（当前工程未切换）')
      scriptWorkbenchMode.value = 'select'
    } catch (err) {
      ElMessage.error(err.message || '导入失败')
    } finally {
      selectScriptImporting.value = false
    }
  }

  function novelImportReset() {
    novelText.value = ''
    novelFileName.value = ''
    novelFileContent.value = ''
  }

  function onNovelFileChange(file) {
    novelFileName.value = file.name
    const reader = new FileReader()
    reader.onload = (event) => {
      novelFileContent.value = event.target.result
    }
    reader.readAsText(file.raw || file, 'utf-8')
  }

  async function onImportNovel() {
    const text = novelImportMode.value === 'file' ? novelFileContent.value : novelText.value
    if (!text?.trim()) {
      ElMessage.warning('请输入或上传小说内容')
      return
    }
    novelImporting.value = true
    try {
      const formData = new FormData()
      if (novelImportMode.value === 'file' && novelFileContent.value) {
        const blob = new Blob([novelFileContent.value], { type: 'text/plain' })
        formData.append('file', blob, novelFileName.value || 'novel.txt')
      } else {
        formData.append('text', text)
      }
      formData.append('title', scriptTitle.value || '导入小说')
      formData.append('max_chapters', String(novelMaxChapters.value))
      formData.append('ai_summarize', String(novelAiSummarize.value))
      const { default: axios } = await import('axios')
      const baseURL = (await import('@/utils/request')).default.defaults.baseURL || '/api/v1'
      const res = await axios.post(`${baseURL}/dramas/import-novel`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      let chapters = res.data?.data?.chapters || res.data?.chapters || []
      if (!chapters.length) {
        ElMessage.warning('未能识别到章节内容')
        return
      }
      const clientParsed = parseScriptIntoEpisodes(text)
      if (clientParsed.split && clientParsed.episodes.length > chapters.length) {
        chapters = clientParsed.episodes.map((episode, index) => ({
          index: index + 1,
          title: episode.title,
          content: episode.script_content,
          script: episode.script_content,
        }))
      }
      const toEpisodeRow = (chapter, index) => ({
        episode_number: index + 1,
        title: (chapter.title && String(chapter.title).trim()) || '第' + (index + 1) + '集',
        script_content: String(chapter.script ?? chapter.content ?? '').trimEnd(),
        description: null,
        duration: 0,
      })
      const rows = chapters.map(toEpisodeRow)
      const plainScript = episodesListToPlainScript(
        rows.map((row) => ({ title: row.title, script_content: row.script_content }))
      )
      if (store?.dramaId && rows.length >= 2) {
        await dramaAPI.saveEpisodes(store.dramaId, rows)
        await loadDrama()
        ElMessage.success(`已导入并拆分为 ${rows.length} 集`)
      } else {
        store?.setScriptContent?.(plainScript || rows[0]?.script_content || '')
        ElMessage.success(
          rows.length >= 2
            ? `已导入 ${rows.length} 个章节（保存剧本时将写入多集）`
            : `成功导入 ${rows.length} 个章节，请继续编辑剧本`
        )
      }
      showNovelImport.value = false
      novelImportReset()
    } catch (err) {
      ElMessage.error(err.message || '导入失败')
    } finally {
      novelImporting.value = false
    }
  }

  function resetScriptWorkbenchState() {
    storyInput.value = ''
    scriptTitle.value = ''
    selectedEpisodeId.value = null
    savedCurrentEpisodeNumber.value = 1
    storyStyle.value = ''
    storyType.value = ''
    storyEpisodeCount.value = 1
    scriptWorkbenchMode.value = 'create'
    storyGenerating.value = false
    scriptGenerating.value = false
    selectPreviewEpisodeId.value = ''
    novelImportReset()
  }

  watch(
    () => [store?.drama?.episodes, selectedEpisodeId.value],
    () => {
      const eps = store?.drama?.episodes || []
      if (eps.length > 1) {
        const cur = selectedEpisodeId.value
        const hit = cur != null && eps.some((episode) => Number(episode.id) === Number(cur))
        selectPreviewEpisodeId.value = hit ? String(cur) : String(eps[0].id)
      } else {
        selectPreviewEpisodeId.value = ''
      }
    },
    { deep: true, immediate: true }
  )

  return {
    loadSelectScriptList,
    normalizeStoryEpisodeCount,
    novelAiSummarize,
    novelFileContent,
    novelFileName,
    novelImporting,
    novelImportMode,
    novelImportReset,
    novelMaxChapters,
    novelText,
    onImportNovel,
    onNovelFileChange,
    onPickScriptFromDialog,
    openSelectScriptDialog,
    resetScriptWorkbenchState,
    savedCurrentEpisodeNumber,
    scriptContent,
    scriptGenerating,
    scriptTitle,
    scriptWorkbenchMode,
    selectableScriptDramas,
    selectedEpisodeId,
    selectPreviewEpisodeId,
    selectScriptDramas,
    selectScriptImporting,
    selectScriptLoading,
    showNovelImport,
    showSelectScriptDialog,
    storyEpisodeCount,
    storyGenerating,
    storyInput,
    storyStyle,
    storyType,
  }
}
