import { ElMessage } from 'element-plus'

export function useStoryboardVideoPrompts(options = {}) {
  const {
    store,
    storyboardsAPI,
    sbDuration,
    videoClipDuration,
    sbTitle,
    sbLocation,
    sbTime,
    sbAction,
    sbDialogue,
    sbNarration,
    sbResult,
    sbAtmosphere,
    sbShotType,
    sbMovement,
    sbLayoutDescription,
    sbUniversalSegmentText,
    generatingUniversalSegmentIds,
    storyboardUniversalOmni,
    universalOmniPolishRunning,
    universalOmniPolishProgress,
    editingSbImagePromptId,
    editingSbImagePromptText,
    editingSbVideoPromptId,
    editingSbVideoPromptText,
    showSbPromptDialog,
    sbPromptTarget,
    sbPromptImageText,
    sbPromptPolishedText,
    sbPromptVideoText,
    sbPromptPolishing,
    sbPromptSaving,
    getRefValue = (source, fallback = undefined) => source?.value ?? source ?? fallback,
    getRefMap = () => ({}),
    setRefMapValue = () => {},
    patchCurrentStoryboardRow = () => {},
    isSbUniversalMode = () => false,
    sbUniversalSegmentTrimmed = () => '',
    pipelineRest = async () => {},
    loadDrama = async () => {},
  } = options

  async function onSaveUniversalSegmentField(sb) {
    if (!sb?.id) return
    const next = (getRefMap(sbUniversalSegmentText)[sb.id] || '').toString()
    const prev = (sb.universal_segment_text || '').toString()
    if (next === prev) return
    try {
      const value = next.trim() || null
      await storyboardsAPI.update(sb.id, { universal_segment_text: value })
      patchCurrentStoryboardRow(sb.id, { universal_segment_text: value })
    } catch (_) { /* 输入保存失败时不打断编辑 */ }
  }

  function universalSegmentDurationSecForSb(sb) {
    const dUi = Number(getRefMap(sbDuration)[sb?.id])
    const dRow = Number(sb?.duration)
    const dProj = Number(getRefValue(videoClipDuration, 0))
    return Number.isFinite(dUi) && dUi > 0
      ? dUi
      : Number.isFinite(dRow) && dRow > 0
        ? dRow
        : Number.isFinite(dProj) && dProj > 0
          ? dProj
          : 5
  }

  function getSbVideoDurationForApi(sb) {
    const perSb = Number(getRefMap(sbDuration)[sb?.id] ?? sb?.duration)
    if (Number.isFinite(perSb) && perSb > 0) return perSb
    const clip = Number(getRefValue(videoClipDuration, 0))
    if (Number.isFinite(clip) && clip > 0) return clip
    return undefined
  }

  function buildUniversalSegmentFieldOverrides(sb) {
    if (!sb?.id) return {}
    const id = sb.id
    const trimOrNull = (v) => {
      const s = (v ?? '').toString().trim()
      return s || null
    }
    return {
      title: trimOrNull(getRefMap(sbTitle)[id] ?? sb.title),
      description: trimOrNull(sb.description),
      location: trimOrNull(getRefMap(sbLocation)[id] ?? sb.location),
      time: trimOrNull(getRefMap(sbTime)[id] ?? sb.time),
      action: trimOrNull(getRefMap(sbAction)[id] ?? sb.action),
      dialogue: trimOrNull(getRefMap(sbDialogue)[id] ?? sb.dialogue),
      narration: trimOrNull(getRefMap(sbNarration)[id] ?? sb.narration),
      result: trimOrNull(getRefMap(sbResult)[id] ?? sb.result),
      atmosphere: trimOrNull(getRefMap(sbAtmosphere)[id] ?? sb.atmosphere),
      shot_type: trimOrNull(getRefMap(sbShotType)[id] ?? sb.shot_type),
      movement: trimOrNull(getRefMap(sbMovement)[id] ?? sb.movement),
      layout_description: trimOrNull(getRefMap(sbLayoutDescription)[id] ?? sb.layout_description),
    }
  }

  function onUniversalSegmentToGrokVideoTags(sb) {
    if (!sb?.id) return
    const raw = (getRefMap(sbUniversalSegmentText)[sb.id] ?? '').toString()
    if (!raw.trim()) {
      ElMessage.warning('请先填写或生成片段描述')
      return
    }
    const next = raw.replace(/@图片(\d+)/g, '<IMAGE_$1>')
    if (next === raw) {
      ElMessage.info('未找到 @图片N 标记，无需转换')
      return
    }
    setRefMapValue(sbUniversalSegmentText, sb.id, next)
    void onSaveUniversalSegmentField(sb)
    ElMessage.success('已改为 Grok 视频占位符格式（<IMAGE_N>）')
  }

  function onUniversalSegmentPromptMenu(sb, cmd) {
    if (cmd === 'generate') onGenerateUniversalSegmentPrompt(sb, {})
    else if (cmd === 'generate-force') onGenerateUniversalSegmentPrompt(sb, { forceWithoutReferenceImages: true })
    else if (cmd === 'polish') onPolishUniversalSegmentPromptStream(sb, {})
    else if (cmd === 'polish-force') onPolishUniversalSegmentPromptStream(sb, { forceWithoutReferenceImages: true })
    else if (cmd === 'to-grok-video-tags') onUniversalSegmentToGrokVideoTags(sb)
  }

  async function onGenerateUniversalSegmentPrompt(sb, opts = {}) {
    if (!sb?.id || generatingUniversalSegmentIds.has(sb.id)) return
    const force = !!opts.forceWithoutReferenceImages
    generatingUniversalSegmentIds.add(sb.id)
    let live = ''
    try {
      const data = await storyboardsAPI.generateUniversalSegmentPromptStream(
        sb.id,
        {
          duration: universalSegmentDurationSecForSb(sb),
          field_overrides: buildUniversalSegmentFieldOverrides(sb),
          ...(force ? { force_without_reference_images: true } : {}),
        },
        (delta) => {
          live += delta
          setRefMapValue(sbUniversalSegmentText, sb.id, live)
        }
      )
      const text = (data?.universal_segment_text ?? '').toString().trim()
      if (!text) {
        ElMessage.warning('未收到完整生成结果，请重试')
        return
      }
      setRefMapValue(sbUniversalSegmentText, sb.id, text)
      patchCurrentStoryboardRow(sb.id, { universal_segment_text: text })
      ElMessage.success(force ? '已强制生成全能片段提示词（无图模式）' : '已根据分镜生成全能片段提示词')
    } catch (e) {
      ElMessage.error(e.message || '生成失败，请检查文本模型配置')
    } finally {
      generatingUniversalSegmentIds.delete(sb.id)
    }
  }

  async function onPolishUniversalSegmentPromptStream(sb, opts = {}) {
    if (!sb?.id || generatingUniversalSegmentIds.has(sb.id)) return
    const force = !!opts.forceWithoutReferenceImages
    const draft = sbUniversalSegmentTrimmed(sb)
    if (!draft) {
      ElMessage.warning('请先填写或生成片段描述后再润色')
      return
    }
    generatingUniversalSegmentIds.add(sb.id)
    let live = ''
    try {
      const data = await storyboardsAPI.polishUniversalSegmentPromptStream(
        sb.id,
        {
          duration: universalSegmentDurationSecForSb(sb),
          draft_universal_segment_text: draft,
          field_overrides: buildUniversalSegmentFieldOverrides(sb),
          ...(force ? { force_without_reference_images: true } : {}),
        },
        (delta) => {
          live += delta
          setRefMapValue(sbUniversalSegmentText, sb.id, live)
        }
      )
      const text = (data?.universal_segment_text ?? '').toString().trim()
      if (!text) {
        ElMessage.warning('未收到完整润色结果，请重试')
        return
      }
      setRefMapValue(sbUniversalSegmentText, sb.id, text)
      patchCurrentStoryboardRow(sb.id, { universal_segment_text: text })
      ElMessage.success(force ? '全能片段已强制润色并保存（无图模式）' : '全能片段提示词已润色并保存')
    } catch (e) {
      ElMessage.error(e.message || '润色失败，请检查文本模型配置')
    } finally {
      generatingUniversalSegmentIds.delete(sb.id)
    }
  }

  async function polishUniversalSegmentsAfterGeneration(opts = {}) {
    const checkPause = typeof opts.checkPause === 'function' ? opts.checkPause : async () => {}
    const onShotProgress = typeof opts.onShotProgress === 'function' ? opts.onShotProgress : null
    const onShotError = typeof opts.onShotError === 'function' ? opts.onShotError : null
    if (!getRefValue(storyboardUniversalOmni, false)) return { polished: 0, skipped: true }

    const list = (store.currentEpisode?.storyboards || [])
      .slice()
      .sort((a, b) => (Number(a.storyboard_number) || 0) - (Number(b.storyboard_number) || 0))
    const targets = list.filter((sb) => sb?.id && isSbUniversalMode(sb.id) && sbUniversalSegmentTrimmed(sb))
    if (!targets.length) return { polished: 0, skipped: true }

    universalOmniPolishRunning.value = true
    universalOmniPolishProgress.value = { current: 0, total: targets.length, label: '' }
    let polished = 0
    try {
      for (let i = 0; i < targets.length; i++) {
        await checkPause()
        const sb = targets[i]
        const cur = i + 1
        const label = '#' + (sb.storyboard_number ?? cur) + (sb.title ? ' ' + String(sb.title).slice(0, 20) : '')
        universalOmniPolishProgress.value = { current: cur, total: targets.length, label }
        if (onShotProgress) onShotProgress(cur, targets.length, sb)

        const draft = sbUniversalSegmentTrimmed(sb)
        if (!draft) continue

        generatingUniversalSegmentIds.add(sb.id)
        let live = ''
        try {
          const data = await storyboardsAPI.polishUniversalSegmentPromptStream(
            sb.id,
            {
              duration: universalSegmentDurationSecForSb(sb),
              draft_universal_segment_text: draft,
              field_overrides: buildUniversalSegmentFieldOverrides(sb),
              force_without_reference_images: true,
            },
            (delta) => {
              live += delta
              setRefMapValue(sbUniversalSegmentText, sb.id, live)
            }
          )
          const text = (data?.universal_segment_text ?? '').toString().trim()
          if (text) {
            polished += 1
            setRefMapValue(sbUniversalSegmentText, sb.id, text)
            patchCurrentStoryboardRow(sb.id, { universal_segment_text: text })
          }
        } catch (e) {
          const msg = e?.message || String(e)
          if (onShotError) onShotError(sb, msg)
          else ElMessage.warning(`分镜 #${sb.storyboard_number ?? sb.id} 全能润色失败：${msg}`)
        } finally {
          generatingUniversalSegmentIds.delete(sb.id)
        }
        await pipelineRest()
      }
    } finally {
      universalOmniPolishRunning.value = false
      universalOmniPolishProgress.value = { current: 0, total: 0, label: '' }
    }
    return { polished, skipped: false }
  }

  function onEditSbImagePrompt(sb) {
    if (!sb?.id) return
    editingSbImagePromptId.value = sb.id
    editingSbImagePromptText.value = (sb.image_prompt || '').toString()
  }

  async function onOpenSbPromptDialog(sb) {
    if (!sb?.id) return
    sbPromptTarget.value = sb
    sbPromptImageText.value = (sb.image_prompt || '').toString()
    sbPromptPolishedText.value = (sb.polished_prompt || '').toString()
    sbPromptVideoText.value = formatVideoPromptForEdit((sb.video_prompt || '').toString())
    showSbPromptDialog.value = true
    try {
      const fresh = await storyboardsAPI.get(sb.id)
      if (fresh?.id) {
        sbPromptTarget.value = fresh
        sbPromptImageText.value = (fresh.image_prompt || '').toString()
        sbPromptPolishedText.value = (fresh.polished_prompt || '').toString()
        sbPromptVideoText.value = formatVideoPromptForEdit((fresh.video_prompt || '').toString())
      }
    } catch (_) {}
  }

  function formatVideoPromptForEdit(text) {
    if (!text) return ''
    return text
      .replace(/([。；])\s*(主体|运动|环境|运镜|美学|声音|时长)：/g, '$1\n$2：')
      .replace(/^\s+|\s+$/g, '')
  }

  async function onPolishSbPrompt() {
    const sb = sbPromptTarget.value
    if (!sb?.id) return
    sbPromptPolishing.value = true
    try {
      const res = await storyboardsAPI.polishPrompt(sb.id)
      if (res?.polished_prompt) {
        sbPromptPolishedText.value = res.polished_prompt
        ElMessage.success('通用优化提示词已生成')
      }
    } catch (e) {
      ElMessage.error(e.message || '生成失败，请检查文本模型配置')
    } finally {
      sbPromptPolishing.value = false
    }
  }

  async function onSaveSbPromptDialog() {
    const sb = sbPromptTarget.value
    if (!sb?.id) return
    sbPromptSaving.value = true
    try {
      const normalizedVideo = (sbPromptVideoText.value || '').replace(/\s+/g, ' ').trim()
      await storyboardsAPI.update(sb.id, {
        image_prompt: sbPromptImageText.value.trim() || null,
        polished_prompt: sbPromptPolishedText.value.trim() || null,
        video_prompt: normalizedVideo || null,
      })
      await loadDrama()
      showSbPromptDialog.value = false
      ElMessage.success('提示词已保存')
    } catch (e) {
      ElMessage.error(e.message || '保存失败')
    } finally {
      sbPromptSaving.value = false
    }
  }

  async function onSaveSbImagePrompt(sb) {
    if (!sb?.id) return
    try {
      await storyboardsAPI.update(sb.id, { image_prompt: (editingSbImagePromptText.value || '').toString().trim() || null })
      await loadDrama()
      editingSbImagePromptId.value = null
      ElMessage.success('图片提示词已保存')
    } catch (e) {
      ElMessage.error(e.message || '保存失败')
    }
  }

  function onEditSbVideoPrompt(sb) {
    if (!sb?.id) return
    editingSbVideoPromptId.value = sb.id
    editingSbVideoPromptText.value = (sb.video_prompt || '').toString()
  }

  async function onSaveSbVideoPrompt(sb) {
    if (!sb?.id) return
    try {
      await storyboardsAPI.update(sb.id, { video_prompt: (editingSbVideoPromptText.value || '').toString().trim() || null })
      await loadDrama()
      editingSbVideoPromptId.value = null
      ElMessage.success('视频提示词已保存')
    } catch (e) {
      ElMessage.error(e.message || '保存失败')
    }
  }

  return {
    buildUniversalSegmentFieldOverrides,
    getSbVideoDurationForApi,
    onEditSbImagePrompt,
    onEditSbVideoPrompt,
    onGenerateUniversalSegmentPrompt,
    onOpenSbPromptDialog,
    onPolishSbPrompt,
    onPolishUniversalSegmentPromptStream,
    onSaveSbImagePrompt,
    onSaveSbPromptDialog,
    onSaveSbVideoPrompt,
    onSaveUniversalSegmentField,
    onUniversalSegmentPromptMenu,
    onUniversalSegmentToGrokVideoTags,
    polishUniversalSegmentsAfterGeneration,
    universalSegmentDurationSecForSb,
  }
}
