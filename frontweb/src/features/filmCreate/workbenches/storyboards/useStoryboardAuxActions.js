import { ElMessage, ElMessageBox } from 'element-plus'
import { exportStoryboardSheet } from '@/utils/exportStoryboardSheet'

export function useStoryboardAuxActions(deps = {}) {
  const {
    store,
    imagesAPI,
    storyboardsAPI,
    dramaId,
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
    sbAngle,
    sbAngleH,
    sbAngleV,
    sbAngleS,
    sbAtmosphere,
    sbLighting,
    sbDof,
    sbShotType,
    sbMovement,
    sbLayoutDescription,
    sbCreationMode,
    sbSelectedImgId,
    sbUniversalSegmentText,
    videoClipDuration,
    showVideoParamsDialog,
    videoParamsTarget,
    videoParamsSaving,
    splitByAudioLoading,
    inferringParams,
    regeneratingLayoutSbIds,
    linkingTailFrameIds,
    usingPrevTailAsFirstIds,
    storyboardUseFirstLastFrame,
    loadDrama = async () => {},
    refreshStoryboardsOnly = async () => {},
    loadSingleStoryboardMedia = async () => {},
    ttsAiPayload = () => ({}),
    getSbFirstImage = () => null,
    getSbLastImage = () => null,
    buildFirstFrameImagePrompt = () => '',
    buildLastFrameImagePrompt = () => '',
    getSbSelectedScene = () => null,
    getSbSelectedCharacters = () => [],
    getSbSelectedProps = () => [],
    getNextStoryboard = () => null,
    getPrevStoryboard = () => null,
    getSbVideo = () => null,
    onSelectSbFrameImage = () => {},
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

  async function onSaveSbVideoFields(sb) {
    if (!sb?.id) return
    try {
      await storyboardsAPI.update(sb.id, {
        title: (sbTitle.value[sb.id] || '').toString().trim() || null,
        location: (sbLocation.value[sb.id] || '').toString().trim() || null,
        time: (sbTime.value[sb.id] || '').toString().trim() || null,
        duration: Number(sbDuration.value[sb.id]) || Number(videoClipDuration.value) || 10,
        action: (sbAction.value[sb.id] || '').toString().trim() || null,
        dialogue: (sbDialogue.value[sb.id] || '').toString().trim() || null,
        narration: (sbNarration.value[sb.id] || '').toString().trim() || null,
        atmosphere: (sbAtmosphere.value[sb.id] || '').toString().trim() || null,
        result: (sbResult.value[sb.id] || '').toString().trim() || null,
        angle: (sbAngle.value[sb.id] || '').toString().trim() || null,
        angle_h: sbAngleH.value[sb.id] || null,
        angle_v: sbAngleV.value[sb.id] || null,
        angle_s: sbAngleS.value[sb.id] || null,
        movement: (sbMovement.value[sb.id] || '').toString().trim() || null,
        lighting_style: sbLighting.value[sb.id] || null,
        depth_of_field: sbDof.value[sb.id] || null,
        shot_type: (sbShotType.value[sb.id] || '').toString().trim() || null,
        layout_description: (sbLayoutDescription.value[sb.id] || '').toString().trim() || null,
        creation_mode: sbCreationMode.value[sb.id] === 'universal' ? 'universal' : 'classic',
        universal_segment_text: (sbUniversalSegmentText.value[sb.id] || '').toString().trim() || null,
      })
      const rebuilt = await storyboardsAPI.rebuildVideoPrompt(sb.id)
      const newVideoPrompt = (rebuilt?.video_prompt && String(rebuilt.video_prompt).trim()) || ''
      if (newVideoPrompt) {
        videoParamsTarget.value = { ...sb, video_prompt: newVideoPrompt }
      }
      await loadDrama()
      ElMessage.success('已保存，视频提示词已按最新规则自动生成')
    } catch (e) {
      ElMessage.error(e.message || '保存失败')
    }
  }

  function onOpenVideoParamsDialog(sb) {
    videoParamsTarget.value = sb
    showVideoParamsDialog.value = true
  }

  function onVideoParamsDialogClosed() {
    const sb = videoParamsTarget.value
    if (!sb?.id) return
    const row = (storyboards.value || []).find((item) => Number(item.id) === Number(sb.id))
    if (!row) return
    sbCreationMode.value = { ...sbCreationMode.value, [sb.id]: row.creation_mode === 'universal' ? 'universal' : 'classic' }
    sbUniversalSegmentText.value = { ...sbUniversalSegmentText.value, [sb.id]: (row.universal_segment_text ?? '').toString() }
  }

  function countDialogueLinesInSb(sb) {
    const raw = ((sbDialogue.value[sb.id] ?? sb.dialogue) || '').toString().trim()
    if (!raw) return 0
    const matches = raw.match(/[\u4e00-\u9fa5A-Za-z0-9·]{1,16}[：:]/g)
    return matches?.length || (raw ? 1 : 0)
  }

  function canSplitSbByAudio(sb) {
    if (!sb?.id) return false
    const dialogueCount = countDialogueLinesInSb(sb)
    const hasNarration = !!((sbNarration.value[sb.id] ?? sb.narration) || '').toString().trim()
    return dialogueCount + (hasNarration ? 1 : 0) >= 2
  }

  async function onSplitSbByAudio(sb) {
    if (!sb?.id) return
    try {
      await ElMessageBox.confirm(
        '将把本镜按「每句对白一条 + 旁白单独一条」拆成多个分镜，原镜变为第一条。已生成的视频不会保留。是否继续？',
        '按对白拆镜',
        { type: 'warning', confirmButtonText: '拆镜', cancelButtonText: '取消' }
      )
    } catch {
      return
    }
    splitByAudioLoading.value = true
    try {
      if (showVideoParamsDialog.value && videoParamsTarget.value?.id === sb.id) {
        await onSaveSbVideoFields(sb)
      }
      const res = await storyboardsAPI.splitByAudio(sb.id)
      const count = res?.storyboard_ids?.length ?? 0
      const summary = res?.plans_summary || ''
      showVideoParamsDialog.value = false
      await loadDrama()
      ElMessage.success(summary ? `已拆成 ${count} 条：${summary}` : `已拆成 ${count} 条分镜`)
    } catch (e) {
      ElMessage.error(e.message || '拆镜失败')
    } finally {
      splitByAudioLoading.value = false
    }
  }

  async function onSaveVideoParams() {
    const sb = videoParamsTarget.value
    if (!sb?.id) return
    videoParamsSaving.value = true
    try {
      await onSaveSbVideoFields(sb)
      showVideoParamsDialog.value = false
    } catch (e) {
      ElMessage.error(e.message || '保存失败')
    } finally {
      videoParamsSaving.value = false
    }
  }

  async function onBatchInferParams() {
    if (!currentEpisodeId.value) return
    inferringParams.value = true
    try {
      const res = await storyboardsAPI.batchInferParams(currentEpisodeId.value, false)
      await loadDrama()
      ElMessage.success(`摄影参数推断完成，更新了 ${res?.updated ?? 0} 条分镜`)
    } catch (e) {
      ElMessage.error(e.message || '推断失败')
    } finally {
      inferringParams.value = false
    }
  }

  async function onRegenerateLayoutDescription(sb) {
    if (sb && typeof sb === 'object' && sb.__v_isRef) sb = sb.value
    if (!sb?.id) return
    regeneratingLayoutSbIds.add(sb.id)
    try {
      const res = await storyboardsAPI.regenerateLayoutDescription(sb.id)
      const newText = res?.layout_description || res?.data?.layout_description
      if (newText) {
        sbLayoutDescription.value = { ...sbLayoutDescription.value, [sb.id]: newText }
        try { await refreshStoryboardsOnly() } catch (_) {}
        ElMessage.success('布局描述已由 AI 重新优化并保存（已参考上下分镜连贯性）')
      } else {
        ElMessage.warning('AI 未返回有效的布局描述')
      }
    } catch (e) {
      ElMessage.error(e.message || '重新生成布局描述失败')
    } finally {
      regeneratingLayoutSbIds.delete(sb.id)
    }
  }

  async function onLinkTailFrameToNext(sb) {
    if (!dramaId.value || !sb?.id) return
    const nextSb = getNextStoryboard(sb.id)
    if (!nextSb) {
      ElMessage.warning('已是最后一个分镜，没有下一个分镜可衔接')
      return
    }
    const video = getSbVideo(sb.id)
    if (!video) {
      ElMessage.warning('当前分镜没有视频')
      return
    }
    try {
      await ElMessageBox.confirm(
        `确定将 #${sb.storyboard_number ?? sb.id} 视频的尾帧设为 #${nextSb.storyboard_number ?? nextSb.id} 的首帧？\n原首帧将自动进入历史。`,
        '尾帧衔接',
        { confirmButtonText: '确认执行', cancelButtonText: '取消', type: 'warning' }
      )
    } catch {
      return
    }
    linkingTailFrameIds.add(sb.id)
    try {
      const data = await storyboardsAPI.linkTailFrame(sb.id, { drama_id: dramaId.value })
      if (data?.error) {
        throw new Error(data.error)
      }
      ElMessage.success(`已将尾帧设为 #${nextSb.storyboard_number ?? nextSb.id} 的首帧`)
      await Promise.all([
        loadSingleStoryboardMedia(sb.id),
        loadSingleStoryboardMedia(nextSb.id),
      ])
    } catch (e) {
      ElMessage.error(e.message || '尾帧衔接失败')
    } finally {
      linkingTailFrameIds.delete(sb.id)
    }
  }

  async function onUsePrevTailAsFirst(sb) {
    if (!dramaId.value || !sb?.id) return
    const prevSb = getPrevStoryboard(sb.id)
    if (!prevSb) {
      ElMessage.warning('已是第一个分镜，没有上一分镜可取尾帧')
      return
    }
    const prevLastImg = getSbLastImage(prevSb.id)
    if (!prevLastImg) {
      ElMessage.warning(`上一分镜 #${prevSb.storyboard_number ?? prevSb.id} 尚无尾帧图片`)
      return
    }

    usingPrevTailAsFirstIds.add(sb.id)
    try {
      const uploaded = await imagesAPI.upload({
        storyboard_id: sb.id,
        drama_id: dramaId.value,
        image_url: prevLastImg.image_url || '',
        local_path: prevLastImg.local_path || undefined,
        prompt: `上镜尾帧（直接复用 #${prevSb.storyboard_number ?? prevSb.id} 尾帧高清原图）`,
        frame_type: 'storyboard_first',
      })
      if (uploaded?.id) {
        onSelectSbFrameImage(sb, uploaded, 'first')
      }
      ElMessage.success(`已将 #${prevSb.storyboard_number ?? prevSb.id} 尾帧设为本分镜首帧（高清原图）`)
      await Promise.all([
        refreshStoryboardsOnly(),
        loadSingleStoryboardMedia(sb.id),
      ])
      delete sbSelectedImgId.value[sb.id]
    } catch (e) {
      ElMessage.error(e.message || '上镜尾帧设置失败')
    } finally {
      usingPrevTailAsFirstIds.delete(sb.id)
    }
  }

  function stopSbTtsPreview() {
    if (!sbTtsPreviewAudio) return
    sbTtsPreviewAudio.pause()
    sbTtsPreviewAudio = null
  }

  return {
    canSplitSbByAudio,
    countDialogueLinesInSb,
    formatSrtTimestamp,
    normalizeAudioRelPath,
    onBatchInferParams,
    onExportNarrationSrt,
    onExportStoryboardSheet,
    onLinkTailFrameToNext,
    onOpenVideoParamsDialog,
    onRegenerateLayoutDescription,
    onSaveSbNarrationField,
    onSaveSbVideoFields,
    onSaveVideoParams,
    onSplitSbByAudio,
    onTtsSbDialogue,
    onTtsSbNarration,
    onUpscaleSbImage,
    onUsePrevTailAsFirst,
    onVideoParamsDialogClosed,
    playSbDialogueTts,
    playSbNarrationTts,
    playSbTtsFromRel,
    sbDialogueAudioRelPath,
    sbNarrationAudioRelPath,
    stopSbTtsPreview,
  }
}
