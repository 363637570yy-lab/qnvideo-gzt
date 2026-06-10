import { ElMessage } from 'element-plus'

export function useStoryboardImageGeneration(options = {}) {
  const {
    store,
    imagesAPI,
    storyboardsAPI,
    genStore,
    genResource = {},
    sbCharacterIds,
    sbImages,
    sbSelectedImgId,
    sbSelectedLastImgId,
    generatingSbImageIds,
    generatingSbFirstImageIds,
    generatingSbLastImageIds,
    batchImageRunning,
    batchImageStopping,
    batchImageProgress,
    batchImageErrors,
    getDramaIdValue = () => null,
    getCurrentEpisodeIdValue = () => null,
    getRefValue = (source, fallback = undefined) => source?.value ?? source ?? fallback,
    getSelectedStyle = () => undefined,
    projectAspectRatio,
    effectiveStoryboardFrameCount = () => 1,
    storyboardImageAiPayload = () => ({}),
    pipelineRunning,
    pipelineConcurrency,
    runConcurrently = async (items, _limit, worker) => {
      for (const item of items) await worker(item)
    },
    pollTask = async () => null,
    pollTaskWithPause = async () => null,
    loadDrama = async () => {},
    buildSbGenMeta = () => ({}),
    imageReferenceUrlForApi = () => '',
    getStoryboardAssetReferenceImages = () => [],
    getSbStoryboardReferenceImages = () => [],
    confirmAdminProjectOperation = async () => true,
    isFirstLastFrameMode = () => false,
    ensureProfessionalFramePrompt = async () => '',
    buildLastFrameImagePrompt = () => '',
    frameTypeForSlot = () => 'storyboard_keyframe',
    buildKeyframeParamsJson = () => ({}),
    getSbFirstImage = () => null,
    hasSbImage = () => false,
    auxRoleFrameType = () => 'storyboard_aux',
    auxRoleLabel = () => '',
    assetImageUrl = () => '',
    loadSingleStoryboardMedia = async () => {},
    loadStoryboardMedia = async () => {},
    restoreSelectionsFromBackend = () => {},
  } = options

  function projectAspectRatioValue() {
    return projectAspectRatio?.value || projectAspectRatio || '16:9'
  }

  function isLastFrameLayoutLockEnabled() {
    return !!(options.lastFrameUseFirstLayoutLock?.value ?? options.lastFrameUseFirstLayoutLock)
  }

  function buildAuxPrompt(storyboard, role) {
    const roleLabel = auxRoleLabel(role) || '辅助参考'
    const base = storyboard.polished_prompt || storyboard.image_prompt || storyboard.description || ''
    const confirmed = getSbStoryboardReferenceImages(storyboard, { includeAux: false, fallbackMain: true })
    return [
      `基于当前分镜已确认关键帧生成「${roleLabel}」。`,
      role === 'motion_sketch' ? '输出清晰的运动线稿，只表达人物动作方向、镜头运动路径和关键位移，不继承彩色成片风格。' : '',
      role === 'layout_sketch' ? '输出构图草图，强调主体位置、前中后景、视线方向和画面重心，不追求成片细节。' : '',
      role === 'pose_ref' ? '输出姿态参考，强调角色肢体动作、重心、手势与动态张力。' : '',
      role === 'camera_path' ? '输出镜头路径参考，表达推拉摇移、视角变化和运动轨迹。' : '',
      role === 'aux_ref' ? '输出辅助参考图，只服务于视频生成的运动/构图理解，不改变角色身份和场景设定。' : '',
      confirmed.length ? `已确认关键帧数量：${confirmed.length}` : '',
      base,
    ].filter(Boolean).join('\n')
  }

  async function onGenerateStoryboardAux(storyboard, role) {
    const dramaIdValue = getDramaIdValue()
    if (!storyboard?.id || !dramaIdValue) return
    generatingSbImageIds.add(storyboard.id)
    try {
      const refs = [
        ...getSbStoryboardReferenceImages(storyboard, { includeAux: false, fallbackMain: true }).map(imageReferenceUrlForApi),
        ...getStoryboardAssetReferenceImages(storyboard.id),
      ].filter(Boolean)
      const result = await createStoryboardImageTasks(storyboard, {
        prompt: buildAuxPrompt(storyboard, role),
        frameType: auxRoleFrameType(role),
        batchId: createStoryboardImageBatchId(storyboard.id, 'aux'),
        slotIndex: 0,
        batchCount: 1,
        referenceImages: refs,
        auxRole: role,
        selected: false,
        paramsJson: { aux_role: role, source: 'confirmed_keyframes' },
      })
      if (result.failed > 0) throw new Error(result.error || '辅助稿生成失败')
      ElMessage.success(`${auxRoleLabel(role)}已生成`)
      await loadSingleStoryboardMedia(storyboard.id)
    } catch (error) {
      ElMessage.error(error.message || '辅助稿生成失败')
    } finally {
      generatingSbImageIds.delete(storyboard.id)
    }
  }

  async function submitSbFrameImageTask(storyboard, slot, {
    dramaIdValue = getDramaIdValue(),
    style = getSelectedStyle(),
    meta = {},
    pollWithPause = false,
    onSubmitted = null,
  } = {}) {
    const isLast = slot === 'last'
    let idsToSave = sbCharacterIds.value[storyboard.id]
    if (idsToSave === undefined) {
      const row = (store?.storyboards || []).find((item) => item.id === storyboard.id)
      const charList = Array.isArray(row?.characters) ? row.characters : []
      idsToSave = charList
        .map((character) => Number(typeof character === 'object' && character != null ? character.id : character))
        .filter((id) => Number.isFinite(id))
    }
    const row = (store?.storyboards || []).find((item) => item.id === storyboard.id)
    let prompt = ''
    if (isFirstLastFrameMode()) {
      prompt = await ensureProfessionalFramePrompt(storyboard, isLast ? 'last' : 'first')
    } else if (isLast) {
      prompt = buildLastFrameImagePrompt(storyboard.id) || row?.image_prompt || row?.description || ''
    } else {
      prompt = row?.polished_prompt || row?.image_prompt || row?.description || ''
    }
    await storyboardsAPI.update(storyboard.id, { character_ids: Array.isArray(idsToSave) ? idsToSave : [] })

    let referenceImagesForCreate = undefined
    const useFirstLayoutLock = isLast && isLastFrameLayoutLockEnabled()
    if (useFirstLayoutLock) {
      const firstImg = getSbFirstImage(storyboard.id)
      if (firstImg) {
        const firstUrl = assetImageUrl(firstImg) || firstImg.image_url || firstImg.local_path
        if (firstUrl) referenceImagesForCreate = [firstUrl]
      }
    }

    const res = await imagesAPI.create({
      storyboard_id: storyboard.id,
      drama_id: dramaIdValue,
      prompt,
      model: undefined,
      style,
      frame_type: frameTypeForSlot(slot),
      batch_id: createStoryboardImageBatchId(storyboard.id, 'fl'),
      slot_index: isLast ? 1 : 0,
      batch_count: 2,
      selected: true,
      params_json: buildKeyframeParamsJson(storyboard, isLast ? 1 : 0, 2, null, frameTypeForSlot(slot)),
      aspect_ratio: projectAspectRatioValue(),
      reference_images: referenceImagesForCreate,
      use_first_frame_layout_lock: isLast ? isLastFrameLayoutLockEnabled() : undefined,
      ...storyboardImageAiPayload(),
    })
    if (typeof onSubmitted === 'function') onSubmitted(res)

    const onDone = () => loadSingleStoryboardMedia(storyboard.id)
    if (res?.task_id) {
      if (pollWithPause) {
        const result = await pollTaskWithPause(res.task_id, onDone)
        if (result?.paused) return { paused: true, failed: 0 }
        if (result?.error) throw new Error(result.error)
      } else {
        const pollRes = await pollTask(res.task_id, onDone, meta)
        if (pollRes?.status === 'failed') throw new Error(pollRes.error || '生成失败')
      }
    } else {
      await loadSingleStoryboardMedia(storyboard.id)
    }

    if (isFirstLastFrameMode()) {
      if (isLast) delete sbSelectedLastImgId.value[storyboard.id]
      else delete sbSelectedImgId.value[storyboard.id]
    }
    return { paused: false, failed: 0 }
  }

  async function onGenerateSbFrameImage(storyboard, slot) {
    const dramaIdValue = getDramaIdValue()
    if (!dramaIdValue || !storyboard?.id) return
    if (!(await confirmAdminProjectOperation(slot === 'last' ? '生成尾帧' : '生成首帧'))) return
    const isLast = slot === 'last'
    const loadingSet = isLast ? generatingSbLastImageIds : generatingSbFirstImageIds
    const meta = buildSbGenMeta(
      storyboard,
      isLast ? genResource.SB_LAST_IMAGE : genResource.SB_FIRST_IMAGE,
      isLast ? '尾帧' : '首帧'
    )
    storyboard.errorMsg = ''
    storyboard.error_msg = ''
    loadingSet.add(storyboard.id)
    genStore?.markRunning?.(meta)
    try {
      await submitSbFrameImageTask(storyboard, slot, {
        dramaIdValue,
        style: getSelectedStyle(),
        meta,
        onSubmitted: () => ElMessage.success(isLast ? '尾帧生成任务已提交' : '首帧生成任务已提交'),
      })
      await loadDrama()
      restoreSelectionsFromBackend()
      genStore?.markDone?.(meta)
    } catch (error) {
      storyboard.errorMsg = error.message || '生成失败'
      genStore?.markFailed?.(meta, error.message || '生成失败')
      ElMessage.error(error.message || '生成失败')
    } finally {
      loadingSet.delete(storyboard.id)
    }
  }

  async function onGenerateSbFramePair(storyboard) {
    const hasFirst = !!(getSbFirstImage(storyboard.id) || (storyboard.image_url || storyboard.composed_image))
    if (!hasFirst) {
      await onGenerateSbFrameImage(storyboard, 'first')
      if (!getSbFirstImage(storyboard.id) && !(storyboard.image_url || storyboard.composed_image)) return
    }
    await onGenerateSbFrameImage(storyboard, 'last')
  }

  function buildStoryboardKeyframePrompt(basePrompt, index, count) {
    const body = (basePrompt || '').toString().trim()
    if (count <= 1) return body
    const positionHint = index === 0
      ? '开场关键帧，承接本分镜动作开始状态'
      : index === count - 1
        ? '收束关键帧，承接前一张并展示动作结束状态'
        : '中间过渡关键帧，承上启下，保持动作方向与画面连贯'
    return [
      `这是同一条分镜的连续关键帧组，请生成第 ${index + 1}/${count} 张独立完整画面。`,
      positionHint,
      '保持角色身份、服装、场景、道具、光影和画风连续；不要生成拼图、分屏、宫格或多画面并列。',
      body,
    ].filter(Boolean).join('\n')
  }

  function createStoryboardImageBatchId(storyboardId, kind = 'kf') {
    const rand = Math.random().toString(36).slice(2, 8)
    return `${kind}-${storyboardId}-${Date.now()}-${rand}`
  }

  async function createStoryboardImageTasks(storyboard, {
    prompt,
    frameType = undefined,
    dramaIdValue = getDramaIdValue(),
    model = undefined,
    style = getSelectedStyle(),
    meta = {},
    pollWithPause = false,
    batchId = null,
    slotIndex = null,
    batchCount = null,
    referenceImages = null,
    auxRole = null,
    paramsJson = null,
    selected = null,
  } = {}) {
    const resolvedFrameType = frameType || 'storyboard_keyframe'
    const count = batchCount || effectiveStoryboardFrameCount(frameType)
    const indexes = slotIndex != null ? [Number(slotIndex)] : Array.from({ length: count }, (_, index) => index)
    const resolvedBatchId = batchId || createStoryboardImageBatchId(storyboard.id, auxRole ? 'aux' : 'kf')
    let failed = 0
    let paused = false
    let lastError = ''

    await runConcurrently(indexes, Math.min(3, count), async (index) => {
      try {
        const frameParamsJson = buildKeyframeParamsJson(storyboard, index, count, paramsJson, resolvedFrameType)
        const res = await imagesAPI.create({
          storyboard_id: storyboard.id,
          drama_id: dramaIdValue,
          prompt: buildStoryboardKeyframePrompt(prompt, index, count),
          model,
          style,
          frame_type: resolvedFrameType,
          batch_id: resolvedBatchId,
          slot_index: index,
          batch_count: count,
          selected: selected == null ? count === 1 : !!selected,
          aux_role: auxRole || undefined,
          reference_images: Array.isArray(referenceImages) ? referenceImages : undefined,
          params_json: Object.keys(frameParamsJson || {}).length ? frameParamsJson : undefined,
          aspect_ratio: projectAspectRatioValue(),
          ...storyboardImageAiPayload(),
        })
        if (res?.task_id) {
          const onDone = () => loadSingleStoryboardMedia(storyboard.id)
          if (pollWithPause) {
            const result = await pollTaskWithPause(res.task_id, onDone)
            if (result?.paused) {
              paused = true
              return { paused: true }
            }
            if (result?.error) throw new Error(result.error)
          } else {
            const pollRes = await pollTask(res.task_id, onDone, meta)
            if (pollRes?.status === 'failed') throw new Error(pollRes.error || '生成失败')
          }
        } else {
          await loadSingleStoryboardMedia(storyboard.id)
        }
      } catch (error) {
        failed += 1
        lastError = error.message || String(error)
      }
    })

    return { count, failed, paused, error: lastError, batchId: resolvedBatchId }
  }

  async function onGenerateSbImage(storyboard) {
    const dramaIdValue = getDramaIdValue()
    if (!dramaIdValue || !storyboard?.id) return
    if (!(await confirmAdminProjectOperation('生成分镜参考图'))) return
    storyboard.errorMsg = ''
    storyboard.error_msg = ''
    const meta = buildSbGenMeta(storyboard, genResource.SB_IMAGE, '分镜图')
    generatingSbImageIds.add(storyboard.id)
    genStore?.markRunning?.(meta)
    try {
      let idsToSave = sbCharacterIds.value[storyboard.id]
      if (idsToSave === undefined) {
        const charList = Array.isArray(storyboard.characters) ? storyboard.characters : []
        idsToSave = charList
          .map((character) => Number(typeof character === 'object' && character != null ? character.id : character))
          .filter((id) => Number.isFinite(id))
      }
      try {
        await storyboardsAPI.update(storyboard.id, { character_ids: Array.isArray(idsToSave) ? idsToSave : [] })
      } catch (error) {
        console.warn('[分镜图] 保存角色勾选失败', error)
        ElMessage.warning('保存分镜角色失败，请稍后重试')
        genStore?.markFailed?.(meta, '保存分镜角色失败')
        return
      }
      const result = await createStoryboardImageTasks(storyboard, {
        prompt: storyboard.polished_prompt || storyboard.image_prompt || storyboard.description || '',
        model: undefined,
        style: getSelectedStyle(),
        meta,
      })
      ElMessage.success(`已提交 ${result.count} 张分镜关键帧生成任务`)
      if (result.failed > 0) {
        storyboard.errorMsg = result.error || `${result.failed} 张生成失败`
        genStore?.markFailed?.(meta, storyboard.errorMsg)
      } else {
        genStore?.markDone?.(meta)
        ElMessage.success(result.count > 1 ? `${result.count} 张分镜关键帧生成完成` : '分镜图生成完成')
      }
    } catch (error) {
      console.error(error)
      storyboard.errorMsg = error.message || '生成失败'
      genStore?.markFailed?.(meta, error.message || '生成失败')
      ElMessage.error(error.message || '生成失败')
    } finally {
      generatingSbImageIds.delete(storyboard.id)
    }
  }

  async function startBatchImageGeneration() {
    const episodeId = getCurrentEpisodeIdValue()
    if (!episodeId || batchImageRunning.value || getRefValue(pipelineRunning, false)) return
    if (!(await confirmAdminProjectOperation('批量生成分镜图'))) return
    batchImageErrors.value = []
    batchImageStopping.value = false
    batchImageRunning.value = true
    try {
      if (Object.keys(sbImages.value).length === 0) {
        await loadStoryboardMedia()
      }
      const boards = store?.storyboards || []
      const todo = boards.filter((storyboard) => !hasSbImage(storyboard))
      if (todo.length === 0) {
        ElMessage.info('所有分镜均已有图片，无需重新生成')
        return
      }
      batchImageProgress.value = { current: 0, total: todo.length, failed: 0 }
      const concurrency = getRefValue(pipelineConcurrency, 3) || 3
      let doneCount = 0
      let queueIndex = 0

      const worker = async () => {
        while (queueIndex < todo.length) {
          if (batchImageStopping.value) break
          const storyboard = todo[queueIndex++]
          const useFirstLast = isFirstLastFrameMode()
          try {
            if (useFirstLast) {
              await submitSbFrameImageTask(storyboard, 'first', { dramaIdValue: getDramaIdValue(), style: getSelectedStyle() })
              await submitSbFrameImageTask(storyboard, 'last', { dramaIdValue: getDramaIdValue(), style: getSelectedStyle() })
            } else {
              const result = await createStoryboardImageTasks(storyboard, {
                prompt: storyboard.polished_prompt || storyboard.image_prompt || storyboard.description || '',
                dramaIdValue: getDramaIdValue(),
                style: getSelectedStyle(),
              })
              if (result.failed > 0) {
                batchImageErrors.value.push(`#${storyboard.storyboard_number ?? storyboard.id}: ${result.error || result.failed + ' 张生成失败'}`)
                batchImageProgress.value = { ...batchImageProgress.value, failed: batchImageProgress.value.failed + 1 }
              }
            }
          } catch (error) {
            batchImageErrors.value.push(`#${storyboard.storyboard_number ?? storyboard.id}: ${error.message || '提交失败'}`)
            batchImageProgress.value = { ...batchImageProgress.value, failed: batchImageProgress.value.failed + 1 }
          }
          doneCount++
          batchImageProgress.value = { ...batchImageProgress.value, current: doneCount }
        }
      }

      await Promise.allSettled(Array.from({ length: Math.min(concurrency, todo.length) }, () => worker()))
      if (!batchImageStopping.value) {
        restoreSelectionsFromBackend()
        if (batchImageProgress.value.failed === 0) ElMessage.success(`分镜图批量生成完成（共 ${todo.length} 条）`)
        else ElMessage.warning(`批量完成，${batchImageProgress.value.failed}/${todo.length} 条失败`)
      } else {
        ElMessage.info('批量生成已停止')
      }
    } finally {
      batchImageRunning.value = false
    }
  }

  async function stopBatchImageGeneration() {
    if (!(await confirmAdminProjectOperation('停止批量生成分镜图'))) return
    batchImageStopping.value = true
  }

  return {
    buildAuxPrompt,
    buildStoryboardKeyframePrompt,
    createStoryboardImageBatchId,
    createStoryboardImageTasks,
    onGenerateStoryboardAux,
    onGenerateSbFrameImage,
    onGenerateSbFramePair,
    onGenerateSbImage,
    startBatchImageGeneration,
    stopBatchImageGeneration,
    submitSbFrameImageTask,
  }
}
