import { ref } from 'vue'
import { storyboardsAPI } from '@/api/storyboards'

const EMPTY_ARR = []

export function useStoryboardFieldState(deps = {}) {
  const {
    store,
    videoClipDuration,
  } = deps

  const sbCharacterIds = ref({})
  const sbPropIds = ref({})
  const sbSceneId = ref({})
  const sbDialogue = ref({})
  const sbNarration = ref({})
  const sbShotType = ref({})
  const sbTitle = ref({})
  const sbLocation = ref({})
  const sbTime = ref({})
  const sbDuration = ref({})
  const sbAction = ref({})
  const sbResult = ref({})
  const sbAtmosphere = ref({})
  const sbAngle = ref({})
  const sbAngleH = ref({})
  const sbAngleV = ref({})
  const sbAngleS = ref({})
  const sbMovement = ref({})
  const sbLighting = ref({})
  const sbDof = ref({})
  const sbLayoutDescription = ref({})
  const sbCreationMode = ref({})
  const sbUniversalSegmentText = ref({})

  function defaultStoryboardDuration() {
    return Number(videoClipDuration?.value ?? videoClipDuration) || 10
  }

  function syncStoryboardStateFromEpisode(episode) {
    const boards = episode?.storyboards || []
    const nextCharIds = {}
    const nextPropIds = {}
    const nextScene = {}
    const nextDialogue = {}
    const nextNarration = {}
    const nextShot = {}
    const nextTitle = {}
    const nextLocation = {}
    const nextTime = {}
    const nextDuration = {}
    const nextAction = {}
    const nextResult = {}
    const nextAtmosphere = {}
    const nextAngle = {}
    const nextAngleH = {}
    const nextAngleV = {}
    const nextAngleS = {}
    const nextMovement = {}
    const nextLighting = {}
    const nextDof = {}
    const nextLayoutDescription = {}
    const nextCreationMode = {}
    const nextUniversalSegment = {}

    for (const storyboard of boards) {
      nextScene[storyboard.id] = storyboard.scene_id ?? null
      nextDialogue[storyboard.id] = storyboard.dialogue ?? ''
      nextNarration[storyboard.id] = storyboard.narration ?? ''
      nextShot[storyboard.id] = (storyboard.shot_type ?? '').toString() || ''
      nextTitle[storyboard.id] = (storyboard.title ?? '').toString()
      nextLocation[storyboard.id] = (storyboard.location ?? '').toString()
      nextTime[storyboard.id] = (storyboard.time ?? '').toString()
      nextDuration[storyboard.id] = storyboard.duration != null ? Number(storyboard.duration) : defaultStoryboardDuration()
      nextAction[storyboard.id] = (storyboard.action ?? '').toString()
      nextResult[storyboard.id] = (storyboard.result ?? '').toString()
      nextAtmosphere[storyboard.id] = (storyboard.atmosphere ?? '').toString()
      nextAngle[storyboard.id] = (storyboard.angle ?? '').toString()
      nextAngleH[storyboard.id] = storyboard.angle_h || ''
      nextAngleV[storyboard.id] = storyboard.angle_v || ''
      nextAngleS[storyboard.id] = storyboard.angle_s || ''
      nextMovement[storyboard.id] = (storyboard.movement ?? '').toString()
      nextLighting[storyboard.id] = storyboard.lighting_style || ''
      nextDof[storyboard.id] = storyboard.depth_of_field || ''
      nextLayoutDescription[storyboard.id] = (storyboard.layout_description ?? '').toString()
      const charList = Array.isArray(storyboard.characters)
        ? storyboard.characters
        : (storyboard.characters != null ? [storyboard.characters] : [])
      nextCharIds[storyboard.id] = charList
        .map((character) => (typeof character === 'object' && character != null ? Number(character.id) : Number(character)))
        .filter((id) => Number.isFinite(id))
        .slice(0, 1)
      nextPropIds[storyboard.id] = (Array.isArray(storyboard.prop_ids) ? storyboard.prop_ids : [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id))
        .slice(0, 1)
      nextCreationMode[storyboard.id] = storyboard.creation_mode === 'universal' ? 'universal' : 'classic'
      nextUniversalSegment[storyboard.id] = (storyboard.universal_segment_text ?? '').toString()
    }

    sbCharacterIds.value = nextCharIds
    sbPropIds.value = nextPropIds
    sbSceneId.value = nextScene
    sbDialogue.value = nextDialogue
    sbNarration.value = nextNarration
    sbShotType.value = nextShot
    sbTitle.value = nextTitle
    sbLocation.value = nextLocation
    sbTime.value = nextTime
    sbDuration.value = nextDuration
    sbAction.value = nextAction
    sbResult.value = nextResult
    sbAtmosphere.value = nextAtmosphere
    sbAngle.value = nextAngle
    sbAngleH.value = nextAngleH
    sbAngleV.value = nextAngleV
    sbAngleS.value = nextAngleS
    sbMovement.value = nextMovement
    sbLighting.value = nextLighting
    sbDof.value = nextDof
    sbLayoutDescription.value = nextLayoutDescription
    sbCreationMode.value = nextCreationMode
    sbUniversalSegmentText.value = nextUniversalSegment
  }

  function getSbCharacterIds(storyboardId) {
    const ids = sbCharacterIds.value[storyboardId]
    return Array.isArray(ids) && ids.length > 0 ? ids : EMPTY_ARR
  }

  function getSbCharacterId(storyboardId) {
    const ids = getSbCharacterIds(storyboardId)
    return ids.length ? ids[0] : null
  }

  function setSbCharacterId(storyboardId, value) {
    const id = Number(value)
    const next = Number.isFinite(id) && id > 0 ? [id] : []
    sbCharacterIds.value = { ...sbCharacterIds.value, [storyboardId]: next }
    onStoryboardCharacterChange(storyboardId)
  }

  function getSbPropIds(storyboardId) {
    const ids = sbPropIds.value[storyboardId]
    return Array.isArray(ids) && ids.length > 0 ? ids : EMPTY_ARR
  }

  function getSbPropId(storyboardId) {
    const ids = getSbPropIds(storyboardId)
    return ids.length ? ids[0] : null
  }

  function setSbPropId(storyboardId, value) {
    const id = Number(value)
    sbPropIds.value = { ...sbPropIds.value, [storyboardId]: Number.isFinite(id) && id > 0 ? [id] : [] }
    onStoryboardPropChange(storyboardId)
  }

  async function onStoryboardCharacterChange(storyboardId) {
    const ids = sbCharacterIds.value[storyboardId] || []
    try {
      await storyboardsAPI.update(storyboardId, { character_ids: ids })
    } catch (error) {
      console.warn('[分镜] 保存角色失败', error)
    }
  }

  function onStoryboardPropChange(storyboardId) {
    const ids = sbPropIds.value[storyboardId] || []
    storyboardsAPI.update(storyboardId, { prop_ids: ids }).catch(() => {})
  }

  function onStoryboardSceneChange(storyboardId) {
    const sceneId = sbSceneId.value[storyboardId] ?? null
    storyboardsAPI.update(storyboardId, { scene_id: sceneId }).catch(() => {})
  }

  function getSbSelectedScene(storyboardId) {
    const sceneId = sbSceneId.value[storyboardId]
    if (sceneId == null) return null
    return (store?.scenes || []).find((scene) => Number(scene.id) === Number(sceneId)) || null
  }

  function getSbSelectedCharacters(storyboardId) {
    const ids = getSbCharacterIds(storyboardId)
    if (!ids.length) return []
    const list = store?.characters || []
    return ids.map((id) => list.find((character) => Number(character.id) === Number(id))).filter(Boolean)
  }

  function getSbSelectedProps(storyboardId) {
    const ids = getSbPropIds(storyboardId)
    if (!ids.length) return []
    const list = store?.props || []
    return ids.map((id) => list.find((prop) => Number(prop.id) === Number(id))).filter(Boolean)
  }

  function charactersAvailableToAddToSb(storyboardId) {
    const currentId = Number(getSbCharacterId(storyboardId))
    return (store?.characters || []).filter((character) => character && Number(character.id) !== currentId)
  }

  function onSbAddCharacterCommand(storyboardId, characterId) {
    const id = Number(characterId)
    if (!Number.isFinite(id)) return
    setSbCharacterId(storyboardId, id)
  }

  function getMovementLabel(value) {
    if (!value) return ''
    const labels = {
      static: '固定',
      push: '推镜',
      pull: '拉镜',
      pan: '横摇',
      tilt: '纵摇',
      tracking: '跟镜',
      crane_up: '升镜',
      crane_dn: '降镜',
      orbit: '环绕',
      handheld: '手持',
      zoom: '变焦',
      roll: '旋转',
      whip_pan: '甩镜',
      spiral: '螺旋',
      hitchcock_zoom: '希区柯克',
      bullet_time: '子弹时间',
      dutch_angle_move: '荷兰角',
      dolly_track: '推轨',
      slowmo_orbit: '升格环绕',
    }
    return labels[value] || value
  }

  return {
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
  }
}
