import { computed } from 'vue'

function readValue(source, fallback = undefined) {
  return source?.value ?? source ?? fallback
}

function hasSetItems(source) {
  return Number(source?.size || 0) > 0
}

function normalizeStatus(status) {
  return ['pending', 'partial', 'done', 'generating'].includes(status) ? status : 'pending'
}

function progressStepsByKey(summary) {
  const source = readValue(summary)
  const steps = Array.isArray(source?.progress_steps) ? source.progress_steps : []
  return Object.fromEntries(steps.map((step) => [step.key, step]))
}

function numberValue(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function mergeSummaryStep(summaryMap, key, fallback, forceGenerating = false) {
  const step = summaryMap[key]
  if (!step) return forceGenerating ? { ...fallback, status: 'generating' } : fallback
  return {
    ...fallback,
    status: forceGenerating ? 'generating' : normalizeStatus(step.status),
    count: numberValue(step.count, fallback.count),
    total_count: numberValue(step.total_count, step.count ?? fallback.count),
    ready_count: numberValue(step.ready_count, 0),
    running_tasks: numberValue(step.running_tasks, 0),
  }
}

export function useQuickNavProgress(deps = {}) {
  const {
    GEN_RESOURCE = {},
    batchImageRunning,
    batchVideoRunning,
    characters,
    charactersGenerating,
    currentEpisodeId,
    dramaId,
    genStore,
    generatingCharIds,
    generatingPropIds,
    generatingSbImageIds,
    generatingSbVideoIds,
    generatingSceneIds,
    getSbAllVideos = () => [],
    hasAssetImage = () => false,
    hasSbImage = () => false,
    props,
    propsExtracting,
    scenes,
    scenesExtracting,
    scriptContent,
    scriptGenerating,
    storyboards,
    storyboardGenerating,
    storyGenerating,
    universalOmniPolishRunning,
    workbenchSummary,
  } = deps

  const navSteps = computed(() => {
    const summaryMap = progressStepsByKey(workbenchSummary)
    const epRunning = genStore?.getRunningForEpisode?.(readValue(dramaId), readValue(currentEpisodeId)) || []

    const hasScript = !!(readValue(scriptContent, '')?.trim?.())
    const scriptGen = readValue(storyGenerating, false) || readValue(scriptGenerating, false)
    const scriptStatus = scriptGen
      ? 'generating'
      : hasScript ? 'done' : 'pending'

    const charList = readValue(characters, []) || []
    const charDone = charList.length > 0 && charList.every((item) => hasAssetImage(item))
    const charGen = readValue(charactersGenerating, false) || hasSetItems(generatingCharIds)
      || epRunning.some((task) => task.resourceType === GEN_RESOURCE.CHAR_IMAGE || task.resourceType === GEN_RESOURCE.EXTRACT_CHARACTERS)
    const charStatus = charGen ? 'generating' : charDone ? 'done' : charList.length > 0 ? 'partial' : 'pending'

    const propList = readValue(props, []) || []
    const propDone = propList.length > 0 && propList.every((item) => hasAssetImage(item))
    const propGen = readValue(propsExtracting, false) || hasSetItems(generatingPropIds)
      || epRunning.some((task) => task.resourceType === GEN_RESOURCE.PROP_IMAGE || task.resourceType === GEN_RESOURCE.EXTRACT_PROPS)
    const propStatus = propGen ? 'generating' : propDone ? 'done' : propList.length > 0 ? 'partial' : 'pending'

    const sceneList = readValue(scenes, []) || []
    const sceneDone = sceneList.length > 0 && sceneList.every((item) => hasAssetImage(item))
    const sceneGen = readValue(scenesExtracting, false) || hasSetItems(generatingSceneIds)
      || epRunning.some((task) => task.resourceType === GEN_RESOURCE.SCENE_IMAGE || task.resourceType === GEN_RESOURCE.EXTRACT_SCENES)
    const sceneStatus = sceneGen ? 'generating' : sceneDone ? 'done' : sceneList.length > 0 ? 'partial' : 'pending'

    const sbList = readValue(storyboards, []) || []
    const sbScriptDone = sbList.length > 0
    const sbScriptGen = readValue(storyboardGenerating, false) || readValue(universalOmniPolishRunning, false)
      || epRunning.some((task) => task.resourceType === GEN_RESOURCE.GENERATE_STORYBOARD)
    const sbScriptStatus = sbScriptGen ? 'generating' : sbScriptDone ? 'done' : 'pending'

    const sbImgDone = sbList.length > 0 && sbList.every((item) => hasSbImage(item))
    const sbImgGen = hasSetItems(generatingSbImageIds) || readValue(batchImageRunning, false) || epRunning.some((task) =>
      task.resourceType === GEN_RESOURCE.SB_IMAGE
      || task.resourceType === GEN_RESOURCE.SB_FIRST_IMAGE
      || task.resourceType === GEN_RESOURCE.SB_LAST_IMAGE
    )
    const sbImgStatus = sbImgGen ? 'generating' : sbImgDone ? 'done' : sbList.length > 0 ? 'partial' : 'pending'

    const sbVideoAllDone = sbList.length > 0 && sbList.every((item) => getSbAllVideos(item.id).length > 0)
    const sbVideoSome = sbList.some((item) => getSbAllVideos(item.id).length > 0)
    const sbVideoGen = readValue(batchVideoRunning, false) || hasSetItems(generatingSbVideoIds)
      || epRunning.some((task) => task.resourceType === GEN_RESOURCE.SB_VIDEO)
    const videoStatus = sbVideoGen ? 'generating' : sbVideoAllDone ? 'done' : sbVideoSome ? 'partial' : 'pending'

    return [
      mergeSummaryStep(summaryMap, 'script', { key: 'script', label: '故事剧本', anchor: 'anchor-script', status: scriptStatus, count: hasScript ? 1 : 0 }, scriptGen),
      mergeSummaryStep(summaryMap, 'chars', { key: 'chars', label: '角色', anchor: 'anchor-characters', status: charStatus, count: charList.length }, charGen),
      mergeSummaryStep(summaryMap, 'props', { key: 'props', label: '道具', anchor: 'anchor-props', status: propStatus, count: propList.length }, propGen),
      mergeSummaryStep(summaryMap, 'scenes', { key: 'scenes', label: '场景', anchor: 'anchor-scenes', status: sceneStatus, count: sceneList.length }, sceneGen),
      mergeSummaryStep(summaryMap, 'sb', { key: 'sb', label: '分镜脚本', anchor: 'anchor-storyboard', status: sbScriptStatus, count: sbList.length }, sbScriptGen),
      mergeSummaryStep(summaryMap, 'sbimg', { key: 'sbimg', label: '分镜图', anchor: 'anchor-storyboard', status: sbImgStatus, count: sbList.length }, sbImgGen),
      mergeSummaryStep(summaryMap, 'video', { key: 'video', label: '分镜视频', anchor: 'anchor-video', status: videoStatus, count: sbList.length }, sbVideoGen),
    ]
  })

  return { navSteps }
}
