import { nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

function readValue(source, fallback) {
  if (source && typeof source === 'object' && 'value' in source) return source.value
  return source ?? fallback
}

export function useAssetStoryboardLinks(options = {}) {
  const {
    storyboards,
    filmWorkbenchTab,
    regenSbImagesForAsset,
    regenSbImagesProgress,
    storyboardUseFirstLastFrame,
    dramaId,
    submitSbFrameImageTask = async () => ({}),
    createStoryboardImageTasks = async () => ({ failed: 0 }),
    getSelectedStyle = () => '',
  } = options

  function getStoryboardList() {
    return readValue(storyboards, []) || []
  }

  function getDramaIdValue() {
    return readValue(dramaId, null)
  }

  function isUsingFirstLastFrame() {
    return !!readValue(storyboardUseFirstLastFrame, false)
  }

  function setProgress(assetKey, progress) {
    if (!regenSbImagesProgress) return
    if (!regenSbImagesProgress.value) regenSbImagesProgress.value = {}
    regenSbImagesProgress.value[assetKey] = progress
  }

  function clearProgress(assetKey) {
    if (regenSbImagesProgress?.value) delete regenSbImagesProgress.value[assetKey]
  }

  /** 同镜号多行时只保留 id 最大的一条，避免「影响的分镜」重复 #N。 */
  function dedupeStoryboardsForAssetLink(list) {
    const byNum = new Map()
    const extras = []
    for (const sb of list || []) {
      const n = Number(sb?.storyboard_number)
      if (Number.isFinite(n) && n > 0) {
        const prev = byNum.get(n)
        if (!prev || Number(sb.id) > Number(prev.id)) byNum.set(n, sb)
      } else {
        extras.push(sb)
      }
    }
    return [...byNum.values(), ...extras].sort(
      (a, b) => (Number(a.storyboard_number) || 0) - (Number(b.storyboard_number) || 0)
    )
  }

  function getCharAffectedStoryboards(charId) {
    const matched = getStoryboardList().filter((sb) => {
      if (!sb.characters) return false
      const chars = Array.isArray(sb.characters) ? sb.characters : []
      return chars.some((c) => Number(typeof c === 'object' && c != null ? c.id : c) === Number(charId))
    })
    return dedupeStoryboardsForAssetLink(matched)
  }

  function getSceneAffectedStoryboards(sceneId) {
    const matched = getStoryboardList().filter(
      (sb) => sb.scene_id != null && Number(sb.scene_id) === Number(sceneId)
    )
    return dedupeStoryboardsForAssetLink(matched)
  }

  function getPropAffectedStoryboards(propId) {
    const matched = getStoryboardList().filter((sb) => {
      if (!sb.prop_ids) return false
      const pids = Array.isArray(sb.prop_ids) ? sb.prop_ids : []
      return pids.some((pid) => Number(pid) === Number(propId))
    })
    return dedupeStoryboardsForAssetLink(matched)
  }

  async function scrollToStoryboard(sbId) {
    if (filmWorkbenchTab?.value != null) filmWorkbenchTab.value = 'storyboards'
    await nextTick()
    const el = document.getElementById('sb-' + sbId)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  async function onRegenAffectedSbImages(assetKey, affectedBoards = []) {
    if (!affectedBoards.length || regenSbImagesForAsset?.has(assetKey)) return
    try {
      await ElMessageBox.confirm(
        `将为 ${affectedBoards.length} 个关联分镜重新生成图片（#${affectedBoards.map((s) => s.storyboard_number).join('、#')}），原有图片将被覆盖，是否继续？`,
        '重新生成关联分镜图',
        { confirmButtonText: '确认生成', cancelButtonText: '取消', type: 'warning' }
      )
    } catch {
      return
    }
    regenSbImagesForAsset?.add(assetKey)
    setProgress(assetKey, { current: 0, total: affectedBoards.length })
    let failed = 0
    try {
      for (let i = 0; i < affectedBoards.length; i++) {
        setProgress(assetKey, { current: i + 1, total: affectedBoards.length })
        const sb = affectedBoards[i]
        try {
          if (isUsingFirstLastFrame()) {
            await submitSbFrameImageTask(sb, 'first', { dramaIdValue: getDramaIdValue(), style: getSelectedStyle() })
            await submitSbFrameImageTask(sb, 'last', { dramaIdValue: getDramaIdValue(), style: getSelectedStyle() })
          } else {
            const result = await createStoryboardImageTasks(sb, {
              prompt: sb.polished_prompt || sb.image_prompt || sb.description || '',
              dramaIdValue: getDramaIdValue(),
              style: getSelectedStyle(),
            })
            if (result.failed > 0) failed++
          }
        } catch (_) {
          failed++
        }
        if (i < affectedBoards.length - 1) await new Promise((resolve) => setTimeout(resolve, 500))
      }
      if (failed === 0) ElMessage.success(`已重新生成 ${affectedBoards.length} 张关联分镜图`)
      else ElMessage.warning(`完成，${failed}/${affectedBoards.length} 条失败`)
    } finally {
      regenSbImagesForAsset?.delete(assetKey)
      clearProgress(assetKey)
    }
  }

  return {
    dedupeStoryboardsForAssetLink,
    getCharAffectedStoryboards,
    getSceneAffectedStoryboards,
    getPropAffectedStoryboards,
    scrollToStoryboard,
    onRegenAffectedSbImages,
  }
}
