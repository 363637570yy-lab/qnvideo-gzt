import { computed } from 'vue'

function readValue(source, fallback = undefined) {
  return source?.value ?? source ?? fallback
}

function hasSetItems(source) {
  return Number(source?.size || 0) > 0
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
  } = deps

  const navSteps = computed(() => {
    const epRunning = genStore?.getRunningForEpisode?.(readValue(dramaId), readValue(currentEpisodeId)) || []

    const hasScript = !!(readValue(scriptContent, '')?.trim?.())
    const scriptStatus = readValue(storyGenerating, false) || readValue(scriptGenerating, false)
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
      { key: 'script', label: '故事剧本', anchor: 'anchor-script', status: scriptStatus, count: hasScript ? 1 : 0 },
      { key: 'chars', label: '角色', anchor: 'anchor-characters', status: charStatus, count: charList.length },
      { key: 'props', label: '道具', anchor: 'anchor-props', status: propStatus, count: propList.length },
      { key: 'scenes', label: '场景', anchor: 'anchor-scenes', status: sceneStatus, count: sceneList.length },
      { key: 'sb', label: '分镜脚本', anchor: 'anchor-storyboard', status: sbScriptStatus, count: sbList.length },
      { key: 'sbimg', label: '分镜图', anchor: 'anchor-storyboard', status: sbImgStatus, count: sbList.length },
      { key: 'video', label: '分镜视频', anchor: 'anchor-video', status: videoStatus, count: 0 },
    ]
  })

  return { navSteps }
}
