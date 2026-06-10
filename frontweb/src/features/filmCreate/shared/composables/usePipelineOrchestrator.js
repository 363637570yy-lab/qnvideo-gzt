import { ElMessage } from 'element-plus'

export function usePipelineOrchestrator(deps = {}) {
  const {
    store,
    generationAPI,
    dramaAPI,
    propAPI,
    characterAPI,
    sceneAPI,
    videosAPI,
    dramaId,
    currentEpisodeId,
    pipelineRunning,
    pipelineCurrentStep,
    pipelineErrorLog,
    pipelineConcurrency,
    pipelineVideoConcurrency,
    storyInput,
    scriptLanguage,
    projectAspectRatio,
    videoClipDuration,
    videoResolution,
    storyboardIncludeNarration,
    storyboardUniversalOmni,
    storyboardUseFirstLastFrame,
    sbTruncatedWarning,
    sbTruncatedDismissed,
    sbVideos,
    generatingCharIds,
    generatingSceneIds,
    generatingPropIds,
    generatingSbImageIds,
    generatingSbVideoIds,
    confirmAdminProjectOperation = async () => true,
    trackFilmCreateAction = () => {},
    startPipeline = () => {},
    finishPipeline = () => {},
    addPipelineError = () => {},
    checkPause = async () => {},
    waitForResume = async () => {},
    pipelineRest = async () => {},
    setPipelineStep = () => {},
    runPipelineCountdown = async () => {},
    runConcurrently = async (items, _concurrency, worker) => {
      for (const item of items || []) await worker(item)
      return { paused: false }
    },
    pipelineWithRetry = async (_stepName, fn) => fn(),
    pollTaskWithPause = async () => null,
    pollUntilResourceHasImage = async () => {},
    loadDrama = async () => {},
    refreshAssetWorkbench = async () => loadDrama(),
    loadStoryboardMedia = async () => {},
    loadSingleStoryboardMedia = async () => {},
    refreshStoryboardsOnly = async () => {},
    polishUniversalSegmentsAfterGeneration = async () => ({}),
    getSelectedStyle = () => undefined,
    textAiPayload = () => ({}),
    imageAiPayload = () => ({}),
    videoAiPayload = () => ({}),
    workflowPresetPayload = () => ({}),
    getStoryboardCountForApi = () => undefined,
    getVideoDurationForApi = () => undefined,
    hasAssetImage = () => false,
    hasSbImage = () => false,
    recordHasPlayableVideoUrl = () => false,
    isSbUniversalMode = () => false,
    sbCanSubmitVideo = () => false,
    collectSbOmniReferenceAbsoluteUrls = () => [],
    collectSbClassicVideoReferenceAbsoluteUrls = () => [],
    getSbFirstFrameUrl = () => '',
    getMainImageUrlForVideo = async () => '',
    toAbsoluteImageUrl = (url) => url || '',
    sbVideoFirstLastUrls = () => ({}),
    buildSbVideoPromptForApi = () => '',
    getSbVideoDurationForApi = () => undefined,
    submitSbFrameImageTask = async () => ({}),
    createStoryboardImageTasks = async () => ({ failed: 0 }),
    getFinalizeMergeOptions = () => ({}),
  } = deps

  async function startOneClickPipeline() {
    if (!currentEpisodeId.value || pipelineRunning.value) return
    if (!(await confirmAdminProjectOperation('一键成片（测试中慎用！）'))) return
    trackFilmCreateAction('one_click_generate_start')
    startPipeline(10)
    try {
      await runOneClickPipeline(false)
    } finally {
      finishPipeline()
    }
  }

  async function startTextFrameworkPipeline() {
    if (!currentEpisodeId.value || pipelineRunning.value) return
    if (!(await confirmAdminProjectOperation('一键生成素材及分镜文本'))) return
    startPipeline(4)
    try {
      await runOneClickPipeline(true)
    } finally {
      finishPipeline()
    }
  }

  async function runOneClickPipeline(textOnly = false) {
    const episodeId = currentEpisodeId.value
    const dramaIdVal = dramaId.value
    if (!episodeId || !dramaIdVal) return
    const style = getSelectedStyle()

    try {
      await checkPause()
      let chars = store.currentEpisode?.characters ?? []
      if (chars.length === 0) {
        setPipelineStep(1, '提取角色...')
        try {
          const outline = (store.scriptContent || '').toString().trim() || (storyInput.value || '').toString().trim() || undefined
          const res = await generationAPI.generateCharacters(dramaIdVal, { episode_id: store.currentEpisode?.id ?? undefined, outline: outline || undefined, ...textAiPayload() })
          const taskId = res?.task_id
          if (taskId) {
            const result = await pollTaskWithPause(taskId, () => refreshAssetWorkbench('characters'))
            if (result?.paused) { await waitForResume(); return }
            if (result?.error) { addPipelineError('提取角色', result.error); return }
          } else {
            await refreshAssetWorkbench('characters')
          }
          await pipelineRest()
        } catch (e) {
          addPipelineError('提取角色', e.message || String(e))
          return
        }
        chars = store.currentEpisode?.characters ?? []
      } else {
        setPipelineStep(1, `已有 ${chars.length} 个角色，跳过提取`)
      }

      await checkPause()
      let sceneList = store.currentEpisode?.scenes ?? []
      if (sceneList.length === 0) {
        setPipelineStep(2, '提取场景...')
        try {
          const res = await dramaAPI.extractBackgrounds(episodeId, { model: undefined, style, language: scriptLanguage.value, ...textAiPayload() })
          const taskId = res?.task_id
          if (taskId) {
            const result = await pollTaskWithPause(taskId, () => refreshAssetWorkbench('scenes'))
            if (result?.paused) { await waitForResume(); return }
            if (result?.error) { addPipelineError('提取场景', result.error); return }
          } else {
            await refreshAssetWorkbench('scenes')
          }
          await pipelineRest()
        } catch (e) {
          addPipelineError('提取场景', e.message || String(e))
          return
        }
        sceneList = store.currentEpisode?.scenes ?? []
      } else {
        setPipelineStep(2, `已有 ${sceneList.length} 个场景，跳过提取`)
      }

      await checkPause()
      let propList = store.props ?? []
      if (propList.length === 0) {
        setPipelineStep(3, '提取道具...')
        try {
          const res = await propAPI.extractFromScript(episodeId, textAiPayload())
          const taskId = res?.task_id
          if (taskId) {
            const result = await pollTaskWithPause(taskId, () => refreshAssetWorkbench('props'))
            if (result?.paused) { await waitForResume(); return }
            if (result?.error) { addPipelineError('提取道具', result.error); return }
          } else {
            await refreshAssetWorkbench('props')
          }
          await pipelineRest()
        } catch (e) {
          addPipelineError('提取道具', e.message || String(e))
        }
        propList = store.props ?? []
      } else {
        setPipelineStep(3, `已有 ${propList.length} 个道具，跳过提取`)
      }

      await checkPause()
      await loadStoryboardMedia()
      let boards = store.storyboards || []
      const hadBoardsBeforeStep4 = boards.length > 0
      if (boards.length === 0) {
        setPipelineStep(4, '生成分镜脚本...')
        const sbRefreshTimer = setInterval(refreshStoryboardsOnly, 2000)
        try {
          const res = await dramaAPI.generateStoryboard(episodeId, {
            style,
            aspect_ratio: projectAspectRatio.value || '16:9',
            language: scriptLanguage.value || 'zh',
            storyboard_count: getStoryboardCountForApi(),
            video_duration: getVideoDurationForApi(),
            video_clip_duration: videoClipDuration.value || 10,
            include_narration: !!storyboardIncludeNarration.value,
            universal_omni_storyboard: !!storyboardUniversalOmni.value,
            ...textAiPayload(),
          })
          const taskId = res?.task_id ?? (typeof res === 'string' ? res : null)
          if (taskId) {
            const result = await pollTaskWithPause(taskId, () => loadDrama())
            if (result?.paused) { clearInterval(sbRefreshTimer); await waitForResume(); return }
            if (result?.error) {
              await loadDrama()
              addPipelineError('生成分镜', result.error)
              clearInterval(sbRefreshTimer)
              return
            }
            if (result?.result?.truncated) {
              sbTruncatedWarning.value = true
              sbTruncatedDismissed.value = false
            }
          }
          await loadDrama()
          await pipelineRest()
        } catch (e) {
          addPipelineError('生成分镜', e.message || String(e))
          clearInterval(sbRefreshTimer)
          return
        }
        clearInterval(sbRefreshTimer)
        await loadStoryboardMedia()
        boards = store.storyboards || []
      } else {
        setPipelineStep(4, `已有 ${boards.length} 个分镜，跳过生成`)
      }

      const generatedSbThisPipeline = !hadBoardsBeforeStep4
      if (generatedSbThisPipeline && storyboardUniversalOmni.value) {
        await checkPause()
        await polishUniversalSegmentsAfterGeneration({
          checkPause,
          onShotProgress: (cur, total, sb) =>
            setPipelineStep(
              4,
              `润色全能分镜(${cur}/${total}) #${sb.storyboard_number ?? cur} ${(sb.title || '').slice(0, 16)}`
            ),
          onShotError: (sb, msg) =>
            addPipelineError('润色全能分镜', `镜#${sb.storyboard_number ?? sb.id}: ${msg}`),
        })
        await loadDrama()
        await loadStoryboardMedia()
      }

      if (textOnly) {
        pipelineCurrentStep.value = '文本框架已就绪（未生成图片与视频）'
        ElMessage.success('文本框架已生成：角色、场景、道具与分镜脚本已就绪')
        return
      }

      await runPipelineCountdown(20, '分镜脚本生成完毕，请浏览确认内容。倒计时结束后将开始生成角色、场景、道具图片。')
      await checkPause()

      {
        const charsWithoutImage = chars.filter((c) => !hasAssetImage(c))
        const concurrency = pipelineConcurrency.value
        setPipelineStep(5, `生成角色图（${charsWithoutImage.length} 个，并发 ${concurrency}）...`)
        const { paused } = await runConcurrently(charsWithoutImage, concurrency, async (char) => {
          await checkPause()
          generatingCharIds.add(char.id)
          try {
            const stepName = '角色图 ' + (char.name || char.id)
            const ok = await pipelineWithRetry(stepName, async () => {
              const res = await characterAPI.generateImage(char.id, undefined, style, { ...imageAiPayload(), ...workflowPresetPayload('character') })
              const taskId = res?.image_generation?.task_id ?? res?.task_id
              if (taskId) {
                const result = await pollTaskWithPause(taskId, () => loadDrama())
                if (result?.paused) return { paused: true }
                if (result?.error) throw new Error(result.error)
              } else {
                await loadDrama()
                await pollUntilResourceHasImage(() => {
                  const list = store.currentEpisode?.characters ?? []
                  const c = list.find((x) => Number(x.id) === Number(char.id))
                  return !!(c && (c.image_url || c.local_path))
                })
              }
            })
            if (ok && typeof ok === 'object' && ok.paused) return { paused: true }
          } finally {
            generatingCharIds.delete(char.id)
          }
        }, { getLabel: (char) => '角色图 ' + (char.name || char.id) })
        if (paused) { await waitForResume() }
      }

      {
        const scenesWithoutImage = sceneList.filter((s) => !hasAssetImage(s))
        const concurrency = pipelineConcurrency.value
        setPipelineStep(6, `生成场景图（${scenesWithoutImage.length} 个，并发 ${concurrency}）...`)
        await checkPause()
        const { paused } = await runConcurrently(scenesWithoutImage, concurrency, async (scene) => {
          await checkPause()
          generatingSceneIds.add(scene.id)
          try {
            const stepName = '场景图 ' + (scene.location || scene.id)
            const ok = await pipelineWithRetry(stepName, async () => {
              const res = await sceneAPI.generateImage({ scene_id: scene.id, model: undefined, style, ...imageAiPayload(), ...workflowPresetPayload('scene') })
              const taskId = res?.image_generation?.task_id ?? res?.task_id
              if (taskId) {
                const result = await pollTaskWithPause(taskId, () => loadDrama())
                if (result?.paused) return { paused: true }
                if (result?.error) throw new Error(result.error)
              } else {
                await loadDrama()
                await pollUntilResourceHasImage(() => {
                  const list = store.currentEpisode?.scenes ?? []
                  const s = list.find((x) => Number(x.id) === Number(scene.id))
                  return !!(s && (s.image_url || s.local_path))
                })
              }
            })
            if (ok && typeof ok === 'object' && ok.paused) return { paused: true }
          } finally {
            generatingSceneIds.delete(scene.id)
          }
        }, { getLabel: (scene) => '场景图 ' + (scene.location || scene.id) })
        if (paused) { await waitForResume() }
      }

      {
        const propsWithoutImage = propList.filter((p) => !hasAssetImage(p))
        const concurrency = pipelineConcurrency.value
        setPipelineStep(7, `生成道具图（${propsWithoutImage.length} 个，并发 ${concurrency}）...`)
        await checkPause()
        const { paused } = await runConcurrently(propsWithoutImage, concurrency, async (prop) => {
          await checkPause()
          generatingPropIds.add(prop.id)
          try {
            const stepName = '道具图 ' + (prop.name || prop.id)
            const ok = await pipelineWithRetry(stepName, async () => {
              const res = await propAPI.generateImage(prop.id, undefined, style, { ...imageAiPayload(), ...workflowPresetPayload('prop') })
              const taskId = res?.image_generation?.task_id ?? res?.task_id
              if (taskId) {
                const result = await pollTaskWithPause(taskId, () => loadDrama())
                if (result?.paused) return { paused: true }
                if (result?.error) throw new Error(result.error)
              } else {
                await loadDrama()
                await pollUntilResourceHasImage(() => {
                  const list = store.props ?? []
                  const p = list.find((x) => Number(x.id) === Number(prop.id))
                  return !!(p && (p.image_url || p.local_path))
                })
              }
            })
            if (ok && typeof ok === 'object' && ok.paused) return { paused: true }
          } finally {
            generatingPropIds.delete(prop.id)
          }
        }, { getLabel: (prop) => '道具图 ' + (prop.name || prop.id) })
        if (paused) { await waitForResume() }
      }

      await runPipelineCountdown(30, '角色、场景、道具图片生成完毕，请浏览确认效果。倒计时结束后将开始生成分镜图（消耗较多 Token）。')
      await checkPause()

      {
        await loadStoryboardMedia()
        boards = store.storyboards || []
        const boardsWithoutImg = boards.filter((sb) => !hasSbImage(sb))
        const concurrency = pipelineConcurrency.value
        setPipelineStep(8, `生成分镜图（${boardsWithoutImg.length} 个，并发 ${concurrency}）...`)
        const { paused } = await runConcurrently(boardsWithoutImg, concurrency, async (sb) => {
          await checkPause()
          generatingSbImageIds.add(sb.id)
          try {
            const stepName = '分镜图 #' + (sb.storyboard_number ?? sb.id)
            const ok = await pipelineWithRetry(stepName, async () => {
              const useFirstLast = storyboardUseFirstLastFrame.value
              if (useFirstLast) {
                const first = await submitSbFrameImageTask(sb, 'first', { dramaIdValue: dramaIdVal, style, pollWithPause: true })
                if (first?.paused) return { paused: true }
                const last = await submitSbFrameImageTask(sb, 'last', { dramaIdValue: dramaIdVal, style, pollWithPause: true })
                if (last?.paused) return { paused: true }
                return { failed: 0 }
              }
              const result = await createStoryboardImageTasks(sb, {
                prompt: sb.polished_prompt || sb.image_prompt || sb.description || '',
                dramaIdValue: dramaIdVal,
                model: undefined,
                style,
                pollWithPause: true,
              })
              if (result?.paused) return { paused: true }
              if (result.failed > 0) throw new Error(result.error || `${result.failed} 张生成失败`)
            })
            if (ok && typeof ok === 'object' && ok.paused) return { paused: true }
          } finally {
            generatingSbImageIds.delete(sb.id)
          }
        }, { getLabel: (sb) => '分镜图 #' + (sb.storyboard_number ?? sb.id) })
        if (paused) { await waitForResume() }
      }

      await runPipelineCountdown(20, '分镜图生成完毕，请浏览确认图片效果。倒计时结束后将开始生成分镜视频（消耗最多 Token）。')
      await checkPause()

      {
        await loadStoryboardMedia()
        const boards2 = (store.storyboards || []).filter((sb) => {
          const vidList = sbVideos.value[sb.id] || []
          if (vidList.some((v) => v.status === 'completed' && recordHasPlayableVideoUrl(v))) return false
          if (isSbUniversalMode(sb.id)) {
            if (!sbCanSubmitVideo(sb)) return false
            return collectSbOmniReferenceAbsoluteUrls(sb).length > 0
          }
          return !!getSbFirstFrameUrl(sb)
        })
        const concurrency = pipelineVideoConcurrency.value
        setPipelineStep(9, `生成分镜视频（${boards2.length} 个，并发 ${concurrency}）...`)
        const { paused } = await runConcurrently(boards2, concurrency, async (sb) => {
          await checkPause()
          generatingSbVideoIds.add(sb.id)
          try {
            const stepName = '分镜视频 #' + (sb.storyboard_number ?? sb.id)
            const ok = await pipelineWithRetry(stepName, async () => {
              const universal = isSbUniversalMode(sb.id)
              const omniRefs = universal ? collectSbOmniReferenceAbsoluteUrls(sb) : []
              const firstFrameUrl = await getMainImageUrlForVideo(sb)
              const absoluteUrl = universal ? (omniRefs[0] || '') : toAbsoluteImageUrl(firstFrameUrl)
              const { first: vFirst, last: vLast } = sbVideoFirstLastUrls(sb, universal, null)
              const classicRefs = universal ? [] : collectSbClassicVideoReferenceAbsoluteUrls(sb)
              let refUrls = universal
                ? (omniRefs.length ? omniRefs : undefined)
                : (classicRefs.length ? classicRefs : (absoluteUrl ? [absoluteUrl] : undefined))
              if (!universal && vLast && refUrls && !refUrls.includes(vLast)) {
                refUrls = [...refUrls, vLast]
              }
              const res = await videosAPI.create({
                drama_id: dramaIdVal,
                storyboard_id: sb.id,
                prompt: buildSbVideoPromptForApi(sb),
                image_url: vFirst || undefined,
                first_frame_url: vFirst,
                last_frame_url: vLast,
                reference_image_urls: refUrls,
                style,
                aspect_ratio: projectAspectRatio.value || '16:9',
                resolution: videoResolution.value || undefined,
                duration: getSbVideoDurationForApi(sb),
                ...videoAiPayload(),
              })
              if (res?.task_id) {
                const result = await pollTaskWithPause(res.task_id, () => loadSingleStoryboardMedia(sb.id))
                if (result?.paused) return { paused: true }
                if (result?.error) throw new Error(result.error)
              } else await loadSingleStoryboardMedia(sb.id)
            })
            if (ok && typeof ok === 'object' && ok.paused) return { paused: true }
          } finally {
            generatingSbVideoIds.delete(sb.id)
          }
        }, { getLabel: (sb) => '分镜视频 #' + (sb.storyboard_number ?? sb.id) })
        if (paused) { await waitForResume() }
      }

      await checkPause()
      setPipelineStep(10, '合成整集视频...')
      try {
        const result = await dramaAPI.finalizeEpisode(episodeId, getFinalizeMergeOptions())
        if (result?.task_id != null) {
          const pollResult = await pollTaskWithPause(result.task_id, () => loadDrama())
          if (pollResult?.paused) { await waitForResume(); return }
          if (pollResult?.error) addPipelineError('合成整集视频', pollResult.error)
          else await pipelineRest()
        } else {
          addPipelineError('合成整集视频', result?.message || '本集没有可合成的视频片段')
        }
      } catch (e) {
        addPipelineError('合成整集视频', e.message || String(e))
      }

      pipelineCurrentStep.value = '一键生成视频流程已执行完成'
      ElMessage.success('一键生成视频流程已执行完成')
      trackFilmCreateAction('one_click_generate_complete', {
        extra: { error_count: pipelineErrorLog.value.length },
      })
    } catch (e) {
      addPipelineError('流程', e.message || String(e))
      trackFilmCreateAction('one_click_generate_failed', {
        extra: { message: String(e?.message || 'failed').slice(0, 120) },
      })
    }
  }

  async function startRepairPipeline() {
    if (!currentEpisodeId.value || pipelineRunning.value) return
    if (!(await confirmAdminProjectOperation('修复缺失内容'))) return
    startPipeline(10)
    try {
      await runRepairPipeline()
    } finally {
      finishPipeline()
    }
  }

  async function runRepairPipeline() {
    const episodeId = currentEpisodeId.value
    const dramaIdVal = dramaId.value
    if (!episodeId || !dramaIdVal) return
    const style = getSelectedStyle()

    try {
      pipelineCurrentStep.value = '正在加载数据...'
      await loadDrama()

      let chars = store.currentEpisode?.characters ?? []
      if (chars.length === 0) {
        await checkPause()
        pipelineCurrentStep.value = '正在生成角色列表...'
        try {
          const outline = (store.scriptContent || '').toString().trim() || (storyInput.value || '').toString().trim() || undefined
          const res = await generationAPI.generateCharacters(dramaIdVal, { episode_id: store.currentEpisode?.id ?? undefined, outline: outline || undefined, ...textAiPayload() })
          const taskId = res?.task_id
          if (taskId) {
            const result = await pollTaskWithPause(taskId, () => refreshAssetWorkbench('characters'))
            if (result?.paused) { await waitForResume(); return }
            if (result?.error) { addPipelineError('生成角色', result.error); return }
          } else await refreshAssetWorkbench('characters')
          await pipelineRest()
        } catch (e) {
          addPipelineError('生成角色', e.message || String(e))
          return
        }
        chars = store.currentEpisode?.characters ?? []
      }
      const charsWithoutImage = chars.filter((c) => !hasAssetImage(c))
      {
        const concurrency = pipelineConcurrency.value
        pipelineCurrentStep.value = `正在生成角色图（并发${concurrency}）...`
        const { paused } = await runConcurrently(charsWithoutImage, concurrency, async (char) => {
          await checkPause()
          const stepName = '角色图 ' + (char.name || char.id)
          const ok = await pipelineWithRetry(stepName, async () => {
            const res = await characterAPI.generateImage(char.id, undefined, style, { ...imageAiPayload(), ...workflowPresetPayload('character') })
            const taskId = res?.image_generation?.task_id ?? res?.task_id
            if (taskId) {
              const result = await pollTaskWithPause(taskId, () => loadDrama())
              if (result?.paused) return { paused: true }
              if (result?.error) throw new Error(result.error)
            } else {
              await loadDrama()
              await pollUntilResourceHasImage(() => {
                const list = store.currentEpisode?.characters ?? []
                const c = list.find((x) => Number(x.id) === Number(char.id))
                return !!(c && (c.image_url || c.local_path))
              })
            }
          })
          if (ok && typeof ok === 'object' && ok.paused) return { paused: true }
        }, { getLabel: (char) => '角色图 ' + (char.name || char.id) })
        if (paused) { await waitForResume() }
      }

      let sceneList = store.currentEpisode?.scenes ?? []
      if (sceneList.length === 0) {
        await checkPause()
        pipelineCurrentStep.value = '正在提取场景...'
        try {
          const res = await dramaAPI.extractBackgrounds(episodeId, { model: undefined, style, language: scriptLanguage.value, ...textAiPayload() })
          const taskId = res?.task_id
          if (taskId) {
            const result = await pollTaskWithPause(taskId, () => refreshAssetWorkbench('scenes'))
            if (result?.paused) { await waitForResume(); return }
            if (result?.error) { addPipelineError('提取场景', result.error); return }
          } else await refreshAssetWorkbench('scenes')
          await pipelineRest()
        } catch (e) {
          addPipelineError('提取场景', e.message || String(e))
          return
        }
        sceneList = store.currentEpisode?.scenes ?? []
      }
      const scenesWithoutImage = sceneList.filter((s) => !hasAssetImage(s))
      {
        const concurrency = pipelineConcurrency.value
        pipelineCurrentStep.value = `正在生成场景图（并发${concurrency}）...`
        const { paused } = await runConcurrently(scenesWithoutImage, concurrency, async (scene) => {
          await checkPause()
          const stepName = '场景图 ' + (scene.location || scene.id)
          const ok = await pipelineWithRetry(stepName, async () => {
            const res = await sceneAPI.generateImage({ scene_id: scene.id, model: undefined, style, ...imageAiPayload(), ...workflowPresetPayload('scene') })
            const taskId = res?.image_generation?.task_id ?? res?.task_id
            if (taskId) {
              const result = await pollTaskWithPause(taskId, () => loadDrama())
              if (result?.paused) return { paused: true }
              if (result?.error) throw new Error(result.error)
            } else {
              await loadDrama()
              await pollUntilResourceHasImage(() => {
                const list = store.currentEpisode?.scenes ?? []
                const s = list.find((x) => Number(x.id) === Number(scene.id))
                return !!(s && (s.image_url || s.local_path))
              })
            }
          })
          if (ok && typeof ok === 'object' && ok.paused) return { paused: true }
        }, { getLabel: (scene) => '场景图 ' + (scene.location || scene.id) })
        if (paused) { await waitForResume() }
      }

      let propList2 = store.props ?? []
      if (propList2.length === 0) {
        await checkPause()
        pipelineCurrentStep.value = '正在提取道具...'
        try {
          const res = await propAPI.extractFromScript(episodeId, textAiPayload())
          const taskId = res?.task_id
          if (taskId) {
            const result = await pollTaskWithPause(taskId, () => refreshAssetWorkbench('props'))
            if (result?.paused) { await waitForResume(); return }
            if (result?.error) { addPipelineError('提取道具', result.error) }
          } else await refreshAssetWorkbench('props')
          await pipelineRest()
        } catch (e) {
          addPipelineError('提取道具', e.message || String(e))
        }
        propList2 = store.props ?? []
      }
      const propsWithoutImage2 = propList2.filter((p) => !hasAssetImage(p))
      {
        const concurrency = pipelineConcurrency.value
        pipelineCurrentStep.value = `正在生成道具图（并发${concurrency}）...`
        await checkPause()
        const { paused } = await runConcurrently(propsWithoutImage2, concurrency, async (prop) => {
          await checkPause()
          generatingPropIds.add(prop.id)
          try {
            const stepName = '道具图 ' + (prop.name || prop.id)
            const ok = await pipelineWithRetry(stepName, async () => {
              const res = await propAPI.generateImage(prop.id, undefined, style, { ...imageAiPayload(), ...workflowPresetPayload('prop') })
              const taskId = res?.image_generation?.task_id ?? res?.task_id
              if (taskId) {
                const result = await pollTaskWithPause(taskId, () => loadDrama())
                if (result?.paused) return { paused: true }
                if (result?.error) throw new Error(result.error)
              } else {
                await loadDrama()
                await pollUntilResourceHasImage(() => {
                  const list = store.props ?? []
                  const p = list.find((x) => Number(x.id) === Number(prop.id))
                  return !!(p && (p.image_url || p.local_path))
                })
              }
            })
            if (ok && typeof ok === 'object' && ok.paused) return { paused: true }
          } finally {
            generatingPropIds.delete(prop.id)
          }
        }, { getLabel: (prop) => '道具图 ' + (prop.name || prop.id) })
        if (paused) { await waitForResume() }
      }

      let boards = store.storyboards || []
      const hadBoardsBeforeRepairSb = boards.length > 0
      if (boards.length === 0) {
        await checkPause()
        pipelineCurrentStep.value = '正在生成分镜...'
        try {
          const res = await dramaAPI.generateStoryboard(episodeId, {
            style,
            aspect_ratio: projectAspectRatio.value || '16:9',
            language: scriptLanguage.value || 'zh',
            storyboard_count: getStoryboardCountForApi(),
            video_duration: getVideoDurationForApi(),
            video_clip_duration: videoClipDuration.value || 10,
            include_narration: !!storyboardIncludeNarration.value,
            universal_omni_storyboard: !!storyboardUniversalOmni.value,
            ...textAiPayload(),
          })
          const taskId = res?.task_id ?? (typeof res === 'string' ? res : null)
          if (taskId) {
            const result = await pollTaskWithPause(taskId, () => loadDrama())
            if (result?.paused) { await waitForResume(); return }
            if (result?.error) { addPipelineError('分镜生成', result.error); return }
          }
          await loadDrama()
          await pipelineRest()
        } catch (e) {
          addPipelineError('分镜生成', e.message || String(e))
          return
        }
        boards = store.storyboards || []
      }
      if (!hadBoardsBeforeRepairSb && storyboardUniversalOmni.value) {
        await checkPause()
        await polishUniversalSegmentsAfterGeneration({
          checkPause,
          onShotProgress: (cur, total, sb) => {
            pipelineCurrentStep.value = `润色全能分镜(${cur}/${total}) #${sb.storyboard_number ?? cur} ${(sb.title || '').slice(0, 16)}`
          },
          onShotError: (sb, msg) =>
            addPipelineError('润色全能分镜', `镜#${sb.storyboard_number ?? sb.id}: ${msg}`),
        })
        await loadDrama()
      }

      await loadStoryboardMedia()
      const boardsWithoutImg = boards.filter((sb) => !hasSbImage(sb))
      {
        const concurrency = pipelineConcurrency.value
        pipelineCurrentStep.value = `正在生成分镜图（并发${concurrency}）...`
        const { paused } = await runConcurrently(boardsWithoutImg, concurrency, async (sb) => {
          await checkPause()
          const stepName = '分镜图 #' + (sb.storyboard_number ?? sb.id)
          const ok = await pipelineWithRetry(stepName, async () => {
            const useFirstLast = storyboardUseFirstLastFrame.value
            if (useFirstLast) {
              const first = await submitSbFrameImageTask(sb, 'first', { dramaIdValue: dramaIdVal, style, pollWithPause: true })
              if (first?.paused) return { paused: true }
              const last = await submitSbFrameImageTask(sb, 'last', { dramaIdValue: dramaIdVal, style, pollWithPause: true })
              if (last?.paused) return { paused: true }
              return { failed: 0 }
            }
            const result = await createStoryboardImageTasks(sb, {
              prompt: sb.polished_prompt || sb.image_prompt || sb.description || '',
              dramaIdValue: dramaIdVal,
              model: undefined,
              style,
              pollWithPause: true,
            })
            if (result?.paused) return { paused: true }
            if (result.failed > 0) throw new Error(result.error || `${result.failed} 张生成失败`)
          })
          if (ok && typeof ok === 'object' && ok.paused) return { paused: true }
        }, { getLabel: (sb) => '分镜图 #' + (sb.storyboard_number ?? sb.id) })
        if (paused) { await waitForResume() }
      }
      await loadStoryboardMedia()
      const boards2 = (store.storyboards || []).filter((sb) => {
        const vidList = sbVideos.value[sb.id] || []
        if (vidList.some((v) => v.status === 'completed' && recordHasPlayableVideoUrl(v))) return false
        if (isSbUniversalMode(sb.id)) {
          if (!sbCanSubmitVideo(sb)) return false
          return collectSbOmniReferenceAbsoluteUrls(sb).length > 0
        }
        return !!getSbFirstFrameUrl(sb)
      })
      {
        const concurrency = pipelineVideoConcurrency.value
        pipelineCurrentStep.value = `正在生成分镜视频（并发${concurrency}）...`
        const { paused } = await runConcurrently(boards2, concurrency, async (sb) => {
          await checkPause()
          const stepName = '分镜视频 #' + (sb.storyboard_number ?? sb.id)
          const ok = await pipelineWithRetry(stepName, async () => {
            const universal = isSbUniversalMode(sb.id)
            const omniRefs = universal ? collectSbOmniReferenceAbsoluteUrls(sb) : []
            const firstFrameUrl = await getMainImageUrlForVideo(sb)
            const absoluteUrl = universal ? (omniRefs[0] || '') : toAbsoluteImageUrl(firstFrameUrl)
            const { first: vFirst, last: vLast } = sbVideoFirstLastUrls(sb, universal, null)
            const classicRefs = universal ? [] : collectSbClassicVideoReferenceAbsoluteUrls(sb)
            let refUrls = universal
              ? (omniRefs.length ? omniRefs : undefined)
              : (classicRefs.length ? classicRefs : (absoluteUrl ? [absoluteUrl] : undefined))
            if (!universal && vLast && refUrls && !refUrls.includes(vLast)) {
              refUrls = [...refUrls, vLast]
            }
            const res = await videosAPI.create({
              drama_id: dramaIdVal,
              storyboard_id: sb.id,
              prompt: buildSbVideoPromptForApi(sb),
              image_url: vFirst || undefined,
              first_frame_url: vFirst,
              last_frame_url: vLast,
              reference_image_urls: refUrls,
              style,
              aspect_ratio: projectAspectRatio.value || '16:9',
              resolution: videoResolution.value || undefined,
              duration: getSbVideoDurationForApi(sb),
              ...videoAiPayload(),
            })
            if (res?.task_id) {
              const result = await pollTaskWithPause(res.task_id, () => loadSingleStoryboardMedia(sb.id))
              if (result?.paused) return { paused: true }
              if (result?.error) throw new Error(result.error)
            } else await loadSingleStoryboardMedia(sb.id)
          })
          if (ok && typeof ok === 'object' && ok.paused) return { paused: true }
        }, { getLabel: (sb) => '分镜视频 #' + (sb.storyboard_number ?? sb.id) })
        if (paused) { await waitForResume() }
      }

      await checkPause()
      pipelineCurrentStep.value = '正在生成整集视频...'
      try {
        const result = await dramaAPI.finalizeEpisode(episodeId, getFinalizeMergeOptions())
        if (result?.task_id != null) {
          const pollResult = await pollTaskWithPause(result.task_id, () => loadDrama())
          if (pollResult?.paused) { await waitForResume(); return }
          if (pollResult?.error) addPipelineError('生成整集视频', pollResult.error)
          else await pipelineRest()
        } else {
          addPipelineError('生成整集视频', result?.message || '本集没有可合成的视频片段')
        }
      } catch (e) {
        addPipelineError('生成整集视频', e.message || String(e))
      }

      pipelineCurrentStep.value = '补全并生成流程已执行完成'
      ElMessage.success('修复缺失流程已执行完成')
    } catch (e) {
      addPipelineError('流程', e.message || String(e))
    }
  }

  return {
    runOneClickPipeline,
    runRepairPipeline,
    startOneClickPipeline,
    startRepairPipeline,
    startTextFrameworkPipeline,
  }
}
