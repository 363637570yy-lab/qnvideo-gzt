import { ElMessage } from 'element-plus'
import { exportStoryboardSheet } from '@/utils/exportStoryboardSheet'

export function useStoryboardAuxActions(deps = {}) {
  const {
    store,
    storyboardsAPI,
    currentEpisodeId,
    storyboards,
    exportingStoryboardSheet,
    upscalingSbIds,
    ttsSbIds,
    ttsSbNarrationIds,
    sbDialogueAudioPaths,
    sbNarrationAudioPaths,
    sbNarration,
    sbTitle,
    sbLocation,
    sbTime,
    sbDuration,
    sbDialogue,
    sbAction,
    sbResult,
    sbAtmosphere,
    sbShotType,
    sbMovement,
    sbLayoutDescription,
    sbUniversalSegmentText,
    storyboardUseFirstLastFrame,
    loadSingleStoryboardMedia = async () => {},
    ttsAiPayload = () => ({}),
    getSbFirstImage = () => null,
    getSbLastImage = () => null,
    buildFirstFrameImagePrompt = () => '',
    buildLastFrameImagePrompt = () => '',
    getSbSelectedScene = () => null,
    getSbSelectedCharacters = () => [],
    getSbSelectedProps = () => [],
    getMovementLabel = (value) => value || '',
  } = deps

  let sbTtsPreviewAudio = null

  async function onUpscaleSbImage(sb) {
    if (!sb?.id || upscalingSbIds.has(sb.id)) return
    upscalingSbIds.add(sb.id)
    try {
      await storyboardsAPI.upscale(sb.id)
      ElMessage.success('超分完成，图片已更新为高清版本')
      await loadSingleStoryboardMedia(sb.id)
    } catch (e) {
      ElMessage.error(e.message || '超分辨率失败')
    } finally {
      upscalingSbIds.delete(sb.id)
    }
  }

  function normalizeAudioRelPath(raw) {
    return String(raw != null ? raw : '').trim().replace(/^\//, '')
  }

  function sbDialogueAudioRelPath(sb) {
    if (!sb?.id) return ''
    const fromCache = sbDialogueAudioPaths.value[sb.id]
    const fromRow = sb.audio_local_path
    const raw = (fromCache != null && String(fromCache).trim() !== '') ? fromCache : (fromRow != null ? fromRow : '')
    return normalizeAudioRelPath(raw)
  }

  function sbNarrationAudioRelPath(sb) {
    if (!sb?.id) return ''
    const fromCache = sbNarrationAudioPaths.value[sb.id]
    const fromRow = sb.narration_audio_local_path
    const raw = (fromCache != null && String(fromCache).trim() !== '') ? fromCache : (fromRow != null ? fromRow : '')
    return normalizeAudioRelPath(raw)
  }

  function playSbTtsFromRel(rel) {
    if (!rel) return
    const url = `/static/${rel}`
    try {
      if (sbTtsPreviewAudio) {
        sbTtsPreviewAudio.pause()
        sbTtsPreviewAudio = null
      }
      const audio = new Audio(url)
      sbTtsPreviewAudio = audio
      audio.addEventListener('ended', () => {
        if (sbTtsPreviewAudio === audio) sbTtsPreviewAudio = null
      })
      audio.play().catch(() => {
        ElMessage.warning('无法播放音频，请检查文件是否存在')
        if (sbTtsPreviewAudio === audio) sbTtsPreviewAudio = null
      })
    } catch (_) {
      ElMessage.warning('无法播放音频')
    }
  }

  function playSbDialogueTts(sb) {
    playSbTtsFromRel(sbDialogueAudioRelPath(sb))
  }

  function playSbNarrationTts(sb) {
    playSbTtsFromRel(sbNarrationAudioRelPath(sb))
  }

  async function requestStoryboardTts(sb, text, kind) {
    const res = await fetch('/api/v1/audio/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storyboard_id: sb.id,
        text,
        tts_kind: kind,
        ...ttsAiPayload(),
      }),
    })
    const data = await res.json()
    const businessOk = data.success === true || Number(data.code) === 200
    if (!res.ok || !businessOk) {
      throw new Error(data.error?.message || data.message || '配音失败')
    }
    return data
  }

  async function onTtsSbDialogue(sb) {
    if (!sb?.id || ttsSbIds.has(sb.id)) return
    if (!sb.dialogue?.trim()) {
      ElMessage.warning('该分镜没有对白内容')
      return
    }
    ttsSbIds.add(sb.id)
    try {
      const data = await requestStoryboardTts(sb, sb.dialogue, 'dialogue')
      if (data.data?.local_path) {
        sbDialogueAudioPaths.value = { ...sbDialogueAudioPaths.value, [sb.id]: data.data.local_path }
        sb.audio_local_path = data.data.local_path
        ElMessage.success('配音已生成')
      }
    } catch (e) {
      ElMessage.error(e.message || 'TTS 配音失败')
    } finally {
      ttsSbIds.delete(sb.id)
    }
  }

  async function onTtsSbNarration(sb) {
    if (!sb?.id || ttsSbNarrationIds.has(sb.id)) return
    const text = ((sbNarration.value[sb.id] ?? sb.narration) || '').toString().trim()
    if (!text) {
      ElMessage.warning('该分镜没有解说旁白内容')
      return
    }
    ttsSbNarrationIds.add(sb.id)
    try {
      const data = await requestStoryboardTts(sb, text, 'narration')
      if (data.data?.local_path) {
        sbNarrationAudioPaths.value = { ...sbNarrationAudioPaths.value, [sb.id]: data.data.local_path }
        sb.narration_audio_local_path = data.data.local_path
        ElMessage.success('解说配音已生成')
      }
    } catch (e) {
      ElMessage.error(e.message || '解说 TTS 失败')
    } finally {
      ttsSbNarrationIds.delete(sb.id)
    }
  }

  function formatSrtTimestamp(ms) {
    if (!Number.isFinite(ms) || ms < 0) ms = 0
    const h = Math.floor(ms / 3600000)
    const m = Math.floor((ms % 3600000) / 60000)
    const s = Math.floor((ms % 60000) / 1000)
    const z = Math.floor(ms % 1000)
    const p2 = (n) => String(n).padStart(2, '0')
    return `${p2(h)}:${p2(m)}:${p2(s)},${String(z).padStart(3, '0')}`
  }

  async function onExportStoryboardSheet() {
    const boards = storyboards.value || []
    if (!boards.length) {
      ElMessage.warning('暂无分镜')
      return
    }
    const epNum = store.currentEpisode?.episode_number
    const dramaTitle = (store.drama?.title || 'project').replace(/[\\/:*?"<>|]/g, '_')
    const epLabel = epNum != null ? `第${epNum}集` : `ep${currentEpisodeId.value || '1'}`
    const filenameBase = `${dramaTitle}-${epLabel}-分镜表`
    const useFirstLast = !!storyboardUseFirstLastFrame.value
    const framePromptBySbId = {}

    exportingStoryboardSheet.value = true
    try {
      await Promise.all(
        boards.map(async (sb) => {
          try {
            const res = await storyboardsAPI.getFramePrompts(sb.id)
            const framePrompts = res?.frame_prompts || []
            framePromptBySbId[sb.id] = {
              first: framePrompts.find((item) => item.frame_type === 'first')?.prompt?.trim() || '',
              last: framePrompts.find((item) => item.frame_type === 'last')?.prompt?.trim() || '',
            }
          } catch (_) {
            framePromptBySbId[sb.id] = { first: '', last: '' }
          }
        })
      )
    } finally {
      exportingStoryboardSheet.value = false
    }

    function resolveFirstFramePrompt(sbId) {
      const cached = framePromptBySbId[sbId]?.first
      if (cached) return cached
      const imgPrompt = getSbFirstImage(sbId)?.prompt?.trim()
      if (imgPrompt) return imgPrompt
      if (useFirstLast) return buildFirstFrameImagePrompt(sbId)
      return ''
    }

    function resolveLastFramePrompt(sbId) {
      const cached = framePromptBySbId[sbId]?.last
      if (cached) return cached
      const imgPrompt = getSbLastImage(sbId)?.prompt?.trim()
      if (imgPrompt) return imgPrompt
      if (useFirstLast) return buildLastFrameImagePrompt(sbId)
      return ''
    }

    const result = exportStoryboardSheet(
      {
        storyboards: boards,
        getScene: (sbId) => getSbSelectedScene(sbId),
        getCharacters: (sbId) => getSbSelectedCharacters(sbId),
        getProps: (sbId) => getSbSelectedProps(sbId),
        getMovementLabel,
        getFirstFramePrompt: resolveFirstFramePrompt,
        getLastFramePrompt: resolveLastFramePrompt,
        getField(sb, key) {
          const id = sb.id
          const map = {
            title: sbTitle.value[id],
            location: sbLocation.value[id],
            time: sbTime.value[id],
            duration: sbDuration.value[id] ?? sb.duration,
            dialogue: sbDialogue.value[id],
            narration: sbNarration.value[id],
            action: sbAction.value[id],
            result: sbResult.value[id],
            atmosphere: sbAtmosphere.value[id],
            shot_type: sbShotType.value[id],
            movement: sbMovement.value[id],
            layout_description: sbLayoutDescription.value[id],
            universal_segment_text: sbUniversalSegmentText.value[id],
          }
          if (Object.prototype.hasOwnProperty.call(map, key)) {
            const value = map[key]
            return value != null && value !== '' ? value : sb[key]
          }
          return sb[key]
        },
      },
      filenameBase
    )

    if (!result.ok) {
      ElMessage.warning('当前分镜没有可导出的内容')
      return
    }
    ElMessage.success(`已导出分镜表（${result.count} 个镜头）`)
  }

  function onExportNarrationSrt() {
    const boards = storyboards.value || []
    if (!boards.length) {
      ElMessage.warning('暂无分镜')
      return
    }
    let tMs = 0
    const lines = []
    let idx = 1
    for (const sb of boards) {
      const durSec = Number(sbDuration.value[sb.id] ?? sb.duration)
      const sec = Number.isFinite(durSec) && durSec > 0 ? durSec : 5
      const durMs = Math.round(sec * 1000)
      const text = ((sbNarration.value[sb.id] ?? sb.narration) || '').toString().trim()
      if (text) {
        const start = formatSrtTimestamp(tMs)
        const end = formatSrtTimestamp(tMs + durMs)
        lines.push(String(idx++), `${start} --> ${end}`, text, '')
      }
      tMs += durMs
    }
    if (!lines.length) {
      ElMessage.warning('当前分镜没有可导出的解说文案')
      return
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(blob)
    anchor.download = `narration-${currentEpisodeId.value || 'episode'}.srt`
    anchor.click()
    URL.revokeObjectURL(anchor.href)
    ElMessage.success('已下载解说 SRT')
  }

  async function onSaveSbNarrationField(sb) {
    if (!sb?.id) return
    const next = (sbNarration.value[sb.id] || '').toString().trim()
    const prev = (sb.narration || '').toString().trim()
    if (next === prev) return
    try {
      await storyboardsAPI.update(sb.id, { narration: next || null })
      const list = store.currentEpisode?.storyboards
      if (Array.isArray(list)) {
        const row = list.find((item) => Number(item.id) === Number(sb.id))
        if (row) row.narration = next || null
      }
    } catch (_) {
      // 静默失败，避免打断输入。
    }
  }

  function stopSbTtsPreview() {
    if (!sbTtsPreviewAudio) return
    sbTtsPreviewAudio.pause()
    sbTtsPreviewAudio = null
  }

  return {
    formatSrtTimestamp,
    normalizeAudioRelPath,
    onExportNarrationSrt,
    onExportStoryboardSheet,
    onSaveSbNarrationField,
    onTtsSbDialogue,
    onTtsSbNarration,
    onUpscaleSbImage,
    playSbDialogueTts,
    playSbNarrationTts,
    playSbTtsFromRel,
    sbDialogueAudioRelPath,
    sbNarrationAudioRelPath,
    stopSbTtsPreview,
  }
}
