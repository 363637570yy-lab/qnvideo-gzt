import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { dramaAPI } from '@/api/drama'
import { GEN_RESOURCE } from '@/stores/generationTaskStore'

export function useVideoWorkbench(deps = {}) {
  const {
    store,
    genStore,
    dramaId,
    currentEpisode,
    currentEpisodeId,
    loadDrama = async () => {},
    pollTask = async () => {},
    confirmAdminProjectOperation = async () => true,
  } = deps

  const videoMusic = ref('')
  const videoSfx = ref('')
  const videoQuality = ref('high')
  const videoSubtitle = ref(false)
  const videoBurnDialogue = ref(false)
  const videoWatermark = ref(false)
  const videoWatermarkText = ref('')
  const videoErrorMsg = ref('')

  const currentEpisodeVideoUrl = computed(() => {
    const url = currentEpisode?.value?.video_url
    if (!url || !String(url).trim()) return ''
    const text = String(url).trim()
    if (text.startsWith('http://') || text.startsWith('https://')) return text
    return '/static/' + text.replace(/^\//, '')
  })

  function getFinalizeMergeOptions() {
    return {
      burn_narration_subtitles: !!videoSubtitle.value,
      burn_dialogue_audio: !!videoBurnDialogue.value,
      watermark_text: videoWatermark.value
        ? String(videoWatermarkText.value || '').trim().slice(0, 200)
        : '',
    }
  }

  async function onGenerateVideo() {
    if (!currentEpisodeId?.value) return
    if (!(await confirmAdminProjectOperation('合成当前集视频'))) return
    const epId = currentEpisodeId.value
    const did = dramaId?.value
    const dramaTitle = store?.drama?.title || ''
    const epNum = store?.currentEpisode?.episode_number
    const epLabel = dramaTitle ? `${dramaTitle} · 第${epNum ?? ''}集` : `第${epNum ?? ''}集`
    const mergeMeta = {
      dramaId: did,
      episodeId: epId,
      dramaTitle,
      episodeNumber: epNum,
      resourceType: GEN_RESOURCE.EPISODE_MERGE,
      resourceId: epId,
      label: `${epLabel} 合成视频`,
    }
    store?.setVideoStatus?.('generating', did, epId)
    store?.setVideoProgress?.(5, did, epId)
    genStore?.markRunning?.(mergeMeta)
    videoErrorMsg.value = ''
    try {
      const result = await dramaAPI.finalizeEpisode(epId, getFinalizeMergeOptions())
      if (result?.task_id != null) {
        store?.setVideoProgress?.(10, did, epId)
        ElMessage.success(result?.message || '视频合成任务已提交，请稍后查看')
        const pollResult = await pollTask(result.task_id, () => loadDrama(), mergeMeta)
        await loadDrama()
        if (pollResult?.status === 'completed') {
          store?.setVideoProgress?.(100, did, epId)
          if (currentEpisodeVideoUrl.value) {
            store?.setVideoStatus?.('done', did, epId)
            ElMessage.success('视频生成完成')
          } else {
            store?.setVideoStatus?.('error', did, epId)
            videoErrorMsg.value = '视频生成完成但未获取到播放地址，请稍后刷新'
            ElMessage.warning(videoErrorMsg.value)
          }
        } else if (pollResult?.status === 'failed') {
          store?.setVideoStatus?.('error', did, epId)
          videoErrorMsg.value = pollResult?.error || '视频生成失败'
        } else if (pollResult?.status === 'timeout') {
          store?.setVideoStatus?.('generating', did, epId)
          videoErrorMsg.value = '任务仍在排队或生成中，请稍后刷新查看'
          ElMessage.warning(videoErrorMsg.value)
        }
      } else {
        store?.setVideoStatus?.('error', did, epId)
        const msg = result?.message || '本集没有可合成的视频片段'
        videoErrorMsg.value = msg
        ElMessage.warning(msg)
      }
    } catch (error) {
      videoErrorMsg.value = error.message || '生成失败'
      store?.setVideoStatus?.('error', did, epId)
    } finally {
      if (store?.getVideoStatus?.(did, epId) !== 'generating') {
        genStore?.markDone?.(mergeMeta)
      }
    }
  }

  return {
    currentEpisodeVideoUrl,
    getFinalizeMergeOptions,
    onGenerateVideo,
    videoBurnDialogue,
    videoErrorMsg,
    videoMusic,
    videoQuality,
    videoSfx,
    videoSubtitle,
    videoWatermark,
    videoWatermarkText,
  }
}
