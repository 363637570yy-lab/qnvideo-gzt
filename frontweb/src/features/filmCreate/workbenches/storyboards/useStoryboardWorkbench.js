import { reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { storyboardsAPI } from '@/api/storyboards'
import { useStoryboardFieldState } from './useStoryboardFieldState'
import { useStoryboardFramePrompts } from './useStoryboardFramePrompts'
import { useStoryboardImageUpload } from './useStoryboardImageUpload'
import { storyboardAuxRoleOptions, useStoryboardMediaSelectors } from './useStoryboardMediaSelectors'
import { useStoryboardMediaLoader } from './useStoryboardMediaLoader'

export function useStoryboardWorkbench(deps = {}) {
  const {
    store,
    imagesAPI,
    videosAPI,
    uploadAPI,
    genStore,
    genResource = {},
    getDramaId = () => null,
    getCurrentEpisodeId = () => null,
    getSelectedStyle = () => undefined,
    getSelectedStylePrompt = () => '',
    getSelectedStylePromptZh = () => '',
    projectAspectRatio,
    lastFrameUseFirstLayoutLock,
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
    angleToPromptFragment = () => ({ label: '' }),
    imageReferenceUrlForApi = () => '',
    getStoryboardAssetReferenceImages = () => [],
    getSbStoryboardReferenceImages = () => [],
    videoClipDuration,
    storyboardUseFirstLastFrame,
    storyboardFrameCount,
    normalizeStoryboardFrameCount = (count) => Number(count) || 1,
    assetImageUrl = () => '',
    assetThumbUrl = () => '',
    assetVideoUrl = () => '',
    recordHasPlayableVideoUrl = () => false,
    openImagePreview = () => {},
    confirmAdminProjectOperation = async () => true,
  } = deps

  const {
    charactersAvailableToAddToSb,
    getMovementLabel,
    getSbCharacterId,
    getSbCharacterIds,
    getSbPropId,
    getSbPropIds,
    getSbSelectedCharacters,
    getSbSelectedProps,
    getSbSelectedScene,
    onSbAddCharacterCommand,
    onStoryboardCharacterChange,
    onStoryboardPropChange,
    onStoryboardSceneChange,
    sbAction,
    sbAngle,
    sbAngleH,
    sbAngleS,
    sbAngleV,
    sbAtmosphere,
    sbCharacterIds,
    sbCreationMode,
    sbDialogue,
    sbDof,
    sbDuration,
    sbLayoutDescription,
    sbLighting,
    sbLocation,
    sbMovement,
    sbNarration,
    sbPropIds,
    sbResult,
    sbSceneId,
    sbShotType,
    sbTime,
    sbTitle,
    sbUniversalSegmentText,
    setSbCharacterId,
    setSbPropId,
    syncStoryboardStateFromEpisode,
  } = useStoryboardFieldState({ store, videoClipDuration })

  const sbImages = ref({})
  const sbVideos = ref({})
  const sbVideoErrors = ref({})
  const sbSelectedImgId = ref({})
  const sbSelectedLastImgId = ref({})
  const sbSelectedVideoId = ref({})
  const sbImageUploadSlotById = ref({})

  const generatingSbImageIds = reactive(new Set())
  const generatingSbFirstImageIds = reactive(new Set())
  const generatingSbLastImageIds = reactive(new Set())
  const generatingSbVideoIds = reactive(new Set())
  const generatingUniversalSegmentIds = reactive(new Set())
  const regenSbImagesForAsset = reactive(new Set())
  const regeneratingLayoutSbIds = reactive(new Set())
  const upscalingSbIds = reactive(new Set())
  const ttsSbIds = reactive(new Set())
  const ttsSbNarrationIds = reactive(new Set())
  const linkingTailFrameIds = reactive(new Set())
  const usingPrevTailAsFirstIds = reactive(new Set())

  const regenSbImagesProgress = ref({})
  const batchImageRunning = ref(false)
  const batchImageStopping = ref(false)
  const batchImageProgress = ref({ current: 0, total: 0, failed: 0 })
  const batchImageErrors = ref([])
  const batchVideoRunning = ref(false)
  const batchVideoStopping = ref(false)
  const batchVideoProgress = ref({ current: 0, total: 0, failed: 0 })
  const batchVideoErrors = ref([])

  const inferringParams = ref(false)
  const showVideoParamsDialog = ref(false)
  const videoParamsTarget = ref(null)
  const videoParamsSaving = ref(false)
  const splitByAudioLoading = ref(false)
  const videoFrameContiguity = ref(false)

  const sbDialogueAudioPaths = ref({})
  const sbNarrationAudioPaths = ref({})
  const editingSbVideoPromptId = ref(null)
  const editingSbVideoPromptText = ref('')
  const editingSbImagePromptId = ref(null)
  const editingSbImagePromptText = ref('')
  const showSbPromptDialog = ref(false)
  const sbPromptTarget = ref(null)
  const sbPromptImageText = ref('')
  const sbPromptPolishedText = ref('')
  const sbPromptVideoText = ref('')
  const sbPromptSaving = ref(false)
  const sbPromptPolishing = ref(false)
  function defaultStoryboardDuration() {
    return Number(videoClipDuration?.value ?? videoClipDuration) || 10
  }

  function isFirstLastFrameMode() {
    return !!(storyboardUseFirstLastFrame?.value ?? storyboardUseFirstLastFrame)
  }

  function getDramaIdValue() {
    const value = typeof getDramaId === 'function' ? getDramaId() : getDramaId
    return value?.value ?? value
  }

  function getCurrentEpisodeIdValue() {
    const value = typeof getCurrentEpisodeId === 'function' ? getCurrentEpisodeId() : getCurrentEpisodeId
    return value?.value ?? value
  }

  function getRefValue(source, fallback = undefined) {
    return source?.value ?? source ?? fallback
  }

  const {
    auxRoleFrameType,
    auxRoleLabel,
    buildKeyframeParamsJson,
    canUsePrevTailAsFirst,
    compactKeyframeText,
    defaultKeyframeDescription,
    formatKeyframeSecond,
    frameTypeForSlot,
    getNextStoryboard,
    getPrevStoryboard,
    getQuadGridImage,
    getSbAllImages,
    getSbAllVideos,
    getSbFirstImage,
    getSbImage,
    getSbLastImage,
    getSbPrimaryImages,
    getSbVideo,
    getSbVideoError,
    getStripItems,
    getVideoStripItems,
    groupByStoryboardId,
    hasSbFirstLastPair,
    hasSbImage,
    isAuxStoryboardImage,
    keyframeDescriptionFromParams,
    keyframeIndexInfo,
    keyframeItemLabel,
    keyframeTimelineLine,
    keyframeTimeRange,
    parseImageParamsJson,
    parseJsonObject,
    quadPanelLabel,
    resolveSbImageById,
    sbMainVideoPlayerKey,
    stripItemTitle,
    uploadingSbImageSlot,
  } = useStoryboardMediaSelectors({
    store,
    sbImages,
    sbVideos,
    sbVideoErrors,
    sbSelectedImgId,
    sbSelectedLastImgId,
    sbSelectedVideoId,
    sbImageUploadSlotById,
    storyboardFrameCount,
    videoClipDuration,
    normalizeStoryboardFrameCount,
    isFirstLastFrameMode,
    assetImageUrl,
    assetThumbUrl,
    assetVideoUrl,
    recordHasPlayableVideoUrl,
  })

  const {
    loadSingleStoryboardMedia,
    loadStoryboardMedia,
    restoreSelectionsFromBackend,
    updateStoryboardImageMeta,
  } = useStoryboardMediaLoader({
    store,
    imagesAPI,
    videosAPI,
    sbImages,
    sbVideos,
    sbSelectedImgId,
    sbSelectedLastImgId,
    groupByStoryboardId,
    getSbAllImages,
  })

  const {
    dragOverSbId,
    doUploadSbImage,
    onSbImageDragLeave,
    onSbImageDragOver,
    onSbImageDrop,
    onSbImageFileChange,
    onUploadSbImageClick,
    sbImageFileInput,
    sbImageUploadForId,
    uploadingSbImageId,
  } = useStoryboardImageUpload({
    store,
    imagesAPI,
    uploadAPI,
    sbImageUploadSlotById,
    sbSelectedImgId,
    getDramaIdValue,
    isFirstLastFrameMode,
    frameTypeForSlot,
    confirmAdminProjectOperation,
    loadSingleStoryboardMedia,
    restoreSelectionsFromBackend,
    onSelectSbFrameImage,
  })

  const {
    buildFirstFrameImagePrompt,
    buildLastFrameImagePrompt,
    editingFramePromptRegenerating,
    editingFramePromptSaving,
    editingFramePromptSb,
    editingFramePromptSlot,
    editingFramePromptText,
    ensureProfessionalFramePrompt,
    openFramePromptEditor,
    regenerateEditingFramePrompt,
    saveEditingFramePrompt,
    showFramePromptEditor,
    showSbFramePromptPreview,
  } = useStoryboardFramePrompts({
    store,
    storyboardsAPI,
    pollTask,
    sbLocation,
    sbTime,
    sbShotType,
    sbAngleH,
    sbAngleV,
    sbAngleS,
    sbResult,
    sbAction,
    sbAtmosphere,
    angleToPromptFragment,
    getSelectedStylePrompt,
    getSelectedStylePromptZh,
  })

  async function onEditKeyframeDescription(storyboard, item) {
    if (!storyboard?.id || !item?.img || item.aux) return
    const current = keyframeTimelineLine(storyboard, item.img)
    let value = ''
    try {
      const result = await ElMessageBox.prompt(
        '这段文字会随关键帧一起进入视频提示词，用来补充时间轴、动作承接和剪辑意图。',
        '编辑关键帧描述',
        {
          confirmButtonText: '保存',
          cancelButtonText: '取消',
          inputType: 'textarea',
          inputValue: current,
          inputPlaceholder: '例如：0-5秒 首帧：角色站在门口迟疑，镜头缓慢推近，右侧留出进入空间',
        }
      )
      value = (result?.value || '').toString().trim()
    } catch {
      return
    }
    const params = parseImageParamsJson(item.img)
    const nextParams = {
      ...params,
      keyframe_description: value || defaultKeyframeDescription(storyboard, item.img),
      keyframe_description_updated_at: new Date().toISOString(),
    }
    try {
      await updateStoryboardImageMeta(storyboard.id, item.img, { params_json: nextParams })
      ElMessage.success('关键帧描述已保存')
    } catch (error) {
      ElMessage.error(error.message || '保存失败')
    }
  }

  async function onToggleKeyframeLocked(storyboard, item) {
    if (!storyboard?.id || !item?.img) return
    try {
      await updateStoryboardImageMeta(storyboard.id, item.img, { locked: !item.img.locked })
      ElMessage.success(item.img.locked ? '已解锁' : '已锁定')
    } catch (error) {
      ElMessage.error(error.message || '操作失败')
    }
  }

  async function onToggleKeyframeSelected(storyboard, item) {
    if (!storyboard?.id || !item?.img) return
    if (item.aux || isAuxStoryboardImage(item.img)) {
      ElMessage.info('辅助稿只作为视频参考，不设为主图')
      return
    }
    try {
      const next = !item.img.selected
      await updateStoryboardImageMeta(storyboard.id, item.img, { selected: next })
      if (next) sbSelectedImgId.value = { ...sbSelectedImgId.value, [storyboard.id]: item.img.id }
      ElMessage.success(next ? '已确认该格' : '已取消确认')
    } catch (error) {
      ElMessage.error(error.message || '操作失败')
    }
  }

  async function onStripItemClick(storyboard, item) {
    if (item?.aux || isAuxStoryboardImage(item?.img)) {
      openImagePreview(item.src)
      return
    }
    if (!isFirstLastFrameMode()) {
      onSelectStripItem(storyboard, item)
      return
    }
    try {
      await ElMessageBox.confirm('将此图绑定到哪个槽位？', '设置参考帧', {
        confirmButtonText: '设为首帧',
        cancelButtonText: '设为尾帧',
        distinguishCancelAndClose: true,
        type: 'info',
      })
      onSelectSbFrameImage(storyboard, item.img, 'first')
      ElMessage.success('已设为首帧')
    } catch (action) {
      if (action === 'cancel') {
        onSelectSbFrameImage(storyboard, item.img, 'last')
        ElMessage.success('已设为尾帧')
      }
    }
  }

  function onSelectStripItem(storyboard, item) {
    if (item?.aux || isAuxStoryboardImage(item?.img)) {
      openImagePreview(item.src)
      return
    }
    onSelectSbMainImage(storyboard, item.img)
  }

  function onSelectSbFrameImage(storyboard, image, slot) {
    if (!storyboard?.id || !image) return
    const isLast = slot === 'last'

    if (isLast) {
      sbSelectedLastImgId.value = { ...sbSelectedLastImgId.value, [storyboard.id]: image.id }
    } else {
      sbSelectedImgId.value = { ...sbSelectedImgId.value, [storyboard.id]: image.id }
    }

    const list = store?.currentEpisode?.storyboards
    if (Array.isArray(list)) {
      const row = list.find((item) => Number(item.id) === Number(storyboard.id))
      if (row) {
        const now = new Date().toISOString()
        if (isLast) {
          row.last_frame_image_id = image.id
          row.last_frame_image_url = image.image_url || null
          row.last_frame_local_path = image.local_path || null
        } else {
          row.first_frame_image_id = image.id
          row.image_url = image.image_url || null
          row.local_path = image.local_path || null
        }
        row.updated_at = now
      }
    }

    const patch = { updated_at: new Date().toISOString() }
    if (isLast) {
      patch.last_frame_image_id = image.id
      patch.last_frame_image_url = image.image_url || null
      patch.last_frame_local_path = image.local_path || undefined
    } else {
      patch.image_url = image.image_url || null
      patch.local_path = image.local_path || undefined
      patch.first_frame_image_id = image.id
    }

    storyboardsAPI.update(storyboard.id, patch).catch((error) => console.warn('[参考帧] 保存失败', error))
  }

  function onSelectSbMainImage(storyboard, image) {
    onSelectSbFrameImage(storyboard, image, 'first')
  }

  async function onRemoveSbHistoryImage(storyboardId, imageGenId) {
    if (!storyboardId || !imageGenId) return
    if (!(await confirmAdminProjectOperation('删除历史参考图'))) return
    try {
      await ElMessageBox.confirm('确定删除这张历史参考图？此操作不可恢复。', '删除历史图', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
        distinguishCancelAndClose: true,
      })
      await imagesAPI.delete(imageGenId)
      await loadSingleStoryboardMedia(storyboardId)
      ElMessage.success('历史图已删除')
    } catch (error) {
      if (error !== 'cancel' && error !== 'close') {
        ElMessage.error(error?.message || '删除失败')
      }
    }
  }

  function getNeighborKeyframeRefs(storyboardId, image) {
    const all = getSbAllImages(storyboardId)
      .filter((item) => item.frame_type === 'storyboard_keyframe' && item.batch_id && item.batch_id === image.batch_id)
    const prev = all.find((item) => Number(item.slot_index) === Number(image.slot_index) - 1)
    const next = all.find((item) => Number(item.slot_index) === Number(image.slot_index) + 1)
    return { prev, next }
  }

  function buildRegenerateKeyframePrompt(storyboard, image, userNote = '') {
    const base = storyboard.polished_prompt || storyboard.image_prompt || storyboard.description || ''
    if (image?.aux_role) {
      return [
        `请重生成该分镜的「${auxRoleLabel(image.aux_role) || '辅助稿'}」。`,
        '保持与已确认关键帧、角色、场景、道具一致；只改进辅助表达，不改变本镜头叙事。',
        userNote ? `用户修改要求：${userNote}` : '',
        base,
      ].filter(Boolean).join('\n')
    }
    const slotText = image?.batch_count ? `第 ${Number(image.slot_index ?? 0) + 1}/${image.batch_count} 格` : '当前格'
    return [
      `请重生成同一条分镜连贯关键帧组中的${slotText}。`,
      '必须承接上一格动作状态，并自然过渡到下一格；保持角色、服装、场景、道具、光影和镜头方向连续。',
      '只修改当前格，不要生成拼图、分屏、宫格或多画面并列。',
      userNote ? `用户修改要求：${userNote}` : '',
      base,
    ].filter(Boolean).join('\n')
  }

  async function onRegenerateKeyframeItem(storyboard, item) {
    if (!storyboard?.id || !item?.img) return
    if (item.img.locked) {
      ElMessage.warning('该格已锁定，先解锁再重生')
      return
    }
    let userNote = ''
    try {
      const res = await ElMessageBox.prompt('写下这一格要调整的内容；留空则只按前后格做连贯重生。', '单格重生', {
        confirmButtonText: '开始重生',
        cancelButtonText: '取消',
        inputType: 'textarea',
        inputPlaceholder: '例如：人物表情更紧张，镜头稍微推近，手部动作更清晰',
      })
      userNote = res?.value || ''
    } catch {
      return
    }
    generatingSbImageIds.add(storyboard.id)
    try {
      const { prev, next } = getNeighborKeyframeRefs(storyboard.id, item.img)
      const refs = [
        imageReferenceUrlForApi(prev),
        imageReferenceUrlForApi(item.img),
        imageReferenceUrlForApi(next),
        ...getStoryboardAssetReferenceImages(storyboard.id),
      ].filter(Boolean)
      const result = await createStoryboardImageTasks(storyboard, {
        prompt: buildRegenerateKeyframePrompt(storyboard, item.img, userNote),
        frameType: item.img.frame_type || 'storyboard_keyframe',
        batchId: item.img.batch_id || createStoryboardImageBatchId(storyboard.id, 'kf'),
        slotIndex: Number(item.img.slot_index ?? 0),
        batchCount: Number(item.img.batch_count || storyboardFrameCount?.value || storyboardFrameCount || 1),
        referenceImages: refs,
        auxRole: item.img.aux_role || undefined,
        selected: !!item.img.selected,
        paramsJson: {
          ...parseImageParamsJson(item.img),
          keyframe_description: keyframeTimelineLine(storyboard, item.img),
          regenerate_from_image_id: item.img.id,
          user_note: userNote,
          prev_image_id: prev?.id || null,
          next_image_id: next?.id || null,
        },
      })
      if (result.failed > 0) throw new Error(result.error || '重生失败')
      if (item.img.selected) await updateStoryboardImageMeta(storyboard.id, item.img, { selected: false })
      ElMessage.success('该格已重生')
      await loadSingleStoryboardMedia(storyboard.id)
    } catch (error) {
      ElMessage.error(error.message || '重生失败')
    } finally {
      generatingSbImageIds.delete(storyboard.id)
    }
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

  function projectAspectRatioValue() {
    return projectAspectRatio?.value || projectAspectRatio || '16:9'
  }

  function isLastFrameLayoutLockEnabled() {
    return !!(lastFrameUseFirstLayoutLock?.value ?? lastFrameUseFirstLayoutLock)
  }

  async function submitSbFrameImageTask(storyboard, slot, {
    dramaIdValue = getDramaIdValue(),
    style = getSelectedStyle(),
    meta = {},
    pollWithPause = false,
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
      try {
        await storyboardsAPI.update(storyboard.id, { character_ids: Array.isArray(idsToSave) ? idsToSave : [] })
      } catch (_) {
        ElMessage.warning('保存分镜角色失败')
        genStore?.markFailed?.(meta, '保存分镜角色失败')
        return
      }

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
        style: getSelectedStyle(),
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
      ElMessage.success(isLast ? '尾帧生成任务已提交' : '首帧生成任务已提交')
      if (res?.task_id) {
        const pollRes = await pollTask(res.task_id, () => loadSingleStoryboardMedia(storyboard.id), meta)
        if (pollRes?.status === 'completed') {
          await loadDrama()
          restoreSelectionsFromBackend()
          if (isFirstLastFrameMode()) {
            if (isLast) delete sbSelectedLastImgId.value[storyboard.id]
            else delete sbSelectedImgId.value[storyboard.id]
          }
        } else if (pollRes?.status === 'failed') {
          storyboard.errorMsg = pollRes.error || '生成失败'
        }
      } else {
        await loadSingleStoryboardMedia(storyboard.id)
        restoreSelectionsFromBackend()
        genStore?.markDone?.(meta)
        if (isFirstLastFrameMode()) {
          if (isLast) delete sbSelectedLastImgId.value[storyboard.id]
          else delete sbSelectedImgId.value[storyboard.id]
        }
      }
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

  function onSelectSbMainVideo(storyboard, video) {
    sbSelectedVideoId.value = { ...sbSelectedVideoId.value, [storyboard.id]: video.id }
    storyboardsAPI.update(storyboard.id, {
      video_url: video.video_url || null,
      local_path: video.local_path || undefined,
    }).catch((error) => console.warn('[主视频] 保存后端失败', error))
  }

  return {
    batchImageErrors,
    batchImageProgress,
    batchImageRunning,
    batchImageStopping,
    batchVideoErrors,
    batchVideoProgress,
    batchVideoRunning,
    batchVideoStopping,
    charactersAvailableToAddToSb,
    canUsePrevTailAsFirst,
    dragOverSbId,
    doUploadSbImage,
    editingFramePromptRegenerating,
    editingFramePromptSaving,
    editingFramePromptSb,
    editingFramePromptSlot,
    editingFramePromptText,
    editingSbImagePromptId,
    editingSbImagePromptText,
    editingSbVideoPromptId,
    editingSbVideoPromptText,
    generatingSbFirstImageIds,
    generatingSbImageIds,
    generatingSbLastImageIds,
    generatingSbVideoIds,
    generatingUniversalSegmentIds,
    frameTypeForSlot,
    auxRoleFrameType,
    auxRoleLabel,
    buildFirstFrameImagePrompt,
    buildKeyframeParamsJson,
    buildLastFrameImagePrompt,
    buildRegenerateKeyframePrompt,
    buildStoryboardKeyframePrompt,
    compactKeyframeText,
    createStoryboardImageBatchId,
    createStoryboardImageTasks,
    defaultKeyframeDescription,
    formatKeyframeSecond,
    getMovementLabel,
    getNextStoryboard,
    getPrevStoryboard,
    getQuadGridImage,
    getStripItems,
    getSbAllImages,
    getSbAllVideos,
    getSbCharacterId,
    getSbCharacterIds,
    getSbFirstImage,
    getSbImage,
    getSbLastImage,
    getSbPrimaryImages,
    getSbPropId,
    getSbPropIds,
    getSbSelectedCharacters,
    getSbSelectedProps,
    getSbSelectedScene,
    getSbVideo,
    getSbVideoError,
    getVideoStripItems,
    keyframeDescriptionFromParams,
    keyframeIndexInfo,
    keyframeItemLabel,
    keyframeTimelineLine,
    keyframeTimeRange,
    groupByStoryboardId,
    hasSbFirstLastPair,
    hasSbImage,
    inferringParams,
    isAuxStoryboardImage,
    linkingTailFrameIds,
    regeneratingLayoutSbIds,
    regenSbImagesForAsset,
    regenSbImagesProgress,
    sbAction,
    sbAngle,
    sbAngleH,
    sbAngleS,
    sbAngleV,
    sbAtmosphere,
    sbCharacterIds,
    sbCreationMode,
    sbDialogue,
    sbDialogueAudioPaths,
    sbDof,
    sbDuration,
    sbImageFileInput,
    sbImages,
    sbImageUploadForId,
    sbImageUploadSlotById,
    sbLayoutDescription,
    sbLighting,
    sbLocation,
    sbMovement,
    sbNarration,
    sbNarrationAudioPaths,
    sbPropIds,
    sbPromptImageText,
    sbPromptPolishedText,
    sbPromptPolishing,
    sbPromptSaving,
    sbPromptTarget,
    sbPromptVideoText,
    sbResult,
    sbSceneId,
    sbSelectedImgId,
    sbSelectedLastImgId,
    sbSelectedVideoId,
    sbShotType,
    sbTime,
    sbTitle,
    sbUniversalSegmentText,
    sbVideoErrors,
    sbVideos,
    storyboardAuxRoleOptions,
    loadSingleStoryboardMedia,
    loadStoryboardMedia,
    onSbAddCharacterCommand,
    onEditKeyframeDescription,
    onRemoveSbHistoryImage,
    onSbImageDragLeave,
    onSbImageDragOver,
    onSbImageDrop,
    onSbImageFileChange,
    onGenerateSbFrameImage,
    onGenerateSbFramePair,
    onGenerateSbImage,
    onGenerateStoryboardAux,
    onRegenerateKeyframeItem,
    onSelectSbFrameImage,
    onSelectSbMainImage,
    onSelectSbMainVideo,
    onSelectStripItem,
    onStoryboardCharacterChange,
    onStoryboardPropChange,
    onStoryboardSceneChange,
    onStripItemClick,
    onToggleKeyframeLocked,
    onToggleKeyframeSelected,
    onUploadSbImageClick,
    parseImageParamsJson,
    parseJsonObject,
    quadPanelLabel,
    regenerateEditingFramePrompt,
    resolveSbImageById,
    restoreSelectionsFromBackend,
    sbMainVideoPlayerKey,
    setSbCharacterId,
    setSbPropId,
    saveEditingFramePrompt,
    showFramePromptEditor,
    showSbFramePromptPreview,
    showSbPromptDialog,
    showVideoParamsDialog,
    splitByAudioLoading,
    startBatchImageGeneration,
    stopBatchImageGeneration,
    syncStoryboardStateFromEpisode,
    ttsSbIds,
    ttsSbNarrationIds,
    updateStoryboardImageMeta,
    uploadingSbImageId,
    uploadingSbImageSlot,
    upscalingSbIds,
    usingPrevTailAsFirstIds,
    videoFrameContiguity,
    videoParamsSaving,
    videoParamsTarget,
    openFramePromptEditor,
    submitSbFrameImageTask,
  }
}
