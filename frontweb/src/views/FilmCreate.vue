<template>
  <div class="film-create" :class="{ 'sidebar-collapsed': navCollapsed }">
    <FilmCreateHeader :ctx="filmCreateCtx" />

    <div v-if="isAdminViewingOtherProject" class="admin-project-notice">
      <div>
        <strong>正在代管 {{ projectOwnerLabel }} 的项目</strong>
        <span>管理员代操作模式</span>
      </div>
      <span>生成、停止、上传、删除等操作会先二次确认。</span>
    </div>

    <QuickNav :ctx="filmCreateCtx" />

    <main class="main">
      <!-- 角色/道具/场景上传图片用，单例放在外层避免 v-for 导致 ref 为数组 -->
      <input
        ref="resourceImageFileInput"
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        style="display: none"
        @change="onResourceImageFileChange"
      />
      <!-- 分镜图上传图片用，单例放在外层避免 v-for 导致 ref 为数组 -->
      <input
        ref="sbImageFileInput"
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        style="display: none"
        @change="onSbImageFileChange"
      />
      <FilmWorkbenchTabs v-model="filmWorkbenchTab" />
      <ScriptWorkbench
        v-show="filmWorkbenchTab === 'script'"
        v-model:mode="scriptWorkbenchMode"
        v-model:story-input="storyInput"
        v-model:story-style="storyStyle"
        v-model:story-type="storyType"
        v-model:story-episode-count="storyEpisodeCount"
        v-model:selected-episode-id="selectedEpisodeId"
        v-model:script-title="scriptTitle"
        v-model:script-content="scriptContent"
        v-model:select-preview-episode-id="selectPreviewEpisodeId"
        :max-episode-count="MAX_STORY_EPISODE_COUNT"
        :story-generating="storyGenerating"
        :script-generating="scriptGenerating"
        :drama-id="dramaId"
        :current-episode-id="currentEpisodeId"
        :episodes="store.drama?.episodes || []"
        @save-project-settings="scheduleProjectSettingsSave(false)"
        @normalize-story-episode-count="normalizeStoryEpisodeCount"
        @generate-story="onGenerateStory"
        @open-novel-import="showNovelImport = true"
        @episode-select="onEpisodeSelect"
        @add-episode="onAddEpisode"
        @generate-script="onGenerateScript"
        @open-select-script="openSelectScriptDialog"
      />

      <ProjectPipelinePanel :ctx="filmCreateCtx" />

      <CharacterWorkbench
        v-show="filmWorkbenchTab === 'characters'"
        :ctx="filmCreateCtx"
      />

      <PropWorkbench
        v-show="filmWorkbenchTab === 'props'"
        :ctx="filmCreateCtx"
      />

      <SceneWorkbench
        v-show="filmWorkbenchTab === 'scenes'"
        :ctx="filmCreateCtx"
      />

      <StoryboardWorkbench
        v-show="filmWorkbenchTab === 'storyboards'"
        :ctx="filmCreateCtx"
      />

      <VideoWorkbench
        v-show="filmWorkbenchTab === 'videoCompose'"
        v-model:subtitle="videoSubtitle"
        v-model:burn-dialogue="videoBurnDialogue"
        v-model:watermark="videoWatermark"
        v-model:watermark-text="videoWatermarkText"
        :is-admin-user="isAdminUser"
        :current-episode-id="currentEpisodeId"
        :storyboards-count="storyboards.length"
        :video-status="videoStatus"
        :video-progress="videoProgress"
        :video-error-msg="videoErrorMsg"
        :current-episode-video-url="currentEpisodeVideoUrl"
        @open-ai-config="showAiConfigDialog = true"
        @generate-video="onGenerateVideo"
      />
    </main>

    <ResourceRefImageInputs :ctx="filmCreateCtx" />
    <ScriptDialogs :ctx="filmCreateCtx" />
    <CharacterDialogs :ctx="filmCreateCtx" />
    <PropDialogs :ctx="filmCreateCtx" />
    <SceneDialogs :ctx="filmCreateCtx" />
    <StoryboardDialogs :ctx="filmCreateCtx" />
    <FilmCreateCommonDialogs :ctx="filmCreateCtx" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, reactive, nextTick, proxyRefs } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Setting, Plus, Minus, Sunny, Moon, MagicStick, Upload, Delete, Check, Loading, WarningFilled, User, Box, Picture, Film, VideoCamera, Document, InfoFilled, Refresh, ZoomIn, QuestionFilled, DocumentAdd, Expand, Fold, VideoPlay, DataAnalysis } from '@element-plus/icons-vue'
import { useTheme } from '@/composables/useTheme'
import { useFilmStore } from '@/stores/film'
import { useGenerationTaskStore, GEN_RESOURCE } from '@/stores/generationTaskStore'
import { syncGeneratingSetsFromStore, buildEpisodeContext, buildExtractTaskMeta, isEpisodeExtractRunning } from '@/composables/useGenerationTaskSync'
import { dramaAPI } from '@/api/drama'
import { generationAPI } from '@/api/generation'
import { aiAPI } from '@/api/ai'
import { characterAPI } from '@/api/characters'
import { propAPI } from '@/api/props'
import { sceneAPI } from '@/api/scenes'
import { imagesAPI } from '@/api/images'
import { videosAPI } from '@/api/videos'
import { storyboardsAPI } from '@/api/storyboards'
import { uploadAPI } from '@/api/upload'
import { characterLibraryAPI } from '@/api/characterLibrary'
import { sceneLibraryAPI } from '@/api/sceneLibrary'
import { propLibraryAPI } from '@/api/propLibrary'
import { parseScriptIntoEpisodes } from '@/utils/scriptEpisodes'
import { exportStoryboardSheet } from '@/utils/exportStoryboardSheet'
import AIConfigContent from '@/components/AIConfigContent.vue'
import WorkflowPresetConfigDialog from '@/components/WorkflowPresetConfigDialog.vue'
import AccountMenu from '@/components/AccountMenu.vue'
import UsageCenterDialog from '@/components/UsageCenterDialog.vue'
import FilmCreateHeader from '@/features/filmCreate/layout/FilmCreateHeader.vue'
import FilmWorkbenchTabs from '@/features/filmCreate/layout/FilmWorkbenchTabs.vue'
import ProjectPipelinePanel from '@/features/filmCreate/layout/ProjectPipelinePanel.vue'
import QuickNav from '@/features/filmCreate/layout/QuickNav.vue'
import ResourceRefImageInputs from '@/features/filmCreate/shared/components/ResourceRefImageInputs.vue'
import FilmCreateCommonDialogs from '@/features/filmCreate/shared/components/FilmCreateCommonDialogs.vue'
import ScriptWorkbench from '@/features/filmCreate/workbenches/script/ScriptWorkbench.vue'
import ScriptDialogs from '@/features/filmCreate/workbenches/script/ScriptDialogs.vue'
import CharacterWorkbench from '@/features/filmCreate/workbenches/characters/CharacterWorkbench.vue'
import CharacterDialogs from '@/features/filmCreate/workbenches/characters/CharacterDialogs.vue'
import PropWorkbench from '@/features/filmCreate/workbenches/props/PropWorkbench.vue'
import PropDialogs from '@/features/filmCreate/workbenches/props/PropDialogs.vue'
import SceneWorkbench from '@/features/filmCreate/workbenches/scenes/SceneWorkbench.vue'
import SceneDialogs from '@/features/filmCreate/workbenches/scenes/SceneDialogs.vue'
import StoryboardWorkbench from '@/features/filmCreate/workbenches/storyboards/StoryboardWorkbench.vue'
import StoryboardDialogs from '@/features/filmCreate/workbenches/storyboards/StoryboardDialogs.vue'
import VideoWorkbench from '@/features/filmCreate/workbenches/video/VideoWorkbench.vue'
import UniversalSegmentOmniAtEditor from '@/components/UniversalSegmentOmniAtEditor.vue'
import { backfillDramaStylePromptMetadataIfNeeded } from '@/constants/styleOptions'
import { useNavigation } from '@/features/filmCreate/shared/composables/useNavigation'
import { useAiRouteSelection } from '@/features/filmCreate/shared/composables/useAiRouteSelection'
import { useProjectSettings } from '@/features/filmCreate/shared/composables/useProjectSettings'
import { useWorkflowPresets } from '@/features/filmCreate/shared/composables/useWorkflowPresets'
import { useWorkbenchLoader } from '@/features/filmCreate/shared/composables/useWorkbenchLoader'
import { useMediaPreview } from '@/features/filmCreate/shared/composables/useMediaPreview'
import { useTaskRuntime } from '@/features/filmCreate/shared/composables/useTaskRuntime'
import { usePipelineRunner } from '@/features/filmCreate/shared/composables/usePipelineRunner'
import { runGenerateStoryFromPremise } from '@/composables/useStoryGeneration'
import { useScriptWorkbench } from '@/features/filmCreate/workbenches/script/useScriptWorkbench'
import { useCharacters } from '@/features/filmCreate/workbenches/characters/useCharacters'
import { useProps as usePropsComposable } from '@/features/filmCreate/workbenches/props/useProps'
import { useScenes } from '@/features/filmCreate/workbenches/scenes/useScenes'
import { useStoryboardSettings } from '@/features/filmCreate/workbenches/storyboards/useStoryboardSettings'
import { useStoryboardWorkbench } from '@/features/filmCreate/workbenches/storyboards/useStoryboardWorkbench'
import { useStoryboardVideoWorkflow } from '@/features/filmCreate/workbenches/storyboards/useStoryboardVideoWorkflow'
import { useVideoWorkbench } from '@/features/filmCreate/workbenches/video/useVideoWorkbench'
import { getCurrentUser, isAdmin } from '@/utils/auth'

const route = useRoute()
const router = useRouter()
const store = useFilmStore()
const genStore = useGenerationTaskStore()
const { isDark, toggle: toggleTheme } = useTheme()
const currentUser = ref(getCurrentUser())
const isAdminUser = ref(isAdmin())
let resourceUploadPreconfirm = null
const projectOwnerLabel = computed(() => {
  const owner = store.drama?.owner_user || store.drama?.created_by_user || {}
  return owner.display_name || owner.username || store.drama?.owner_user_id || '未知用户'
})
const isAdminViewingOtherProject = computed(() => {
  const ownerId = store.drama?.owner_user_id
  const userId = currentUser.value?.id
  return !!(isAdminUser.value && ownerId && userId && String(ownerId) !== String(userId))
})

async function confirmAdminProjectOperation(action = '继续操作') {
  if (!isAdminViewingOtherProject.value) return true
  try {
    await ElMessageBox.confirm(
      `你正在操作「${projectOwnerLabel.value}」的项目。确认要${action}吗？`,
      '管理员操作确认',
      { type: 'warning', confirmButtonText: '确认操作', cancelButtonText: '取消' }
    )
    return true
  } catch {
    return false
  }
}

function isFreshPreconfirm(marker) {
  return !!(marker && Number(marker.expiresAt) > Date.now())
}

function consumeResourceUploadPreconfirm(type, id) {
  const marker = resourceUploadPreconfirm
  resourceUploadPreconfirm = null
  return !!(
    isFreshPreconfirm(marker) &&
    String(marker.type) === String(type) &&
    String(marker.id) === String(id)
  )
}

function canManageLibrary(item) {
  return !!item?.can_manage || isAdminUser.value || (!!item?.created_by_user_id && String(item.created_by_user_id) === String(currentUser.value?.id))
}

// ── Composable: Navigation ─────────────────────────────
const { navCollapsed, storyboardMenuExpanded, toggleNav, scrollToTop, scrollToAnchor } = useNavigation()

function goList() {
  router.push('/')
}


const showAiConfigDialog = ref(false)
const showUsageCenterDialog = ref(false)
const showWorkflowConfigDialog = ref(false)
let invalidateActiveVideoAiConfigCache = () => {}
const {
  workflowPresetLoading,
  workflowPresetOptions,
  selectedWorkflowPresetIds,
  workflowPresetLabel,
  selectedWorkflowPreset,
  selectedWorkflowPresetName,
  workflowPresetPayload,
  applyDefaultWorkflowSelections,
  loadWorkflowPresets,
} = useWorkflowPresets()
watch(showAiConfigDialog, (open) => {
  if (!open) {
    invalidateActiveVideoAiConfigCache()
    if (aiRoutesLoaded.value) {
      loadRuntimeAiConfigs(true)
    }
  }
})
watch(showWorkflowConfigDialog, (open) => {
  if (!open) loadWorkflowPresets()
})
const MAX_STORY_EPISODE_COUNT = 100
const {
  addPipelineError,
  checkPause,
  finishPipeline,
  onPipelineResume,
  pipelineActiveTasks,
  pipelineConcurrency,
  pipelineCountdown,
  pipelineCountdownMsg,
  pipelineCurrentStep,
  pipelineErrorLog,
  pipelinePaused,
  pipelineRest,
  pipelineRunning,
  pipelineStepIndex,
  pipelineStepTotal,
  pipelineVideoConcurrency,
  pipelineWithRetry,
  runConcurrently,
  runPipelineCountdown,
  setPipelineConcurrencyFallback,
  setPipelineStep,
  skipPipelineCountdown,
  startPipeline,
  waitForResume,
} = usePipelineRunner()
const {
  AI_ROUTE_METADATA_KEY,
  aiRouteLoading,
  aiRoutesLoaded,
  aiRoutesExpanded,
  aiRouteTypes,
  pipelineModelStrategyTypes,
  runtimeAiConfigs,
  runtimeRoutingPolicies,
  selectedAiConfigIds,
  normalizeAiRouteId,
  normalizeRuntimeConcurrency,
  projectAiRouteSelectionForSave,
  applyProjectAiRouteSelection,
  configOptionLabel,
  aiRouteSummary,
  routePrimaryConfig,
  pipelineModelStrategyItems,
  aiRoutePayload,
  textAiPayload,
  imageAiPayload,
  storyboardImageAiPayload,
  videoAiPayload,
  ttsAiPayload,
  applyRuntimeRoutingPolicies,
  loadRuntimeAiConfigs,
  toggleAiRoutesExpanded,
  onAiRouteSelectVisible,
} = useAiRouteSelection({ pipelineConcurrency, pipelineVideoConcurrency })
const {
  DEFAULT_GENERATION_STYLE,
  IMAGE_TIER_AREAS,
  PROJECT_SETTINGS_SAVE_DELAY_MS,
  VIDEO_TIER_AREAS,
  cloneSpec,
  clearPendingProjectSettingsSave,
  confirmImageSpec,
  defaultImageSpec,
  defaultVideoSpec,
  dimensionsForArea,
  generationStyle,
  generationStyleOptions,
  getSelectedStyle,
  getSelectedStylePrompt,
  getSelectedStylePromptZh,
  getStylePromptEn,
  getStylePromptZh,
  hydrateProjectSettingsFromDrama,
  imageRatioOptions,
  imageSpecDialogVisible,
  imageSpecDraft,
  imageSpecPreview,
  imageSpecSummary,
  imageTierOptions,
  normalizeImageSpec,
  normalizeVideoSpec,
  onProjectVideoResolutionChange,
  openImageSpecDialog,
  parseRatioValue,
  pendingProjectStyleSave,
  projectAspectRatio,
  projectImageSpec,
  projectMediaSpecMetadata,
  projectSettingsHydrating,
  projectSettingsSaveTimer,
  projectStylePromptMetadata,
  projectVideoResolution,
  projectVideoSpec,
  resetProjectSettings,
  resolvedProjectImageSpec,
  resolvedProjectVideoSpec,
  resolveImageSpec,
  resolveVideoSpec,
  roundToMultiple,
  scheduleProjectSettingsSave,
  scriptLanguage,
  scriptStoryboardStyle,
  setProjectSettingsHydrating,
  stylePromptMetadataForSave,
  videoClipDuration,
  videoResolution,
  videoTierOptions,
} = useProjectSettings({
  store,
  saveProjectSettings: (includeGenerationStyle) => saveProjectSettings(includeGenerationStyle),
})

const {
  loadSelectScriptList,
  normalizeStoryEpisodeCount,
  novelAiSummarize,
  novelFileContent,
  novelFileName,
  novelImporting,
  novelImportMode,
  novelImportReset,
  novelMaxChapters,
  novelText,
  onImportNovel,
  onNovelFileChange,
  onPickScriptFromDialog,
  openSelectScriptDialog,
  resetScriptWorkbenchState,
  savedCurrentEpisodeNumber,
  scriptContent,
  scriptGenerating,
  scriptTitle,
  scriptWorkbenchMode,
  selectableScriptDramas,
  selectedEpisodeId,
  selectPreviewEpisodeId,
  selectScriptDramas,
  selectScriptImporting,
  selectScriptLoading,
  showNovelImport,
  showSelectScriptDialog,
  storyEpisodeCount,
  storyGenerating,
  storyInput,
  storyStyle,
  storyType,
} = useScriptWorkbench({
  store,
  route,
  router,
  loadDrama: (...args) => loadDrama(...args),
  maxStoryEpisodeCount: MAX_STORY_EPISODE_COUNT,
})
const filmWorkbenchTab = ref('script')
const workbenchTabLoaded = reactive({
  script: false,
  characters: false,
  scenes: false,
  props: false,
  storyboards: false,
  videoCompose: false,
})
const anchorTabMap = {
  'anchor-script': 'script',
  'anchor-characters': 'characters',
  'anchor-scenes': 'scenes',
  'anchor-props': 'props',
  'anchor-storyboard': 'storyboards',
  'anchor-video': 'videoCompose',
}

function switchWorkbenchTabForAnchor(anchor) {
  const tab = anchorTabMap[anchor]
  if (tab) filmWorkbenchTab.value = tab
}

async function goWorkbenchAnchor(stepOrAnchor) {
  const anchor = typeof stepOrAnchor === 'string' ? stepOrAnchor : stepOrAnchor?.anchor
  if (!anchor) return
  switchWorkbenchTabForAnchor(anchor)
  await nextTick()
  scrollToAnchor(anchor)
}

async function goStoryboardAnchor(sbId) {
  filmWorkbenchTab.value = 'storyboards'
  await nextTick()
  scrollToStoryboard(sbId)
}

const {
  clipSecondsForStoryboardEstimate,
  effectiveStoryboardFrameCount,
  estimateVideoDurationSecFromCharLen,
  exportingStoryboardSheet,
  getStoryboardCountForApi,
  getVideoDurationForApi,
  hydrateStoryboardSettingsFromMetadata,
  lastFrameUseFirstLayoutLock,
  normalizeStoryboardFrameCount,
  onStoryboardUseFirstLastFrameChange,
  resetStoryboardSettings,
  scriptEstimateStoryboardHint,
  scriptEstimateStoryboardTitle,
  scriptEstimateVideoDurationHint,
  scriptEstimateVideoDurationTitle,
  scriptStoryboardEstimate,
  scriptTextTrimmedForEstimate,
  shotCountEstimateFromDurationSec,
  storyboardCount,
  storyboardFrameCount,
  storyboardFrameCountOptions,
  storyboardIncludeNarration,
  storyboardUniversalOmni,
  storyboardUseFirstLastFrame,
  userFilledStoryboardCount,
  userFilledVideoDuration,
  videoDuration,
} = useStoryboardSettings({
  scriptContent,
  videoClipDuration,
  scheduleProjectSettingsSave,
})

let storyboardReferenceImageResolver = () => []
const {
  batchImageErrors,
  batchImageProgress,
  batchImageRunning,
  batchImageStopping,
  batchVideoErrors,
  batchVideoProgress,
  batchVideoRunning,
  batchVideoStopping,
  buildFirstFrameImagePrompt,
  buildLastFrameImagePrompt,
  buildRegenerateKeyframePrompt,
  buildStoryboardKeyframePrompt,
  charactersAvailableToAddToSb,
  canUsePrevTailAsFirst,
  createStoryboardImageBatchId,
  createStoryboardImageTasks,
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
  buildKeyframeParamsJson,
  compactKeyframeText,
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
  loadSingleStoryboardMedia,
  loadStoryboardMedia,
  onSbAddCharacterCommand,
  onEditKeyframeDescription,
  onRemoveSbHistoryImage,
  onGenerateSbFrameImage,
  onGenerateSbFramePair,
  onGenerateSbImage,
  onGenerateStoryboardAux,
  onRegenerateKeyframeItem,
  onSbImageDragLeave,
  onSbImageDragOver,
  onSbImageDrop,
  onSbImageFileChange,
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
  openFramePromptEditor,
  parseImageParamsJson,
  parseJsonObject,
  quadPanelLabel,
  regenerateEditingFramePrompt,
  regeneratingLayoutSbIds,
  regenSbImagesForAsset,
  regenSbImagesProgress,
  resolveSbImageById,
  restoreSelectionsFromBackend,
  sbMainVideoPlayerKey,
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
  stripItemTitle,
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
  submitSbFrameImageTask,
} = useStoryboardWorkbench({
  store,
  imagesAPI,
  videosAPI,
  uploadAPI,
  genStore,
  genResource: GEN_RESOURCE,
  getDramaId: () => dramaId?.value,
  getCurrentEpisodeId: () => currentEpisodeId?.value,
  getSelectedStyle,
  getSelectedStylePrompt,
  getSelectedStylePromptZh,
  projectAspectRatio,
  lastFrameUseFirstLayoutLock,
  effectiveStoryboardFrameCount,
  storyboardImageAiPayload,
  pipelineRunning,
  pipelineConcurrency,
  runConcurrently,
  pollTask: (...args) => pollTask(...args),
  pollTaskWithPause: (...args) => pollTaskWithPause(...args),
  loadDrama: (...args) => loadDrama(...args),
  buildSbGenMeta,
  angleToPromptFragment,
  imageReferenceUrlForApi,
  getStoryboardAssetReferenceImages: (...args) => getStoryboardAssetReferenceImages(...args),
  getSbStoryboardReferenceImages: (...args) => storyboardReferenceImageResolver(...args),
  videoClipDuration,
  storyboardUseFirstLastFrame,
  storyboardFrameCount,
  normalizeStoryboardFrameCount,
  assetImageUrl: (...args) => assetImageUrl(...args),
  assetThumbUrl: (...args) => assetThumbUrl(...args),
  assetVideoUrl: (...args) => assetVideoUrl(...args),
  recordHasPlayableVideoUrl: (...args) => recordHasPlayableVideoUrl(...args),
  openImagePreview: (...args) => openImagePreview(...args),
  confirmAdminProjectOperation,
})

function getSbVideosRef() {
  return sbVideos
}

const {
  dramaId,
  workbenchSummary,
  workbenchSummaryLoading,
  projectTitle,
  characters,
  scenes,
  props,
  storyboards,
  currentEpisode,
  currentEpisodeId,
  videoProgress,
  videoStatus,
  assetTypeForWorkbenchTab,
  applyWorkbenchSummarySettings,
  loadWorkbenchSummary,
  resetWorkbenchTabLoaded,
  markAllWorkbenchTabsLoaded,
  mergeCurrentEpisodePatch,
  applyScriptWorkbenchTab,
  applyAssetsWorkbenchTab,
  applyStoryboardsWorkbenchTab,
  applyVideoComposeWorkbenchTab,
  loadScriptWorkbenchTab,
  loadAssetWorkbenchTab,
  loadStoryboardsWorkbenchTab,
  loadVideoComposeWorkbenchTab,
  loadWorkbenchTab,
  loadInitialWorkbenchData,
} = useWorkbenchLoader({
  store,
  workbenchTabLoaded,
  filmWorkbenchTab,
  selectedEpisodeId,
  savedCurrentEpisodeNumber,
  storyInput,
  storyStyle,
  storyType,
  scriptTitle,
  generationStyle,
  projectAspectRatio,
  projectImageSpec,
  projectVideoSpec,
  videoClipDuration,
  scriptLanguage,
  defaultGenerationStyle: DEFAULT_GENERATION_STYLE,
  setProjectSettingsHydrating,
  applyProjectAiRouteSelection,
  syncStoryboardStateFromEpisode,
  loadStoryboardMedia,
  recoverAndSyncEpisodeTasks,
  groupByStoryboardId,
  getSbVideosRef,
  restoreSelectionsFromBackend,
})

function trackFilmCreateAction(_action, _payload = {}) {
  // 单机版：无埋点上报
}

const {
  currentEpisodeVideoUrl,
  getFinalizeMergeOptions,
  onGenerateVideo,
  videoBurnDialogue,
  videoErrorMsg,
  videoMusic,
  videoQuality,
  videoSfx,
  videoSubtitle,
  videoWatermark,
  videoWatermarkText,
} = useVideoWorkbench({
  store,
  genStore,
  dramaId,
  currentEpisode,
  currentEpisodeId,
  loadDrama: (...args) => loadDrama(...args),
  pollTask: (...args) => pollTask(...args),
  confirmAdminProjectOperation,
})

const storyboardGenerating = computed(() =>
  isEpisodeExtractRunning(genStore, dramaId.value, currentEpisodeId.value, GEN_RESOURCE.GENERATE_STORYBOARD)
)
/** 分镜批量生成结束后，按镜序逐个润色全能片段（仅勾选全能模式且各镜为 universal 且有正文时） */
const universalOmniPolishRunning = ref(false)
const universalOmniPolishProgress = ref({ current: 0, total: 0, label: '' })
const sbTruncatedWarning = ref(false)
const sbTruncatedDismissed = ref(false)
async function loadPipelineConcurrency() {
  try {
    const res = await aiAPI.runtimeRoutes()
    applyRuntimeRoutingPolicies(res?.routing_policies || {})
  } catch (_) {
    setPipelineConcurrencyFallback()
  }
}

function hasAssetImage(item) {
  if (!item) return false
  return !!(item.image_url || item.local_path)
}

const {
  allActiveTasks,
  taskClockNow,
  buildResourceTaskMeta,
  getRunningResourceTask,
  isResourceGenerating,
  formatElapsed,
  resourceElapsedLabel,
  clearLocalGeneratingState,
  stopResourceGeneration,
  stopSbFramePair,
  stopEpisodeTask,
  pollUntilResourceHasImage,
  pollTask,
  pollTaskWithPause,
} = useTaskRuntime({
  genStore,
  store,
  dramaId,
  currentEpisodeId,
  loadDrama,
  confirmAdminProjectOperation,
  getLocalGeneratingSets: () => ({
    generatingCharIds,
    generatingPropIds,
    generatingSceneIds,
    generatingSbImageIds,
    generatingSbFirstImageIds,
    generatingSbLastImageIds,
    generatingSbVideoIds,
  }),
  getPipelineState: () => ({
    pipelineRunning,
    pipelineCurrentStep,
    pipelinePaused,
  }),
  getGlobalGenerationState: () => ({
    storyGenerating,
    scriptGenerating,
    universalOmniPolishRunning,
    universalOmniPolishProgress,
    batchImageRunning,
    batchVideoRunning,
  }),
})

// ── Composable: Characters ────────────────────────────
const {
  showEditCharacter, editCharacterForm, editCharacterSaving, editCharacterPromptGenerating,
  extractingCharAppearance, extractingAnchors, addCharRefImage, addCharRefFileInput,
  charactersGenerating, generatingCharIds, sd2CertifyingId, showCharSd2Cert, charSd2CertPayload,
  sd2VoiceUploadingId,
  showCharLibrary, charLibraryList, charLibraryLoading, charLibraryPage, charLibraryPageSize,
  charLibraryTotal, charLibraryKeyword, charLibraryTab,
  dramaAllCharList, dramaAllCharLoading, dramaAllCharPage, dramaAllCharPageSize, dramaAllCharTotal, dramaAllCharKeyword,
  showEditCharLibrary, editCharLibraryForm,
  editCharLibrarySaving, addingCharToLibraryId, addingCharToMaterialId, addingCharFromLibraryId,
  charRoleLabel, onGenerateCharacters: onGenerateCharactersRaw, openAddCharacter, stopCharacterPromptPoll, editCharacter,
  saveCharRefImageIfAny, submitEditCharacter, doGenerateCharacterPrompt, doExtractCharFromImage,
  extractIdentityAnchors, clearCharRefImage, onCloseCharDialog, onDeleteCharacter: onDeleteCharacterRaw, onGenerateCharacterImage: onGenerateCharacterImageRaw, onSd2CertifyCharacter, onSd2CertifyRefresh, sd2ActionLabel, onSd2PrimaryAction, openCharSd2CertDialog,
  onSd2VoicePrimaryAction, onSd2VoiceReplace, sd2VoiceActionLabel, playSd2Voice,
  loadCharLibraryList, debouncedLoadCharLibrary, loadDramaAllCharList, debouncedLoadDramaAllCharList,
  onCharLibraryDialogOpen, onCharLibraryTabChange, isCharAddToEpisodeLoading,
  openEditCharLibrary, submitEditCharLibrary,
  onDeleteCharLibrary, onAddCharacterToLibrary, onAddCharacterToMaterialLibrary,
  onAddCharFromLibrary, onAddDramaCharToEpisode,
} = useCharacters({ store, dramaId, currentEpisodeId, getSelectedStyle, loadDrama, pollTask, pollUntilResourceHasImage, hasAssetImage, isAdminUser, canManageLibrary })

// ── Composable: Props ──────────────────────────────────
const {
  showAddProp, addPropSaving, addPropForm,
  showEditProp, editPropForm, editPropSaving, editPropPromptGenerating,
  extractingPropDesc, addPropRefImage, addPropRefFileInput,
  addPropAddRefImage, addPropAddRefFileInput, extractingPropAddDesc,
  propsExtracting, generatingPropIds,
  showPropLibrary, propLibraryList, propLibraryLoading, propLibraryPage, propLibraryPageSize,
  propLibraryTotal, propLibraryKeyword, propLibraryTab,
  dramaAllPropList, dramaAllPropLoading, dramaAllPropPage, dramaAllPropPageSize, dramaAllPropTotal, dramaAllPropKeyword,
  showEditPropLibrary, editPropLibraryForm,
  editPropLibrarySaving, addingPropToLibraryId, addingPropToMaterialId, addingPropFromLibraryId,
  onExtractProps: onExtractPropsRaw, stopPropPromptPoll, editProp, doGeneratePropPrompt, savePropRefImageIfAny,
  clearPropRefImage, doExtractPropFromImage, submitEditProp, submitAddProp,
  onClosePropDialog, onDeleteProp: onDeletePropRaw, onGeneratePropImage: onGeneratePropImageRaw,
  loadPropLibraryList, debouncedLoadPropLibrary, loadDramaAllPropList, debouncedLoadDramaAllPropList,
  onPropLibraryDialogOpen, onPropLibraryTabChange, isPropAddToEpisodeLoading,
  openEditPropLibrary, submitEditPropLibrary,
  onDeletePropLibrary, onAddPropToLibrary, onAddPropToMaterialLibrary,
  onAddPropFromLibrary, onAddDramaPropToEpisode,
  doExtractFromRef2,
} = usePropsComposable({ store, dramaId, currentEpisodeId, getSelectedStyle, loadDrama, pollTask, pollUntilResourceHasImage, hasAssetImage, isAdminUser, canManageLibrary })

// ── Composable: Scenes ─────────────────────────────────
const {
  showEditScene, editSceneForm, editSceneSaving, editScenePromptGenerating,
  extractingSceneDesc, addSceneRefImage, addSceneRefFileInput,
  scenesExtracting, generatingSceneIds,
  // 场景多视角额外 state（由 FilmCreate 管理）
  showSceneLibrary, sceneLibraryList, sceneLibraryLoading, sceneLibraryPage, sceneLibraryPageSize,
  sceneLibraryTotal, sceneLibraryKeyword, sceneLibraryTab,
  dramaAllSceneList, dramaAllSceneLoading, dramaAllScenePage, dramaAllScenePageSize, dramaAllSceneTotal, dramaAllSceneKeyword,
  showEditSceneLibrary, editSceneLibraryForm,
  editSceneLibrarySaving, addingSceneToLibraryId, addingSceneToMaterialId, addingSceneFromLibraryId,
  onExtractScenes: onExtractScenesRaw, openAddScene, stopScenePromptPoll, editScene, doGenerateScenePrompt, doGenerateSceneSinglePrompt,
  saveSceneRefImageIfAny, clearSceneRefImage, doExtractSceneFromImage, submitEditScene,
  onCloseSceneDialog, onDeleteScene: onDeleteSceneRaw, onGenerateSceneImage: onGenerateSceneImageRaw,
  loadSceneLibraryList, debouncedLoadSceneLibrary, loadDramaAllSceneList, debouncedLoadDramaAllSceneList,
  onSceneLibraryDialogOpen, onSceneLibraryTabChange, isSceneAddToEpisodeLoading,
  openEditSceneLibrary, submitEditSceneLibrary,
  onDeleteSceneLibrary, onAddSceneToLibrary, onAddSceneToMaterialLibrary,
  onAddSceneFromLibrary, onAddDramaSceneToEpisode,
} = useScenes({ store, dramaId, currentEpisodeId, getSelectedStyle, scriptLanguage, loadDrama, pollTask, pollUntilResourceHasImage, hasAssetImage, dramaAPI, isAdminUser, canManageLibrary })

async function onGenerateCharacters() {
  if (!(await confirmAdminProjectOperation('提取角色'))) return
  trackFilmCreateAction('generate_characters_click')
  const beforeCount = (store.currentEpisode?.characters || []).length
  try {
    await onGenerateCharactersRaw(textAiPayload())
    const afterCount = (store.currentEpisode?.characters || []).length
    trackFilmCreateAction('generate_characters_complete', {
      extra: { before_count: beforeCount, after_count: afterCount },
    })
  } catch (e) {
    trackFilmCreateAction('generate_characters_failed', {
      extra: { message: String(e?.message || 'failed').slice(0, 120) },
    })
    throw e
  }
}

async function onExtractProps() {
  if (!(await confirmAdminProjectOperation('提取道具'))) return
  trackFilmCreateAction('extract_props_click')
  const beforeCount = (store.props || []).length
  try {
    await onExtractPropsRaw(textAiPayload())
    const afterCount = (store.props || []).length
    trackFilmCreateAction('extract_props_complete', {
      extra: { before_count: beforeCount, after_count: afterCount },
    })
  } catch (e) {
    trackFilmCreateAction('extract_props_failed', {
      extra: { message: String(e?.message || 'failed').slice(0, 120) },
    })
    throw e
  }
}

async function onExtractScenes() {
  if (!(await confirmAdminProjectOperation('提取场景'))) return
  trackFilmCreateAction('extract_scenes_click')
  const beforeCount = (store.currentEpisode?.scenes || []).length
  try {
    await onExtractScenesRaw(textAiPayload())
    const afterCount = (store.currentEpisode?.scenes || []).length
    trackFilmCreateAction('extract_scenes_complete', {
      extra: { before_count: beforeCount, after_count: afterCount },
    })
  } catch (e) {
    trackFilmCreateAction('extract_scenes_failed', {
      extra: { message: String(e?.message || 'failed').slice(0, 120) },
    })
    throw e
  }
}

async function onGenerateCharacterImage(char) {
  if (!(await confirmAdminProjectOperation(`生成角色「${char?.name || char?.id || ''}」图片`))) return
  return onGenerateCharacterImageRaw(char, { ...imageAiPayload(), ...workflowPresetPayload('character') })
}

async function onGeneratePropImage(prop) {
  if (!(await confirmAdminProjectOperation(`生成道具「${prop?.name || prop?.id || ''}」图片`))) return
  return onGeneratePropImageRaw(prop, { ...imageAiPayload(), ...workflowPresetPayload('prop') })
}

async function onGenerateSceneImage(scene) {
  if (!(await confirmAdminProjectOperation(`生成场景「${scene?.location || scene?.id || ''}」图片`))) return
  return onGenerateSceneImageRaw(scene, { ...imageAiPayload(), ...workflowPresetPayload('scene') })
}

async function onDeleteCharacter(char) {
  if (!(await confirmAdminProjectOperation(`删除角色「${char?.name || char?.id || ''}」`))) return
  return onDeleteCharacterRaw(char)
}

async function onDeleteProp(prop) {
  if (!(await confirmAdminProjectOperation(`删除道具「${prop?.name || prop?.id || ''}」`))) return
  return onDeletePropRaw(prop)
}

async function onDeleteScene(scene) {
  if (!(await confirmAdminProjectOperation(`删除场景「${scene?.location || scene?.id || ''}」`))) return
  return onDeleteSceneRaw(scene)
}



// 资源管理大面板及子区块折叠状态
const resourcePanelCollapsed = ref(false)
const charactersBlockCollapsed = ref(false)
const propsBlockCollapsed = ref(false)
const scenesBlockCollapsed = ref(false)

// 分镜行内编辑状态（按 storyboard id 存储）
// navCollapsed/storyboardMenuExpanded/toggleNav → 已移至 useNavigation composable

/** 左侧导航各步骤状态 */
const navSteps = computed(() => {
  const epRunning = genStore.getRunningForEpisode(dramaId.value, currentEpisodeId.value)
  // 剧本
  const hasScript = !!(scriptContent?.value?.trim())
  const scriptStatus = (storyGenerating.value || scriptGenerating.value)
    ? 'generating'
    : hasScript ? 'done' : 'pending'

  // 角色
  const charList = characters.value || []
  const charDone = charList.length > 0 && charList.every(c => hasAssetImage(c))
  const charGen = charactersGenerating.value || generatingCharIds.size > 0
    || epRunning.some((t) => t.resourceType === GEN_RESOURCE.CHAR_IMAGE || t.resourceType === GEN_RESOURCE.EXTRACT_CHARACTERS)
  const charStatus = charGen ? 'generating' : charDone ? 'done' : charList.length > 0 ? 'partial' : 'pending'

  // 道具
  const propList = props.value || []
  const propDone = propList.length > 0 && propList.every(p => hasAssetImage(p))
  const propGen = propsExtracting.value || generatingPropIds.size > 0
    || epRunning.some((t) => t.resourceType === GEN_RESOURCE.PROP_IMAGE || t.resourceType === GEN_RESOURCE.EXTRACT_PROPS)
  const propStatus = propGen ? 'generating' : propDone ? 'done' : propList.length > 0 ? 'partial' : 'pending'

  // 场景
  const sceneList = scenes.value || []
  const sceneDone = sceneList.length > 0 && sceneList.every(s => hasAssetImage(s))
  const sceneGen = scenesExtracting.value || generatingSceneIds.size > 0
    || epRunning.some((t) => t.resourceType === GEN_RESOURCE.SCENE_IMAGE || t.resourceType === GEN_RESOURCE.EXTRACT_SCENES)
  const sceneStatus = sceneGen ? 'generating' : sceneDone ? 'done' : sceneList.length > 0 ? 'partial' : 'pending'

  // 分镜脚本
  const sbList = storyboards.value || []
  const sbScriptDone = sbList.length > 0
  const sbScriptGen = storyboardGenerating.value || universalOmniPolishRunning.value
    || epRunning.some((t) => t.resourceType === GEN_RESOURCE.GENERATE_STORYBOARD)
  const sbScriptStatus = sbScriptGen ? 'generating' : sbScriptDone ? 'done' : 'pending'

  // 分镜图
  const sbImgDone = sbList.length > 0 && sbList.every(sb => hasSbImage(sb))
  const sbImgGen = generatingSbImageIds.size > 0 || batchImageRunning.value || epRunning.some((t) =>
    t.resourceType === GEN_RESOURCE.SB_IMAGE
    || t.resourceType === GEN_RESOURCE.SB_FIRST_IMAGE
    || t.resourceType === GEN_RESOURCE.SB_LAST_IMAGE
  )
  const sbImgStatus = sbImgGen ? 'generating' : sbImgDone ? 'done' : sbList.length > 0 ? 'partial' : 'pending'

  // 视频
  const sbVideoAllDone = sbList.length > 0 && sbList.every(sb => getSbAllVideos(sb.id).length > 0)
  const sbVideoSome = sbList.some(sb => getSbAllVideos(sb.id).length > 0)
  const sbVideoGen = batchVideoRunning.value || generatingSbVideoIds.size > 0
    || epRunning.some((t) => t.resourceType === GEN_RESOURCE.SB_VIDEO)
  const videoStatus = sbVideoGen ? 'generating' : sbVideoAllDone ? 'done' : sbVideoSome ? 'partial' : 'pending'

  return [
    { key: 'script',   label: '故事剧本',   anchor: 'anchor-script',     status: scriptStatus,    count: hasScript ? 1 : 0 },
    { key: 'chars',    label: '角色',        anchor: 'anchor-characters', status: charStatus,      count: charList.length },
    { key: 'props',    label: '道具',        anchor: 'anchor-props',      status: propStatus,      count: propList.length },
    { key: 'scenes',   label: '场景',        anchor: 'anchor-scenes',     status: sceneStatus,     count: sceneList.length },
    { key: 'sb',       label: '分镜脚本',   anchor: 'anchor-storyboard', status: sbScriptStatus,  count: sbList.length },
    { key: 'sbimg',    label: '分镜图',      anchor: 'anchor-storyboard', status: sbImgStatus,     count: sbList.length },
    { key: 'video',    label: '分镜视频',   anchor: 'anchor-video',      status: videoStatus,     count: 0 },
  ]
})

const {
  baseUrl,
  previewImageUrl,
  previewGallery,
  previewImageIndex,
  imageUrl,
  staticThumbUrlFromRel,
  thumbImageUrl,
  assetImageUrl,
  assetThumbUrl,
  collectImagePreviewGallery,
  openImagePreview,
  closeImagePreview,
  showPreviewImage,
  onImagePreviewKeydown,
  assetVideoUrl,
  isHttpVideoUrl,
  recordHasPlayableVideoUrl,
} = useMediaPreview({
  getCharacters: () => characters.value || [],
  getProps: () => props.value || [],
  getScenes: () => scenes.value || [],
  getStoryboardImagesMap: () => sbImages.value || {},
  getStoryboards: () => store.storyboards || [],
  getCharLibraryList: () => charLibraryList.value || [],
  getDramaAllCharList: () => dramaAllCharList.value || [],
  getPropLibraryList: () => propLibraryList.value || [],
  getDramaAllPropList: () => dramaAllPropList.value || [],
  getSceneLibraryList: () => sceneLibraryList.value || [],
  getDramaAllSceneList: () => dramaAllSceneList.value || [],
  parseExtraImages,
  localPathToUrl,
})

const storyboardVideoWorkflow = useStoryboardVideoWorkflow({
  aiAPI,
  videosAPI,
  storyboardsAPI,
  uploadAPI,
  store,
  genStore,
  genResource: GEN_RESOURCE,
  dramaId,
  currentEpisodeId,
  baseUrl,
  projectAspectRatio,
  videoResolution,
  pipelineRunning,
  pipelineVideoConcurrency,
  videoFrameContiguity,
  sbUniversalSegmentText,
  sbVideos,
  sbVideoErrors,
  sbSelectedVideoId,
  batchVideoRunning,
  batchVideoStopping,
  batchVideoProgress,
  batchVideoErrors,
  generatingSbVideoIds,
  storyboardUseFirstLastFrame,
  assetImageUrl,
  assetThumbUrl,
  imageUrl,
  getSbFirstImage,
  getSbImage,
  getSbLastImage,
  getSbPrimaryImages,
  getSbAllImages,
  getSbSelectedScene,
  getSbSelectedCharacters,
  getSbSelectedProps,
  isAuxStoryboardImage,
  hasAssetImage,
  storyboardAuxRoleOptions,
  auxRoleLabel,
  keyframeTimelineLine,
  isSbUniversalMode,
  getSbVideoDurationForApi,
  buildSbGenMeta,
  getSelectedStyle,
  videoAiPayload,
  pollTask,
  loadStoryboardMedia,
  loadSingleStoryboardMedia,
  confirmAdminProjectOperation,
  recordHasPlayableVideoUrl,
})
const {
  ACTIVE_VIDEO_AI_CONFIG_TTL_MS,
  buildSbAuxTimelinePrompt,
  buildSbKeyframeTimelinePrompt,
  buildSbVideoContextPrompt,
  buildSbVideoPromptForApi,
  canUseUniversalOmniVideoApi,
  captureVideoLastFrame,
  collectSbAssetReferenceItems,
  collectSbClassicVideoReferenceAbsoluteUrls,
  collectSbOmniReferenceAbsoluteUrls,
  collectSbSceneOnlyReferenceAbsoluteUrls,
  collectSbVideoReferenceItems,
  confirmUniversalNonSeedance2Video,
  getActiveVideoAiConfig,
  getMainImageUrlForVideo,
  getSbConfirmedKeyframeImages,
  getSbFirstFrameUrl,
  getSbLastFrameUrl,
  getSbLatestAuxImages,
  getSbLocalImage,
  getSbStoryboardReferenceImages,
  getSbUniversalOmniRefSlots,
  isSeedance2VideoModel,
  latestStoryboardKeyframeBatch,
  onGenerateSbVideo,
  sbCanSubmitVideo,
  sbUniversalSegmentTrimmed,
  sbVideoFirstLastUrls,
  sortStoryboardReferenceImages,
  startBatchVideoGeneration,
  stopBatchVideoGeneration,
  storyboardImageTimeValue,
  storyboardRefName,
  toAbsoluteImageUrl,
  videoModelNameFromAiConfig,
} = storyboardVideoWorkflow
invalidateActiveVideoAiConfigCache = storyboardVideoWorkflow.invalidateActiveVideoAiConfigCache
storyboardReferenceImageResolver = getSbStoryboardReferenceImages
/** 分镜 TTS 试听：避免多条同时播放 */
let sbTtsPreviewAudio = null
// 角色/道具/场景 上传图片
const resourceImageFileInput = ref(null)
const resourceUploadType = ref(null) // 'character' | 'prop' | 'scene'
const resourceUploadId = ref(null)
const uploadingResourceId = ref(null) // 'char-1' | 'prop-2' | 'scene-3'
const dragOverResourceKey = ref(null) // 'char-1' | 'prop-2' | 'scene-3'
function getFirstImageFile(dataTransfer) {
  if (!dataTransfer?.files?.length) return null
  const file = Array.from(dataTransfer.files).find((f) => f.type.startsWith('image/'))
  return file || null
}

// ── 参考图文件读取工具 ──────────────────────────────────
function readFileAsRefImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (ev) => resolve({ dataUrl: ev.target.result, filename: file.name })
    reader.readAsDataURL(file)
  })
}

/**
 * 处理角色/道具/场景参考图文件选择（<input type="file"> change 事件）
 * type: 'character' | 'prop' | 'scene'
 */
async function onRefImageFileChange(type, event) {
  const file = event.target?.files?.[0]
  if (!file) return
  const result = await readFileAsRefImage(file)
  if (type === 'character') addCharRefImage.value = result
  else if (type === 'prop') addPropRefImage.value = result
  else if (type === 'scene') addSceneRefImage.value = result
  event.target.value = ''
}

/**
 * 处理角色/道具/场景参考图拖放（drop 事件）
 * type: 'character' | 'prop' | 'scene'
 */
async function onRefImageDrop(type, event) {
  const file = getFirstImageFile(event.dataTransfer)
  if (!file) return
  const result = await readFileAsRefImage(file)
  if (type === 'character') addCharRefImage.value = result
  else if (type === 'prop') addPropRefImage.value = result
  else if (type === 'scene') addSceneRefImage.value = result
}

/**
 * 处理"添加道具"简单弹窗的参考图文件选择
 * type: 'addProp'
 */
async function onRefImageFileChange2(type, event) {
  const file = event.target?.files?.[0]
  if (!file) return
  const result = await readFileAsRefImage(file)
  if (type === 'addProp') addPropAddRefImage.value = result
  event.target.value = ''
}

/**
 * 处理"添加道具"简单弹窗的参考图拖放
 * type: 'addProp'
 */
async function onRefImageDrop2(type, event) {
  const file = getFirstImageFile(event.dataTransfer)
  if (!file) return
  const result = await readFileAsRefImage(file)
  if (type === 'addProp') addPropAddRefImage.value = result
}

/**
 * 从本地选择（尚未保存到服务器）的参考图中提取特征描述
 * type: 'character' | 'prop' | 'scene'
 */
async function doExtractFromRef(type) {
  if (type === 'character') {
    const refImage = addCharRefImage.value
    if (!refImage) return
    extractingCharAppearance.value = true
    try {
      const name = editCharacterForm.value?.name || ''
      const res = await uploadAPI.extractDescriptionFromImage('character', refImage.dataUrl, name)
      if (res?.description && editCharacterForm.value) {
        editCharacterForm.value.appearance = res.description
        ElMessage.success('已从参考图提取外貌描述')
      }
    } catch (e) {
      ElMessage.error(e.message || '提取失败，请检查 AI 配置中是否有支持视觉的模型')
    } finally {
      extractingCharAppearance.value = false
    }
  } else if (type === 'prop') {
    const refImage = addPropRefImage.value
    if (!refImage) return
    extractingPropDesc.value = true
    try {
      const name = editPropForm.value?.name || ''
      const res = await uploadAPI.extractDescriptionFromImage('prop', refImage.dataUrl, name)
      if (res?.description && editPropForm.value) {
        editPropForm.value.description = res.description
        ElMessage.success('已从参考图提取特征描述')
      }
    } catch (e) {
      ElMessage.error(e.message || '提取失败，请检查 AI 配置中是否有支持视觉的模型')
    } finally {
      extractingPropDesc.value = false
    }
  } else if (type === 'scene') {
    const refImage = addSceneRefImage.value
    if (!refImage) return
    extractingSceneDesc.value = true
    try {
      const name = editSceneForm.value?.name || ''
      const res = await uploadAPI.extractDescriptionFromImage('scene', refImage.dataUrl, name)
      if (res?.description && editSceneForm.value) {
        editSceneForm.value.description = res.description
        ElMessage.success('已从参考图提取场景描述')
      }
    } catch (e) {
      ElMessage.error(e.message || '提取失败，请检查 AI 配置中是否有支持视觉的模型')
    } finally {
      extractingSceneDesc.value = false
    }
  }
}

function onResourceDragOver(e, type, id) {
  e.preventDefault()
  e.stopPropagation()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  const key = type === 'character' ? 'char-' : type === 'prop' ? 'prop-' : 'scene-'
  dragOverResourceKey.value = key + id
}
function onResourceDragLeave(e, key) {
  e.preventDefault()
  if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return
  if (key && dragOverResourceKey.value !== key) return
  dragOverResourceKey.value = null
}
function onResourceDrop(e, type, id) {
  e.preventDefault()
  e.stopPropagation()
  dragOverResourceKey.value = null
  const file = getFirstImageFile(e.dataTransfer)
  if (file) doUploadResourceImage(type, id, file)
}
function getGeneratingSetsBag() {
  return {
    generatingCharIds,
    generatingPropIds,
    generatingSceneIds,
    generatingSbImageIds,
    generatingSbFirstImageIds,
    generatingSbLastImageIds,
    generatingSbVideoIds,
  }
}

function buildSbGenMeta(sb, resourceType, labelPrefix) {
  const num = sb?.storyboard_number ?? sb?.id
  const epNum = store.currentEpisode?.episode_number
  const dramaTitle = store.drama?.title || ''
  const epLabel = dramaTitle ? `${dramaTitle} · 第${epNum ?? ''}集` : `第${epNum ?? ''}集`
  return {
    dramaId: dramaId.value,
    episodeId: currentEpisodeId.value,
    dramaTitle,
    episodeNumber: epNum,
    resourceType,
    resourceId: sb.id,
    label: `${epLabel} ${labelPrefix} #${num}`,
  }
}

const recoveringEpisodeTaskKeys = new Set()

async function recoverAndSyncEpisodeTasks(epId) {
  const did = dramaId.value
  const eid = epId ?? currentEpisodeId.value
  if (!did || !eid) return
  const key = `${did}:${eid}`
  if (recoveringEpisodeTaskKeys.has(key)) return
  recoveringEpisodeTaskKeys.add(key)
  const ctx = buildEpisodeContext(store, did, eid)
  try {
    await genStore.recoverPendingForEpisode({
      ...ctx,
      ElMessage,
      callbacks: {
        onStoryboardMedia: (sbId) => loadSingleStoryboardMedia(sbId),
        onDramaRefresh: () => loadDrama(),
        onEpisodeMergeComplete: () => {
          store.setVideoStatus('done', did, eid)
          store.setVideoProgress(100, did, eid)
        },
        onEpisodeMergeFailed: (err) => {
          store.setVideoStatus('error', did, eid)
          videoErrorMsg.value = err || '视频生成失败'
        },
      },
    })
    syncGeneratingSetsFromStore(genStore, did, eid, getGeneratingSetsBag())
    const mergeRunning = genStore.getRunningForEpisode(did, eid).some(
      (t) => t.resourceType === GEN_RESOURCE.EPISODE_MERGE
    )
    if (mergeRunning) {
      store.setVideoStatus('generating', did, eid)
    }
  } finally {
    recoveringEpisodeTaskKeys.delete(key)
  }
}

function imageReferenceUrlForApi(item) {
  const url = assetImageUrl(item)
  return url || ''
}

function getStoryboardAssetReferenceImages(sbId) {
  const refs = []
  const add = (url) => {
    if (url && !refs.includes(url)) refs.push(url)
  }
  const scene = getSbSelectedScene(sbId)
  if (scene) add(imageReferenceUrlForApi(scene))
  getSbSelectedCharacters(sbId).forEach((c) => add(imageReferenceUrlForApi(c)))
  getSbSelectedProps(sbId).forEach((p) => add(imageReferenceUrlForApi(p)))
  return refs.filter(Boolean)
}

function onEpisodeSelect(epId) {
  if (epId == null) {
    store.setCurrentEpisode(null)
    store.setScriptContent('')
    scriptTitle.value = ''
    syncStoryboardStateFromEpisode(null)
    return
  }
  ;['characters', 'scenes', 'props', 'storyboards', 'videoCompose'].forEach((key) => {
    workbenchTabLoaded[key] = false
  })
  const list = store.drama?.episodes || []
  const ep = list.find((e) => Number(e.id) === Number(epId))
  if (!ep) return
  store.setCurrentEpisode(ep)
  store.setScriptContent(ep.script_content || '')
  scriptTitle.value = ep.title || '第' + (ep.episode_number || 0) + '集'
  syncStoryboardStateFromEpisode(ep)
  loadWorkbenchTab(filmWorkbenchTab.value, { force: true }).catch(() => {})
  recoverAndSyncEpisodeTasks(epId)
}

let loadDramaPromise = null

async function loadDrama({ force = false, recoverTasks = false } = {}) {
  if (!store.dramaId) return
  if (!force && loadDramaPromise) return loadDramaPromise
  loadDramaPromise = (async () => {
    let d = await dramaAPI.get(store.dramaId)
    d = await backfillDramaStylePromptMetadataIfNeeded(dramaAPI, store.dramaId, d)
    store.setDrama(d)
    setProjectSettingsHydrating(true)
    try {
      // 恢复「故事生成」框的梗概（项目 description 存的是故事梗概）和项目级生成设置
      storyInput.value = (d.description || '').toString().trim()
      storyStyle.value = (d.metadata && d.metadata.story_style) ? d.metadata.story_style : ''
      storyType.value = d.genre || ''
      hydrateProjectSettingsFromDrama(d)
      hydrateStoryboardSettingsFromMetadata(d.metadata || {})
      applyProjectAiRouteSelection(d.metadata || {})
    } finally {
      nextTick(() => {
        setProjectSettingsHydrating(false)
      })
    }
    const list = d.episodes || []
    // 优先保持当前选中的集（按 id 在最新列表中查找），避免 AI 生成角色等操作后误切到其他集
    const currentId = selectedEpisodeId.value
    let ep = currentId != null ? list.find((e) => Number(e.id) === Number(currentId)) : null
    if (!ep) {
      const wantNum = savedCurrentEpisodeNumber.value
      ep = list.find((e) => Number(e.episode_number) === Number(wantNum)) || list[0] || null
    }
    store.setCurrentEpisode(ep)
    if (ep) {
      store.setScriptContent(ep.script_content || '')
      scriptTitle.value = ep.title || '第' + (ep.episode_number || 0) + '集'
      selectedEpisodeId.value = ep.id
    } else {
      store.setScriptContent('')
      scriptTitle.value = ''
      selectedEpisodeId.value = null
    }
    syncStoryboardStateFromEpisode(ep)
    await loadStoryboardMedia()
    markAllWorkbenchTabsLoaded()
    loadWorkbenchSummary({ applySettings: false })
    if (recoverTasks) {
      await recoverAndSyncEpisodeTasks(ep?.id)
    }
  })()
  try {
    return await loadDramaPromise
  } catch (e) {
    ElMessage.error(e.message || '加载失败')
  } finally {
    loadDramaPromise = null
  }
}

function onLastFrameLayoutLockChange() {
  scheduleProjectSettingsSave(false)
}

/** 同镜号多行时只保留 id 最大的一条（与后端 dedupe 一致，避免「影响的分镜」重复 #N） */
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

/** 返回包含指定角色的所有分镜（已排序） */
function getCharAffectedStoryboards(charId) {
  const matched = (storyboards.value || []).filter((sb) => {
    if (!sb.characters) return false
    const chars = Array.isArray(sb.characters) ? sb.characters : []
    return chars.some((c) => Number(typeof c === 'object' && c != null ? c.id : c) === Number(charId))
  })
  return dedupeStoryboardsForAssetLink(matched)
}

/** 返回指定场景关联的所有分镜 */
function getSceneAffectedStoryboards(sceneId) {
  const matched = (storyboards.value || []).filter(
    (sb) => sb.scene_id != null && Number(sb.scene_id) === Number(sceneId)
  )
  return dedupeStoryboardsForAssetLink(matched)
}

/** 返回包含指定道具的所有分镜（已排序） */
function getPropAffectedStoryboards(propId) {
  const matched = (storyboards.value || []).filter((sb) => {
    if (!sb.prop_ids) return false
    const pids = Array.isArray(sb.prop_ids) ? sb.prop_ids : []
    return pids.some((pid) => Number(pid) === Number(propId))
  })
  return dedupeStoryboardsForAssetLink(matched)
}

/** 点击分镜 chip → 滚动到对应分镜行 */
async function scrollToStoryboard(sbId) {
  filmWorkbenchTab.value = 'storyboards'
  await nextTick()
  const el = document.getElementById('sb-' + sbId)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

/** 对关联分镜批量重新生成图片 */
async function onRegenAffectedSbImages(assetKey, affectedBoards) {
  if (!affectedBoards.length || regenSbImagesForAsset.has(assetKey)) return
  try {
    await ElMessageBox.confirm(
      `将为 ${affectedBoards.length} 个关联分镜重新生成图片（#${affectedBoards.map((s) => s.storyboard_number).join('、#')}），原有图片将被覆盖，是否继续？`,
      '重新生成关联分镜图',
      { confirmButtonText: '确认生成', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }
  regenSbImagesForAsset.add(assetKey)
  // 用 Map 存进度以便响应式更新
  if (!regenSbImagesProgress.value) regenSbImagesProgress.value = {}
  regenSbImagesProgress.value[assetKey] = { current: 0, total: affectedBoards.length }
  let failed = 0
  try {
    for (let i = 0; i < affectedBoards.length; i++) {
      regenSbImagesProgress.value[assetKey] = { current: i + 1, total: affectedBoards.length }
      const sb = affectedBoards[i]
      try {
        const useFirstLast = storyboardUseFirstLastFrame.value
        if (useFirstLast) {
          await submitSbFrameImageTask(sb, 'first', { dramaIdValue: dramaId.value, style: getSelectedStyle() })
          await submitSbFrameImageTask(sb, 'last', { dramaIdValue: dramaId.value, style: getSelectedStyle() })
        } else {
          const result = await createStoryboardImageTasks(sb, {
            prompt: sb.polished_prompt || sb.image_prompt || sb.description || '',
            dramaIdValue: dramaId.value,
            style: getSelectedStyle(),
          })
          if (result.failed > 0) failed++
        }
      } catch (_) {
        failed++
      }
      if (i < affectedBoards.length - 1) await new Promise((r) => setTimeout(r, 500))
    }
    if (failed === 0) ElMessage.success(`已重新生成 ${affectedBoards.length} 张关联分镜图`)
    else ElMessage.warning(`完成，${failed}/${affectedBoards.length} 条失败`)
  } finally {
    regenSbImagesForAsset.delete(assetKey)
    if (regenSbImagesProgress.value) delete regenSbImagesProgress.value[assetKey]
  }
}

function updateStoryboardDialogue(sbId) {
  // 可在此防抖后调用后端更新 dialogue
}

/** 将当前剧本内容保存到后端（创建/更新项目与集数），供「保存剧本」与「AI 生成」后自动保存共用 */
async function saveScriptToBackend(content) {
  const trimmed = (content ?? '').toString().trim()
  if (!trimmed) return
  const parsed = parseScriptIntoEpisodes(trimmed)
  const multiFromMarkers = parsed.split && parsed.episodes.length >= 2
  const toPayload = (list) =>
    list.map((e, i) => ({
      episode_number: i + 1,
      title: (e.title && String(e.title).trim()) || '第' + (i + 1) + '集',
      script_content: e.script_content ?? '',
      description: null,
      duration: 0,
    }))

  let dramaId = store.dramaId
  const curEp = store.currentEpisode
  if (!dramaId) {
    const drama = await dramaAPI.create({
      title: scriptTitle.value || '新故事',
      description: storyInput.value?.trim() || trimmed.slice(0, 200),
      genre: storyType.value || undefined,
      style: generationStyle.value || undefined,
      metadata: {
        ...projectStylePromptMetadata(),
        ...projectMediaSpecMetadata(),
        [AI_ROUTE_METADATA_KEY]: projectAiRouteSelectionForSave(),
        story_style: storyStyle.value || undefined,
        aspect_ratio: projectAspectRatio.value || '16:9',
        video_clip_duration: videoClipDuration.value || 10,
        script_language: scriptLanguage.value || 'zh',
      },
    })
    store.setDrama(drama)
    dramaId = drama.id
    savedCurrentEpisodeNumber.value = 1
    const first = parsed.episodes[0] || { title: '', script_content: trimmed }
    const episodes = multiFromMarkers
      ? toPayload(parsed.episodes)
      : [
          {
            episode_number: 1,
            title: scriptTitle.value || first.title || '第1集',
            script_content: first.script_content || trimmed,
          },
        ]
    await dramaAPI.saveEpisodes(dramaId, episodes)
    await loadDrama()
    if (route.params.id === 'new') {
      router.replace('/film/' + dramaId)
    }
    if (multiFromMarkers) {
      ElMessage.success(`已按「第N集/章/节」拆分为 ${episodes.length} 集`)
    }
    return { created: true }
  }
  if (multiFromMarkers) {
    savedCurrentEpisodeNumber.value = 1
    const payload = toPayload(parsed.episodes)
    await dramaAPI.saveEpisodes(dramaId, payload)
    if (storyInput.value?.trim()) {
      await dramaAPI.saveOutline(dramaId, {
        summary: storyInput.value.trim(),
        genre: storyType.value || undefined,
        style: generationStyle.value || undefined,
        metadata: {
          ...projectStylePromptMetadata(),
          ...projectMediaSpecMetadata(),
          [AI_ROUTE_METADATA_KEY]: projectAiRouteSelectionForSave(),
          story_style: storyStyle.value || undefined,
          aspect_ratio: projectAspectRatio.value || '16:9',
          video_clip_duration: videoClipDuration.value || 10,
          script_language: scriptLanguage.value || 'zh',
        },
      }).catch(() => {})
    }
    await loadDrama()
    ElMessage.success(`已按「第N集/章/节」拆分为 ${payload.length} 集`)
    return { created: false, splitEpisodes: true }
  }
  const episodes = store.drama?.episodes || []
  savedCurrentEpisodeNumber.value = curEp?.episode_number ?? 1
  const updated = episodes.map((ep, i) => {
    const num = ep.episode_number ?? i + 1
    const isCurrent = curEp && Number(ep.id) === Number(curEp.id)
    const first = parsed.episodes[0]
    const singleBody = first?.script_content ?? trimmed
    const singleTitle = first?.title && String(first.title).trim()
    return {
      episode_number: num,
      title: isCurrent
        ? scriptTitle.value || singleTitle || '第' + num + '集'
        : ep.title || '',
      script_content: isCurrent ? (parsed.episodes.length === 1 && singleTitle ? singleBody : trimmed) : (ep.script_content || ''),
      description: ep.description,
      duration: ep.duration,
    }
  })
  if (updated.length === 0) {
    updated.push({ episode_number: 1, title: scriptTitle.value || '第1集', script_content: trimmed })
  }
  await dramaAPI.saveEpisodes(dramaId, updated)
  if (storyInput.value?.trim()) {
    await dramaAPI.saveOutline(dramaId, {
      summary: storyInput.value.trim(),
      genre: storyType.value || undefined,
      style: generationStyle.value || undefined,
      metadata: {
        ...projectStylePromptMetadata(),
        ...projectMediaSpecMetadata(),
        [AI_ROUTE_METADATA_KEY]: projectAiRouteSelectionForSave(),
        story_style: storyStyle.value || undefined,
        aspect_ratio: projectAspectRatio.value || '16:9',
        video_clip_duration: videoClipDuration.value || 10,
        script_language: scriptLanguage.value || 'zh',
      },
    }).catch(() => {})
  }
  await loadDrama()
  return { created: false }
}

/**
 * @param {boolean} includeGenerationStyle - 仅在选择「画面风格」为 true：写入 dramas.style 与 style_prompt_*。
 * 其它项目设置改为 false，避免界面未刷新时仍用旧的 generationStyle 覆盖外部已更新的画风（如直接调 API PUT outline）。
 */
async function saveProjectSettings(includeGenerationStyle = false) {
  if (!store.dramaId) return
  const metadata = {
    ...projectMediaSpecMetadata(),
    [AI_ROUTE_METADATA_KEY]: projectAiRouteSelectionForSave(),
    story_style: storyStyle.value || undefined,
    aspect_ratio: projectAspectRatio.value || '16:9',
    video_clip_duration: videoClipDuration.value || 10,
    script_language: scriptLanguage.value || 'zh',
    storyboard_include_narration: !!storyboardIncludeNarration.value,
    storyboard_universal_omni: !!storyboardUniversalOmni.value,
    storyboard_use_first_last_frame: !!storyboardUseFirstLastFrame.value,
    storyboard_frame_count: normalizeStoryboardFrameCount(storyboardFrameCount.value),
    last_frame_use_first_layout_lock: !!lastFrameUseFirstLayoutLock.value,
  }
  if (includeGenerationStyle) {
    Object.assign(metadata, projectStylePromptMetadata())
  }
  const payload = {
    genre: storyType.value || undefined,
    metadata,
  }
  if (includeGenerationStyle) {
    payload.style = generationStyle.value || undefined
  }
  dramaAPI.saveOutline(store.dramaId, payload).catch(e => console.error('Settings auto-save failed', e))
}

async function onGenerateStory() {
  trackFilmCreateAction('generate_script_click')
  normalizeStoryEpisodeCount()
  await runGenerateStoryFromPremise({
    premise: storyInput.value,
    storyStyle: storyStyle.value,
    storyType: storyType.value,
    storyEpisodeCount: storyEpisodeCount.value,
    scriptTitle: scriptTitle.value,
    generationStyle: generationStyle.value,
    projectAspectRatio: projectAspectRatio.value,
    videoClipDuration: videoClipDuration.value,
    scriptLanguage: scriptLanguage.value,
    store,
    router,
    route,
    loadDrama,
    savedCurrentEpisodeNumber,
    selectedEpisodeId,
    onEpisodeSelect,
    storyGenerating,
    scriptGenerating,
    aiConfigPayload: textAiPayload(),
    replaceRouteWhenNew: true,
    skipPostLoad: false,
    onComplete: ({ episodeCount }) => {
      trackFilmCreateAction('generate_script_complete', {
        extra: { episode_count: episodeCount },
      })
    },
  })
}

async function onGenerateScript() {
  trackFilmCreateAction('save_script_click')
  const content = (scriptContent.value ?? store.scriptContent ?? '').toString().trim()
  if (!content) {
    ElMessage.warning('请先在「故事生成」中点击 AI 生成，或手动输入剧本内容')
    return
  }
  scriptGenerating.value = true
  try {
    const result = await saveScriptToBackend(content)
    if (result?.created) {
      ElMessage.success('项目已创建，剧本已保存')
    } else {
      ElMessage.success('剧本已保存')
    }
    trackFilmCreateAction('save_script_complete', {
      extra: { created_project: !!result?.created },
    })
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    scriptGenerating.value = false
  }
}

async function onAddEpisode() {
  if (!store.dramaId) return
  const list = store.drama?.episodes || []
  const nextNum = list.length > 0
    ? Math.max(...list.map((e) => Number(e.episode_number) || 0), 0) + 1
    : 1
  const updated = list.map((ep, i) => ({
    episode_number: ep.episode_number ?? i + 1,
    title: ep.title || '第' + (ep.episode_number ?? i + 1) + '集',
    script_content: ep.script_content || '',
    description: ep.description,
    duration: ep.duration
  }))
  updated.push({
    episode_number: nextNum,
    title: '第' + nextNum + '集',
    script_content: '',
    description: null,
    duration: 0
  })
  try {
    await dramaAPI.saveEpisodes(store.dramaId, updated)
    savedCurrentEpisodeNumber.value = nextNum
    await loadDrama()
    ElMessage.success('已添加第' + nextNum + '集')
  } catch (e) {
    ElMessage.error(e.message || '添加失败')
  }
}

async function onUploadResourceClick(type, id) {
  if (!(await confirmAdminProjectOperation('上传素材图片'))) return
  resourceUploadPreconfirm = { type: String(type), id: String(id), expiresAt: Date.now() + 60000 }
  resourceUploadType.value = type
  resourceUploadId.value = id
  resourceImageFileInput.value?.click()
}

// 解析 extra_images JSON，返回 local_path 数组
function parseExtraImages(item) {
  if (!item?.extra_images) return []
  try {
    const arr = typeof item.extra_images === 'string' ? JSON.parse(item.extra_images) : item.extra_images
    return Array.isArray(arr) ? arr.filter(Boolean) : []
  } catch { return [] }
}

// 将 local_path 转成可访问的 URL
function localPathToUrl(p) {
  if (!p) return ''
  if (p.startsWith('http')) return p
  return '/static/' + p.replace(/^\//, '')
}

function localPathToThumbUrl(p, width = 160) {
  if (!p) return ''
  if (p.startsWith('http')) return thumbImageUrl(p, width)
  return staticThumbUrlFromRel(p.replace(/^\//, ''), width)
}

// 查找角色/道具/场景在 store 中的当前对象
function findResource(type, id) {
  const list = type === 'character' ? (store.characters ?? [])
    : type === 'prop' ? (store.props ?? [])
    : (store.scenes ?? [])
  return list.find((x) => Number(x.id) === Number(id)) || null
}

async function doUploadResourceImage(type, id, file) {
  if (!file || !type || id == null) return
  if (!consumeResourceUploadPreconfirm(type, id) && !(await confirmAdminProjectOperation('上传素材图片'))) return
  const key = type === 'character' ? 'char-' : type === 'prop' ? 'prop-' : 'scene-'
  uploadingResourceId.value = key + id
  try {
    const res = await uploadAPI.uploadImage(file, { dramaId: dramaId.value })
    const data = res?.data ?? res
    const uploadedLocalPath = data?.local_path || data?.path || null
    const url = data?.url || uploadedLocalPath
    if (!url) { ElMessage.error('上传未返回地址'); return }

    const current = findResource(type, id)
    const hasPrimary = !!(current?.local_path || current?.image_url)

    if (hasPrimary) {
      // 已有主图 → 追加到 extra_images
      const extras = parseExtraImages(current)
      const newPath = uploadedLocalPath || url
      if (!extras.includes(newPath)) extras.push(newPath)
      const extraJson = JSON.stringify(extras)
      if (type === 'character') {
        await characterAPI.putImage(id, { extra_images: extraJson })
      } else if (type === 'prop') {
        await propAPI.update(id, { extra_images: extraJson })
      } else if (type === 'scene') {
        await sceneAPI.update(id, { extra_images: extraJson })
      }
    } else {
      // 无主图 → 设为主图
      if (type === 'character') {
        await characterAPI.putImage(id, { image_url: url, local_path: uploadedLocalPath ?? null })
      } else if (type === 'prop') {
        await propAPI.update(id, { image_url: url, local_path: uploadedLocalPath ?? null })
      } else if (type === 'scene') {
        await sceneAPI.update(id, { image_url: url, local_path: uploadedLocalPath ?? null })
      }
    }
    await loadDrama()
    ElMessage.success('上传成功')
  } catch (e) {
    ElMessage.error(e.message || '上传失败')
  } finally {
    uploadingResourceId.value = null
  }
}

// 将某张额外图片设为主图（主图降级到 extra_images 第一位）
async function onSetPrimaryImage(type, item, extraPath) {
  if (!(await confirmAdminProjectOperation('切换素材主图'))) return
  const extras = parseExtraImages(item)
  const oldPrimary = item.local_path || ''
  const newExtras = extras.filter((p) => p !== extraPath)
  if (oldPrimary) newExtras.unshift(oldPrimary)
  const extraJson = JSON.stringify(newExtras)
  try {
    if (type === 'character') {
      await characterAPI.putImage(item.id, { local_path: extraPath, image_url: '', extra_images: extraJson })
    } else if (type === 'prop') {
      await propAPI.update(item.id, { local_path: extraPath, image_url: '', extra_images: extraJson })
    } else if (type === 'scene') {
      await sceneAPI.update(item.id, { local_path: extraPath, image_url: '', extra_images: extraJson })
    }
    await loadDrama()
  } catch (e) {
    ElMessage.error(e.message || '操作失败')
  }
}

// 删除某张额外图片
async function onRemoveExtraImage(type, item, extraPath) {
  if (!(await confirmAdminProjectOperation('删除素材历史图'))) return
  const extras = parseExtraImages(item).filter((p) => p !== extraPath)
  const extraJson = extras.length ? JSON.stringify(extras) : null
  try {
    if (type === 'character') {
      await characterAPI.putImage(item.id, { extra_images: extraJson })
    } else if (type === 'prop') {
      await propAPI.update(item.id, { extra_images: extraJson })
    } else if (type === 'scene') {
      await sceneAPI.update(item.id, { extra_images: extraJson })
    }
    await loadDrama()
  } catch (e) {
    ElMessage.error(e.message || '删除失败')
  }
}

function onResourceImageFileChange(ev) {
  const file = ev.target?.files?.[0]
  const type = resourceUploadType.value
  const id = resourceUploadId.value
  if (!file || !type || id == null) {
    resourceUploadPreconfirm = null
    ev.target.value = ''
    return
  }
  doUploadResourceImage(type, id, file).finally(() => {
    resourceUploadType.value = null
    resourceUploadId.value = null
    ev.target.value = ''
  })
}

/** P0-3: 对分镜图执行超分辨率（2x） */
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
  const s = String(raw != null ? raw : '').trim().replace(/^\//, '')
  return s
}

/** 对白 TTS 相对路径 */
function sbDialogueAudioRelPath(sb) {
  if (!sb?.id) return ''
  const fromCache = sbDialogueAudioPaths.value[sb.id]
  const fromRow = sb.audio_local_path
  const raw = (fromCache != null && String(fromCache).trim() !== '') ? fromCache : (fromRow != null ? fromRow : '')
  return normalizeAudioRelPath(raw)
}

/** 解说旁白 TTS 相对路径 */
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
    const a = new Audio(url)
    sbTtsPreviewAudio = a
    a.addEventListener('ended', () => {
      if (sbTtsPreviewAudio === a) sbTtsPreviewAudio = null
    })
    a.play().catch(() => {
      ElMessage.warning('无法播放音频，请检查文件是否存在')
      if (sbTtsPreviewAudio === a) sbTtsPreviewAudio = null
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

/** P2-4: 为分镜对白生成 TTS 配音 */
async function onTtsSbDialogue(sb) {
  if (!sb?.id || ttsSbIds.has(sb.id)) return
  if (!sb.dialogue?.trim()) {
    ElMessage.warning('该分镜没有对白内容')
    return
  }
  ttsSbIds.add(sb.id)
  try {
    const res = await fetch('/api/v1/audio/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyboard_id: sb.id, text: sb.dialogue, tts_kind: 'dialogue', ...ttsAiPayload() }),
    })
    const data = await res.json()
    const businessOk = data.success === true || Number(data.code) === 200
    if (!res.ok || !businessOk) {
      throw new Error(data.error?.message || data.message || '配音失败')
    }
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

/** 为分镜解说旁白生成 TTS（与对白共用接口，文本不同） */
async function onTtsSbNarration(sb) {
  if (!sb?.id || ttsSbNarrationIds.has(sb.id)) return
  const text = ((sbNarration.value[sb.id] ?? sb.narration) || '').toString().trim()
  if (!text) {
    ElMessage.warning('该分镜没有解说旁白内容')
    return
  }
  ttsSbNarrationIds.add(sb.id)
  try {
    const res = await fetch('/api/v1/audio/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyboard_id: sb.id, text, tts_kind: 'narration', ...ttsAiPayload() }),
    })
    const data = await res.json()
    const businessOk = data.success === true || Number(data.code) === 200
    if (!res.ok || !businessOk) {
      throw new Error(data.error?.message || data.message || '解说配音失败')
    }
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

/** 导出当前集分镜表（每镜一行；首尾帧模式含首/尾帧专用提示词） */
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

  exportingStoryboardSheet.value = true
  const framePromptBySbId = {}
  try {
    await Promise.all(
      boards.map(async (sb) => {
        try {
          const res = await storyboardsAPI.getFramePrompts(sb.id)
          const fps = res?.frame_prompts || []
          framePromptBySbId[sb.id] = {
            first: fps.find((r) => r.frame_type === 'first')?.prompt?.trim() || '',
            last: fps.find((r) => r.frame_type === 'last')?.prompt?.trim() || '',
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
          const v = map[key]
          return v != null && v !== '' ? v : sb[key]
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
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `narration-${currentEpisodeId.value || 'episode'}.srt`
  a.click()
  URL.revokeObjectURL(a.href)
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
      const row = list.find((x) => Number(x.id) === Number(sb.id))
      if (row) row.narration = next || null
    }
  } catch (_) { /* 静默失败，避免打断输入 */ }
}

function isSbUniversalMode(sbId) {
  return sbCreationMode.value[sbId] === 'universal'
}

function setSbCreationModeId(sbId, mode) {
  if (sbId == null) return
  const m = mode === 'universal' ? 'universal' : 'classic'
  sbCreationMode.value = { ...sbCreationMode.value, [sbId]: m }
}

async function onToggleSbUniversalMode(sb) {
  if (!sb?.id) return
  const cur = isSbUniversalMode(sb.id) ? 'universal' : 'classic'
  const next = cur === 'universal' ? 'classic' : 'universal'
  sbCreationMode.value = { ...sbCreationMode.value, [sb.id]: next }
  try {
    await storyboardsAPI.update(sb.id, { creation_mode: next })
    const list = store.currentEpisode?.storyboards
    if (Array.isArray(list)) {
      const row = list.find((x) => Number(x.id) === Number(sb.id))
      if (row) row.creation_mode = next
    }
  } catch (e) {
    sbCreationMode.value = { ...sbCreationMode.value, [sb.id]: cur }
    ElMessage.error(e.message || '保存失败')
  }
}

async function onSaveUniversalSegmentField(sb) {
  if (!sb?.id) return
  const next = (sbUniversalSegmentText.value[sb.id] || '').toString()
  const prev = (sb.universal_segment_text || '').toString()
  if (next === prev) return
  try {
    await storyboardsAPI.update(sb.id, { universal_segment_text: next.trim() || null })
    const list = store.currentEpisode?.storyboards
    if (Array.isArray(list)) {
      const row = list.find((x) => Number(x.id) === Number(sb.id))
      if (row) row.universal_segment_text = next.trim() || null
    }
  } catch (_) { /* 静默失败，避免打断输入 */ }
}

function universalSegmentDurationSecForSb(sb) {
  const dUi = Number(sbDuration.value[sb?.id])
  const dRow = Number(sb?.duration)
  const dProj = Number(videoClipDuration.value)
  return Number.isFinite(dUi) && dUi > 0
    ? dUi
    : Number.isFinite(dRow) && dRow > 0
      ? dRow
      : Number.isFinite(dProj) && dProj > 0
        ? dProj
        : 5
}

/** 提交视频 API 时使用的时长：优先本分镜配置，其次项目「每段秒数」 */
function getSbVideoDurationForApi(sb) {
  const perSb = Number(sbDuration.value[sb?.id] ?? sb?.duration)
  if (Number.isFinite(perSb) && perSb > 0) return perSb
  const clip = Number(videoClipDuration.value)
  if (Number.isFinite(clip) && clip > 0) return clip
  return undefined
}

/** 全能提示词生成/润色：提交当前编辑区中的分镜字段（避免未点保存时仍用库内旧对白） */
function buildUniversalSegmentFieldOverrides(sb) {
  if (!sb?.id) return {}
  const id = sb.id
  const trimOrNull = (v) => {
    const s = (v ?? '').toString().trim()
    return s || null
  }
  return {
    title: trimOrNull(sbTitle.value[id] ?? sb.title),
    description: trimOrNull(sb.description),
    location: trimOrNull(sbLocation.value[id] ?? sb.location),
    time: trimOrNull(sbTime.value[id] ?? sb.time),
    action: trimOrNull(sbAction.value[id] ?? sb.action),
    dialogue: trimOrNull(sbDialogue.value[id] ?? sb.dialogue),
    narration: trimOrNull(sbNarration.value[id] ?? sb.narration),
    result: trimOrNull(sbResult.value[id] ?? sb.result),
    atmosphere: trimOrNull(sbAtmosphere.value[id] ?? sb.atmosphere),
    shot_type: trimOrNull(sbShotType.value[id] ?? sb.shot_type),
    movement: trimOrNull(sbMovement.value[id] ?? sb.movement),
    layout_description: trimOrNull(sbLayoutDescription.value[id] ?? sb.layout_description),
  }
}

/** 全能片段：@图片N 转 Grok 占位符 <IMAGE_N> */
function universalSegmentAtImageToGrokTags(text) {
  return (text || '').replace(/@图片(\d+)/g, '<IMAGE_$1>')
}

function onUniversalSegmentToGrokVideoTags(sb) {
  if (!sb?.id) return
  const raw = (sbUniversalSegmentText.value[sb.id] ?? '').toString()
  if (!raw.trim()) {
    ElMessage.warning('请先填写或生成片段描述')
    return
  }
  const next = universalSegmentAtImageToGrokTags(raw)
  if (next === raw) {
    ElMessage.info('未找到 @图片N 标记，无需转换')
    return
  }
  sbUniversalSegmentText.value = { ...sbUniversalSegmentText.value, [sb.id]: next }
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

/** 全能模式：根据当前分镜结构化字段流式生成片段描述（NDJSON） */
async function onGenerateUniversalSegmentPrompt(sb, opts = {}) {
  if (!sb?.id || generatingUniversalSegmentIds.has(sb.id)) return
  const force = !!opts.forceWithoutReferenceImages
  generatingUniversalSegmentIds.add(sb.id)
  let live = ''
  try {
    const durationSec = universalSegmentDurationSecForSb(sb)
    const data = await storyboardsAPI.generateUniversalSegmentPromptStream(
      sb.id,
      {
        duration: durationSec,
        field_overrides: buildUniversalSegmentFieldOverrides(sb),
        ...(force ? { force_without_reference_images: true } : {}),
      },
      (delta) => {
        live += delta
        sbUniversalSegmentText.value = { ...sbUniversalSegmentText.value, [sb.id]: live }
      }
    )
    const text = (data?.universal_segment_text ?? '').toString().trim()
    if (!text) {
      ElMessage.warning('未收到完整生成结果，请重试')
      return
    }
    sbUniversalSegmentText.value = { ...sbUniversalSegmentText.value, [sb.id]: text }
    const list = store.currentEpisode?.storyboards
    if (Array.isArray(list)) {
      const row = list.find((x) => Number(x.id) === Number(sb.id))
      if (row) row.universal_segment_text = text
    }
    ElMessage.success(force ? '已强制生成全能片段提示词（无图模式）' : '已根据分镜生成全能片段提示词')
  } catch (e) {
    ElMessage.error(e.message || '生成失败，请检查文本模型配置')
  } finally {
    generatingUniversalSegmentIds.delete(sb.id)
  }
}

/** 全能模式：结合剧本与邻镜流式润色片段描述（服务端 NDJSON） */
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
    const durationSec = universalSegmentDurationSecForSb(sb)
    const data = await storyboardsAPI.polishUniversalSegmentPromptStream(
      sb.id,
      {
        duration: durationSec,
        draft_universal_segment_text: draft,
        field_overrides: buildUniversalSegmentFieldOverrides(sb),
        ...(force ? { force_without_reference_images: true } : {}),
      },
      (delta) => {
        live += delta
        sbUniversalSegmentText.value = { ...sbUniversalSegmentText.value, [sb.id]: live }
      }
    )
    const text = (data?.universal_segment_text ?? '').toString().trim()
    if (!text) {
      ElMessage.warning('未收到完整润色结果，请重试')
      return
    }
    sbUniversalSegmentText.value = { ...sbUniversalSegmentText.value, [sb.id]: text }
    const list = store.currentEpisode?.storyboards
    if (Array.isArray(list)) {
      const row = list.find((x) => Number(x.id) === Number(sb.id))
      if (row) row.universal_segment_text = text
    }
    ElMessage.success(force ? '全能片段已强制润色并保存（无图模式）' : '全能片段提示词已润色并保存')
  } catch (e) {
    ElMessage.error(e.message || '润色失败，请检查文本模型配置')
  } finally {
    generatingUniversalSegmentIds.delete(sb.id)
  }
}

/**
 * 分镜脚本生成完成后：按镜序逐个流式润色全能片段（服务端已落库）。
 * @param {{ checkPause?: () => Promise<void>, onShotProgress?: (cur:number,total:number,sb:object)=>void, onShotError?: (sb:object,msg:string)=>void }} opts
 */
async function polishUniversalSegmentsAfterGeneration(opts = {}) {
  const checkPause = typeof opts.checkPause === 'function' ? opts.checkPause : async () => {}
  const onShotProgress = typeof opts.onShotProgress === 'function' ? opts.onShotProgress : null
  const onShotError = typeof opts.onShotError === 'function' ? opts.onShotError : null

  if (!storyboardUniversalOmni.value) return { polished: 0, skipped: true }

  const rawList = store.currentEpisode?.storyboards || []
  const list = rawList.slice().sort((a, b) => (Number(a.storyboard_number) || 0) - (Number(b.storyboard_number) || 0))
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
        const durationSec = universalSegmentDurationSecForSb(sb)
        const data = await storyboardsAPI.polishUniversalSegmentPromptStream(
          sb.id,
          {
            duration: durationSec,
            draft_universal_segment_text: draft,
            field_overrides: buildUniversalSegmentFieldOverrides(sb),
            force_without_reference_images: true,
          },
          (delta) => {
            live += delta
            sbUniversalSegmentText.value = { ...sbUniversalSegmentText.value, [sb.id]: live }
          }
        )
        const text = (data?.universal_segment_text ?? '').toString().trim()
        if (text) {
          polished += 1
          sbUniversalSegmentText.value = { ...sbUniversalSegmentText.value, [sb.id]: text }
          const storyList = store.currentEpisode?.storyboards
          if (Array.isArray(storyList)) {
            const row = storyList.find((x) => Number(x.id) === Number(sb.id))
            if (row) row.universal_segment_text = text
          }
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
  const rawVideo = (sb.video_prompt || '').toString()
  sbPromptVideoText.value = formatVideoPromptForEdit(rawVideo)
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
  // 按「主体：」「运动：」等分段做换行，方便阅读
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

/** 将结构化视角三元组转为英文描述片段 + 中文标签（与 angleService.js 保持一致） */
function angleToPromptFragment(h, v, s) {
  const hDesc = { front:'shooting from the front', front_left:'shooting from front-left at 45-degree angle', left:'shooting from the left side, profile view', back_left:'shooting from back-left at 135-degree angle', back:"shooting from behind, character's back to camera", back_right:'shooting from back-right at 135-degree angle', right:'shooting from the right side, profile view', front_right:'shooting from front-right at 45-degree angle' }
  const vDesc = { worm:"extreme low-angle worm's eye view, camera near ground pointing sharply upward, strong upward perspective distortion, background shows sky/ceiling", low:'low-angle upward shot, camera below eye-line, slight upward tilt, empowering perspective', eye_level:'eye-level shot, neutral perspective, natural horizontal framing', high:"high-angle bird's eye view, camera above looking down, background shows floor/ground with downward perspective distortion" }
  const sDesc = { close_up:'close-up shot (face/bust framing), subject fills most of frame, shallow depth of field, background softly blurred', medium:'medium shot (waist-up to full body), character and immediate surroundings visible, moderate depth of field', wide:'wide shot (full body with environment), subject small relative to scene, deep depth of field, environment context prominent' }
  const hLabel = { front:'正面', front_left:'前左', left:'左侧', back_left:'后左', back:'背面', back_right:'后右', right:'右侧', front_right:'前右' }
  const vLabel = { worm:'虫眼仰', low:'仰拍', eye_level:'平视', high:'俯拍' }
  const sLabel = { close_up:'特写', medium:'中景', wide:'远景' }
  const fragment = [sDesc[s] || sDesc.medium, vDesc[v] || vDesc.eye_level, hDesc[h] || hDesc.front].join(', ')
  const label = `${sLabel[s] || '中景'}·${vLabel[v] || '平视'}·${hLabel[h] || '正面'}`
  return { fragment, label }
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
    const newVp = (rebuilt?.video_prompt && String(rebuilt.video_prompt).trim()) || ''
    if (newVp) {
      videoParamsTarget.value = { ...sb, video_prompt: newVp }
    }
    await loadDrama()
    ElMessage.success('已保存，视频提示词已按最新规则自动生成')
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  }
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

function onOpenVideoParamsDialog(sb) {
  videoParamsTarget.value = sb
  showVideoParamsDialog.value = true
}

/** 取消关闭弹窗时，将创作模式与片段描述与服务器状态对齐（避免仅改单选未保存导致本地漂移） */
function onVideoParamsDialogClosed() {
  const sb = videoParamsTarget.value
  if (!sb?.id) return
  const row = (storyboards.value || []).find((x) => Number(x.id) === Number(sb.id))
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
    const n = res?.storyboard_ids?.length ?? 0
    const summary = res?.plans_summary || ''
    showVideoParamsDialog.value = false
    await loadDrama()
    ElMessage.success(summary ? `已拆成 ${n} 条：${summary}` : `已拆成 ${n} 条分镜`)
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

/** 一键用 AI 重新生成/优化本分镜的布局描述（自动参考上下分镜保证前后连贯） */
async function onRegenerateLayoutDescription(sb) {
  if (sb && typeof sb === 'object' && sb.__v_isRef) sb = sb.value
  if (!sb?.id) return
  regeneratingLayoutSbIds.add(sb.id)
  try {
    const res = await storyboardsAPI.regenerateLayoutDescription(sb.id)
    const newText = res?.layout_description || res?.data?.layout_description
    if (newText) {
      // 直接用本次 AI 返回的结果更新本地编辑状态（响应里已包含新文本）
      sbLayoutDescription.value = { ...sbLayoutDescription.value, [sb.id]: newText }

      // 轻量刷新分镜列表（只更新 store 里的原始 storyboards，不触发 syncStoryboardStateFromEpisode，
      // 避免覆盖我们刚刚写入的 sbLayoutDescription 等本地字段）
      try { await refreshStoryboardsOnly() } catch (_) {}

      ElMessage.success('布局描述已由 AI 重新优化并保存（已参考上下分镜连贯性）')
      // 注意：不再调用 loadDrama()，因为它会全量重建所有 sbXxx 映射，可能用服务端旧数据覆盖本次结果。
      // 等后端 rowToStoryboard 补全 layout_description 字段后，关闭再打开对话框即可看到持久化值。
    } else {
      ElMessage.warning('AI 未返回有效的布局描述')
    }
  } catch (e) {
    ElMessage.error(e.message || '重新生成布局描述失败')
  } finally {
    regeneratingLayoutSbIds.delete(sb.id)
  }
}

/** 尾帧衔接：提取当前视频最后一帧，设为下一个分镜的首帧 */
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
    // 刷新两个分镜的媒体
    await Promise.all([
      loadSingleStoryboardMedia(sb.id),
      loadSingleStoryboardMedia(nextSb.id)
    ])
  } catch (e) {
    ElMessage.error(e.message || '尾帧衔接失败')
  } finally {
    linkingTailFrameIds.delete(sb.id)
  }
}

/** 上镜尾帧：直接把上一分镜的尾帧图片（高清原图）设为当前分镜的首帧，无需 ffmpeg 提取视频帧，画面更清晰 */
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

  // 直接执行，不再弹确认框（用户已通过按钮 + tooltip 明确意图）
  usingPrevTailAsFirstIds.add(sb.id)
  try {
    // 通过 upload 接口在“当前分镜”下创建一个 image 记录（复用上一镜尾帧的物理文件路径/URL），frame_type 触发后端自动 bind
    const uploaded = await imagesAPI.upload({
      storyboard_id: sb.id,
      drama_id: dramaId.value,
      image_url: prevLastImg.image_url || '',
      local_path: prevLastImg.local_path || undefined,
      prompt: `上镜尾帧（直接复用 #${prevSb.storyboard_number ?? prevSb.id} 尾帧高清原图）`,
      frame_type: 'storyboard_first'
    })
    if (uploaded?.id) {
      // 手动设置本地选中，确保显示立即切换；同时调用 onSelect 做一次 server patch（与 upload 里的 bind 互补）
      onSelectSbFrameImage(sb, uploaded, 'first')
    }
    ElMessage.success(`已将 #${prevSb.storyboard_number ?? prevSb.id} 尾帧设为本分镜首帧（高清原图）`)

    // 刷新分镜元数据（拿回服务器最新的 first_frame_image_id）+ 媒体列表
    await Promise.all([
      refreshStoryboardsOnly(),
      loadSingleStoryboardMedia(sb.id)
    ])
    // 清除可能残留的手动选中（让服务器权威绑定 id 生效）
    delete sbSelectedImgId.value[sb.id]
  } catch (e) {
    ElMessage.error(e.message || '上镜尾帧设置失败')
  } finally {
    usingPrevTailAsFirstIds.delete(sb.id)
  }
}

/** 生成期间轻量刷新分镜列表（只更新指定集 storyboards，不重载整个 drama） */
async function refreshStoryboardsForEpisode(episodeId) {
  if (!episodeId) return
  try {
    const res = await dramaAPI.getStoryboards(episodeId)
    const list = Array.isArray(res) ? res : (res?.storyboards ?? null)
    if (!Array.isArray(list)) return
    if (Number(store.currentEpisode?.id) === Number(episodeId)) {
      store.currentEpisode.storyboards = list
    }
    const epInDrama = store.drama?.episodes?.find((e) => Number(e.id) === Number(episodeId))
    if (epInDrama) {
      epInDrama.storyboards = list
    }
  } catch (_) { /* 静默忽略，不影响主流程 */ }
}

/** @deprecated 使用 refreshStoryboardsForEpisode */
async function refreshStoryboardsOnly() {
  return refreshStoryboardsForEpisode(currentEpisodeId.value)
}

async function onGenerateStoryboard() {
  if (!(await confirmAdminProjectOperation('生成分镜'))) return
  trackFilmCreateAction('generate_storyboard_click')
  const epId = currentEpisodeId.value
  if (!epId) return
  const meta = buildExtractTaskMeta(store, dramaId.value, epId, GEN_RESOURCE.GENERATE_STORYBOARD, 'AI生成分镜')
  genStore.markRunning(meta)
  // 生成期间每 2 秒刷新该集分镜列表，让已解析的分镜逐步出现（切集后仍更新原集缓存）
  const refreshTimer = setInterval(() => refreshStoryboardsForEpisode(epId), 2000)
  try {
    const res = await dramaAPI.generateStoryboard(epId, {
      model: undefined,
      style: getSelectedStyle(),
      storyboard_count: getStoryboardCountForApi(),
      video_duration: getVideoDurationForApi(),
      video_clip_duration: videoClipDuration.value || 10,
      aspect_ratio: projectAspectRatio.value || '16:9',
      language: scriptLanguage.value || 'zh',
      include_narration: !!storyboardIncludeNarration.value,
      universal_omni_storyboard: !!storyboardUniversalOmni.value,
      ...workflowPresetPayload('storyboard'),
      ...textAiPayload(),
    })
    const taskId = res?.task_id ?? (typeof res === 'string' ? res : null)
    if (taskId) {
      const pollRes = await pollTask(taskId, () => loadDrama(), meta)
      // failed / timeout：pollTask 内已展示对应提示，直接返回，不显示「完成」
      if (pollRes?.status !== 'completed') return
      if (pollRes?.result?.truncated) {
        sbTruncatedWarning.value = true
        sbTruncatedDismissed.value = false
      }
    } else {
      genStore.markDone(meta)
    }
    await loadDrama()
    // 生成完成后静默补全空缺的摄影参数（只填未填字段，不覆盖 AI 已填的）
    storyboardsAPI.batchInferParams(epId, false).catch(() => {})
    const polishRes = await polishUniversalSegmentsAfterGeneration({})
    const polishedN = polishRes?.polished ?? 0
    ElMessage.success(
      storyboardUniversalOmni.value
        ? polishedN > 0
          ? `全能分镜生成完成，已自动润色 ${polishedN} 条片段`
          : '全能分镜生成完成'
        : '分镜生成完成'
    )
    trackFilmCreateAction('generate_storyboard_complete', {
      extra: { storyboard_count: (store.storyboards || []).length },
    })
  } catch (e) {
    genStore.markFailed(meta, e.message || '生成失败')
    // HTTP 错误由 request 拦截器统一展示，此处仅处理拦截器未覆盖的异常
    if (!e.response) ElMessage.error(e.message || '生成失败')
  } finally {
    clearInterval(refreshTimer)
  }
}

async function onAddSingleStoryboard(){
  if (!currentEpisodeId.value) {
    ElMessage.warning('请先选择集')
    return
  }
  if (!(await confirmAdminProjectOperation('新增分镜'))) return
  try {
    // 获取当前最大序号（仅计算当前集的分镜）
    const maxNum = (store.storyboards || [])
      .filter(sb => sb.episode_id === currentEpisodeId.value)
      .reduce((max, sb) => Math.max(max, sb.storyboard_number || 0), 0)
    await storyboardsAPI.create({
      episode_id: currentEpisodeId.value,
      storyboard_number: maxNum + 1,
      title: `镜头 ${maxNum + 1}`,
      description: '',
    })
    ElMessage.success('添加成功')
    await loadDrama() // 刷新列表
  } catch (e) {
    ElMessage.error(e.message || '添加失败')
  }
}

async function onDeleteSingleStoryboard(id){
  if (!(await confirmAdminProjectOperation('删除分镜'))) return
  try {
    await ElMessageBox.confirm('确定要删除这个分镜吗？', '提示', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await storyboardsAPI.delete(id)
    ElMessage.success('删除成功')
    await loadDrama() // 刷新列表
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error(e.message || '删除失败')
    }
  }
}

async function onInsertStoryboardBefore(sb) {
  if (!(await confirmAdminProjectOperation('插入分镜'))) return
  try {
    await storyboardsAPI.insertBefore(sb.id)
    ElMessage.success('已在此位置前新增空白分镜')
    await loadDrama()
  } catch (e) {
    ElMessage.error(e.message || '新增失败')
  }
}

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
    // ════════════════════════════════════════════════════════
    // 阶段一：内容提取 & 分镜生成（快速、低成本）
    // ════════════════════════════════════════════════════════

    // 步骤 1：提取角色
    await checkPause()
    let chars = store.currentEpisode?.characters ?? []
    if (chars.length === 0) {
      setPipelineStep(1, '提取角色...')
      try {
        const outline = (store.scriptContent || '').toString().trim() || (storyInput.value || '').toString().trim() || undefined
        const res = await generationAPI.generateCharacters(dramaIdVal, { episode_id: store.currentEpisode?.id ?? undefined, outline: outline || undefined, ...textAiPayload() })
        const taskId = res?.task_id
        if (taskId) {
          const result = await pollTaskWithPause(taskId, () => loadDrama())
          if (result?.paused) { await waitForResume(); return }
          if (result?.error) { addPipelineError('提取角色', result.error); return }
        } else {
          await loadDrama()
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

    // 步骤 2：提取场景
    await checkPause()
    let sceneList = store.currentEpisode?.scenes ?? []
    if (sceneList.length === 0) {
      setPipelineStep(2, '提取场景...')
      try {
        const res = await dramaAPI.extractBackgrounds(episodeId, { model: undefined, style, language: scriptLanguage.value, ...textAiPayload() })
        const taskId = res?.task_id
        if (taskId) {
          const result = await pollTaskWithPause(taskId, () => loadDrama())
          if (result?.paused) { await waitForResume(); return }
          if (result?.error) { addPipelineError('提取场景', result.error); return }
        } else {
          await loadDrama()
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

    // 步骤 3：提取道具
    await checkPause()
    let propList = store.props ?? []
    if (propList.length === 0) {
      setPipelineStep(3, '提取道具...')
      try {
        const res = await propAPI.extractFromScript(episodeId, textAiPayload())
        const taskId = res?.task_id
        if (taskId) {
          const result = await pollTaskWithPause(taskId, () => loadDrama())
          if (result?.paused) { await waitForResume(); return }
          if (result?.error) { addPipelineError('提取道具', result.error); return }
        } else {
          await loadDrama()
        }
        await pipelineRest()
      } catch (e) {
        addPipelineError('提取道具', e.message || String(e))
        // 道具提取失败不中断流程
      }
      propList = store.props ?? []
    } else {
      setPipelineStep(3, `已有 ${propList.length} 个道具，跳过提取`)
    }

    // 步骤 4：生成分镜脚本
    await checkPause()
    await loadStoryboardMedia()
    let boards = store.storyboards || []
    const hadBoardsBeforeStep4 = boards.length > 0
    if (boards.length === 0) {
      setPipelineStep(4, '生成分镜脚本...')
      // 与手动生成一样，每 2 秒刷新一次分镜列表，让已解析的分镜逐步显示
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
            // 任务失败，但后端可能已保存了部分分镜，确保最新状态显示出来再停止
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

    // ════════════════════════════════════════════════════════
    // ⏱ 倒计时 20 秒：请浏览分镜内容，确认后开始生成角色/场景/道具图片
    // ════════════════════════════════════════════════════════
    await runPipelineCountdown(20, '分镜脚本生成完毕，请浏览确认内容。倒计时结束后将开始生成角色、场景、道具图片。')
    await checkPause()

    // ════════════════════════════════════════════════════════
    // 阶段二：角色 / 场景 / 道具 图片生成（中等消耗）
    // ════════════════════════════════════════════════════════

    // 步骤 5：生成角色图
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

    // 步骤 6：生成场景图
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

    // 步骤 7：生成道具图
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

    // ════════════════════════════════════════════════════════
    // ⏱ 倒计时 30 秒：请浏览角色/场景/道具图，确认后开始生成分镜图
    // ════════════════════════════════════════════════════════
    await runPipelineCountdown(30, '角色、场景、道具图片生成完毕，请浏览确认效果。倒计时结束后将开始生成分镜图（消耗较多 Token）。')
    await checkPause()

    // ════════════════════════════════════════════════════════
    // 阶段三：分镜图生成（较高消耗）
    // ════════════════════════════════════════════════════════

    // 步骤 8：生成分镜图
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

    // ════════════════════════════════════════════════════════
    // ⏱ 倒计时 20 秒：请浏览分镜图，确认后开始生成分镜视频
    // ════════════════════════════════════════════════════════
    await runPipelineCountdown(20, '分镜图生成完毕，请浏览确认图片效果。倒计时结束后将开始生成分镜视频（消耗最多 Token）。')
    await checkPause()

    // ════════════════════════════════════════════════════════
    // 阶段四：分镜视频 & 合集（最高消耗）
    // ════════════════════════════════════════════════════════

    // 步骤 9：生成分镜视频
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

    // 步骤 10：合成整集视频
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

/** 修复缺失：哪一步没有就生成哪一步，有图/有内容就跳过 */
async function runRepairPipeline() {
  const episodeId = currentEpisodeId.value
  const dramaIdVal = dramaId.value
  if (!episodeId || !dramaIdVal) return
  const style = getSelectedStyle()

  try {
    pipelineCurrentStep.value = '正在加载数据...'
    await loadDrama()

    // 1. 角色：没有则生成角色；再为每个无图角色生成图
    let chars = store.currentEpisode?.characters ?? []
    if (chars.length === 0) {
      await checkPause()
      pipelineCurrentStep.value = '正在生成角色列表...'
      try {
        const outline = (store.scriptContent || '').toString().trim() || (storyInput.value || '').toString().trim() || undefined
        const res = await generationAPI.generateCharacters(dramaIdVal, { episode_id: store.currentEpisode?.id ?? undefined, outline: outline || undefined, ...textAiPayload() })
        const taskId = res?.task_id
        if (taskId) {
          const result = await pollTaskWithPause(taskId, () => loadDrama())
          if (result?.paused) { await waitForResume(); return }
          if (result?.error) { addPipelineError('生成角色', result.error); return }
        } else await loadDrama()
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

    // 2. 场景：没有则提取；再为每个无图场景生成图
    let sceneList = store.currentEpisode?.scenes ?? []
    if (sceneList.length === 0) {
      await checkPause()
      pipelineCurrentStep.value = '正在提取场景...'
      try {
        const res = await dramaAPI.extractBackgrounds(episodeId, { model: undefined, style, language: scriptLanguage.value, ...textAiPayload() })
        const taskId = res?.task_id
        if (taskId) {
          const result = await pollTaskWithPause(taskId, () => loadDrama())
          if (result?.paused) { await waitForResume(); return }
          if (result?.error) { addPipelineError('提取场景', result.error); return }
        } else await loadDrama()
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

    // 2.5 道具：没有则提取；再为每个无图道具生成图
    let propList2 = store.props ?? []
    if (propList2.length === 0) {
      await checkPause()
      pipelineCurrentStep.value = '正在提取道具...'
      try {
        const res = await propAPI.extractFromScript(episodeId, textAiPayload())
        const taskId = res?.task_id
        if (taskId) {
          const result = await pollTaskWithPause(taskId, () => loadDrama())
          if (result?.paused) { await waitForResume(); return }
          if (result?.error) { addPipelineError('提取道具', result.error); /* 不中断 */ }
        } else await loadDrama()
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

    // 3. 分镜：没有则生成分镜；再逐个检查分镜图，没有则生成；再逐个检查分镜视频，没有则生成
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
    // 先拉取分镜图片/视频列表，再批量生成分镜图（并发）
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

    // 4. 生成整集视频（合成整个视频）
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


onBeforeUnmount(() => {
  clearPendingProjectSettingsSave()
  window.removeEventListener('keydown', onImagePreviewKeydown)
})

function applyRouteToStore() {
  clearPendingProjectSettingsSave()
  const id = route.params.id
  if (id && id !== 'new') {
    resetWorkbenchTabLoaded()
    store.setDrama({ id: Number(id) })
    if (route.query.episode) {
      selectedEpisodeId.value = Number(route.query.episode)
    }
    loadInitialWorkbenchData({ recoverTasks: true })
  } else {
    store.reset()
    resetWorkbenchTabLoaded()
    workbenchSummary.value = null
    resetScriptWorkbenchState()
    resetProjectSettings()
    resetStoryboardSettings()
    applyProjectAiRouteSelection({})
  }
}

// 过渡桥接：主要 UI 模板已拆出组件，业务状态暂留父页面；后续按 tab 下沉到 composables。
const filmCreateCtx = proxyRefs({
  AccountMenu,
  ACTIVE_VIDEO_AI_CONFIG_TTL_MS,
  addCharRefFileInput,
  addCharRefImage,
  addingCharFromLibraryId,
  addingCharToLibraryId,
  addingCharToMaterialId,
  addingPropFromLibraryId,
  addingPropToLibraryId,
  addingPropToMaterialId,
  addingSceneFromLibraryId,
  addingSceneToLibraryId,
  addingSceneToMaterialId,
  addPipelineError,
  addPropAddRefFileInput,
  addPropAddRefImage,
  addPropForm,
  addPropRefFileInput,
  addPropRefImage,
  addPropSaving,
  addSceneRefFileInput,
  addSceneRefImage,
  AI_ROUTE_METADATA_KEY,
  aiAPI,
  AIConfigContent,
  aiRouteLoading,
  aiRoutePayload,
  aiRoutesExpanded,
  aiRoutesLoaded,
  aiRouteSummary,
  aiRouteTypes,
  allActiveTasks,
  anchorTabMap,
  angleToPromptFragment,
  applyAssetsWorkbenchTab,
  applyDefaultWorkflowSelections,
  applyProjectAiRouteSelection,
  applyRouteToStore,
  applyRuntimeRoutingPolicies,
  applyScriptWorkbenchTab,
  applyStoryboardsWorkbenchTab,
  applyVideoComposeWorkbenchTab,
  applyWorkbenchSummarySettings,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  assetImageUrl,
  assetThumbUrl,
  assetTypeForWorkbenchTab,
  assetVideoUrl,
  auxRoleFrameType,
  auxRoleLabel,
  backfillDramaStylePromptMetadataIfNeeded,
  baseUrl,
  batchImageErrors,
  batchImageProgress,
  batchImageRunning,
  batchImageStopping,
  batchVideoErrors,
  batchVideoProgress,
  batchVideoRunning,
  batchVideoStopping,
  Box,
  CharacterWorkbench,
  buildEpisodeContext,
  buildExtractTaskMeta,
  buildFirstFrameImagePrompt,
  buildKeyframeParamsJson,
  buildLastFrameImagePrompt,
  buildRegenerateKeyframePrompt,
  buildResourceTaskMeta,
  buildSbAuxTimelinePrompt,
  buildSbGenMeta,
  buildSbKeyframeTimelinePrompt,
  buildSbVideoContextPrompt,
  buildSbVideoPromptForApi,
  buildStoryboardKeyframePrompt,
  buildUniversalSegmentFieldOverrides,
  canManageLibrary,
  canSplitSbByAudio,
  canUsePrevTailAsFirst,
  canUseUniversalOmniVideoApi,
  captureVideoLastFrame,
  characterAPI,
  characterLibraryAPI,
  characters,
  charactersAvailableToAddToSb,
  charactersBlockCollapsed,
  charactersGenerating,
  charLibraryKeyword,
  charLibraryList,
  charLibraryLoading,
  charLibraryPage,
  charLibraryPageSize,
  charLibraryTab,
  charLibraryTotal,
  charRoleLabel,
  charSd2CertPayload,
  Check,
  checkPause,
  clearCharRefImage,
  clearLocalGeneratingState,
  clearPendingProjectSettingsSave,
  clearPropRefImage,
  clearSceneRefImage,
  clipSecondsForStoryboardEstimate,
  cloneSpec,
  closeImagePreview,
  collectImagePreviewGallery,
  collectSbAssetReferenceItems,
  collectSbClassicVideoReferenceAbsoluteUrls,
  collectSbOmniReferenceAbsoluteUrls,
  collectSbSceneOnlyReferenceAbsoluteUrls,
  collectSbVideoReferenceItems,
  compactKeyframeText,
  computed,
  configOptionLabel,
  confirmAdminProjectOperation,
  confirmImageSpec,
  confirmUniversalNonSeedance2Video,
  consumeResourceUploadPreconfirm,
  countDialogueLinesInSb,
  createStoryboardImageBatchId,
  createStoryboardImageTasks,
  currentEpisode,
  currentEpisodeId,
  currentEpisodeVideoUrl,
  currentUser,
  DataAnalysis,
  debouncedLoadCharLibrary,
  debouncedLoadDramaAllCharList,
  debouncedLoadDramaAllPropList,
  debouncedLoadDramaAllSceneList,
  debouncedLoadPropLibrary,
  debouncedLoadSceneLibrary,
  dedupeStoryboardsForAssetLink,
  DEFAULT_GENERATION_STYLE,
  defaultImageSpec,
  defaultKeyframeDescription,
  defaultVideoSpec,
  Delete,
  dimensionsForArea,
  Document,
  DocumentAdd,
  doExtractCharFromImage,
  doExtractFromRef,
  doExtractFromRef2,
  doExtractPropFromImage,
  doExtractSceneFromImage,
  doGenerateCharacterPrompt,
  doGeneratePropPrompt,
  doGenerateScenePrompt,
  doGenerateSceneSinglePrompt,
  doUploadResourceImage,
  doUploadSbImage,
  dragOverResourceKey,
  dragOverSbId,
  dramaAllCharKeyword,
  dramaAllCharList,
  dramaAllCharLoading,
  dramaAllCharPage,
  dramaAllCharPageSize,
  dramaAllCharTotal,
  dramaAllPropKeyword,
  dramaAllPropList,
  dramaAllPropLoading,
  dramaAllPropPage,
  dramaAllPropPageSize,
  dramaAllPropTotal,
  dramaAllSceneKeyword,
  dramaAllSceneList,
  dramaAllSceneLoading,
  dramaAllScenePage,
  dramaAllScenePageSize,
  dramaAllSceneTotal,
  dramaAPI,
  dramaId,
  editCharacter,
  editCharacterForm,
  editCharacterPromptGenerating,
  editCharacterSaving,
  editCharLibraryForm,
  editCharLibrarySaving,
  editingFramePromptRegenerating,
  editingFramePromptSaving,
  editingFramePromptSb,
  editingFramePromptSlot,
  editingFramePromptText,
  editingSbImagePromptId,
  editingSbImagePromptText,
  editingSbVideoPromptId,
  editingSbVideoPromptText,
  editProp,
  editPropForm,
  editPropLibraryForm,
  editPropLibrarySaving,
  editPropPromptGenerating,
  editPropSaving,
  editScene,
  editSceneForm,
  editSceneLibraryForm,
  editSceneLibrarySaving,
  editScenePromptGenerating,
  editSceneSaving,
  effectiveStoryboardFrameCount,
  ElMessage,
  ElMessageBox,
  estimateVideoDurationSecFromCharLen,
  Expand,
  exportingStoryboardSheet,
  exportStoryboardSheet,
  extractIdentityAnchors,
  extractingAnchors,
  extractingCharAppearance,
  extractingPropAddDesc,
  extractingPropDesc,
  extractingSceneDesc,
  Film,
  FilmCreateHeader,
  filmWorkbenchTab,
  FilmWorkbenchTabs,
  findResource,
  Fold,
  formatElapsed,
  formatKeyframeSecond,
  formatSrtTimestamp,
  formatVideoPromptForEdit,
  frameTypeForSlot,
  GEN_RESOURCE,
  generatingCharIds,
  generatingPropIds,
  generatingSbFirstImageIds,
  generatingSbImageIds,
  generatingSbLastImageIds,
  generatingSbVideoIds,
  generatingSceneIds,
  generatingUniversalSegmentIds,
  generationAPI,
  generationStyle,
  generationStyleOptions,
  genStore,
  getActiveVideoAiConfig,
  getCharAffectedStoryboards,
  getCurrentUser,
  getFinalizeMergeOptions,
  getFirstImageFile,
  getGeneratingSetsBag,
  getMainImageUrlForVideo,
  getMovementLabel,
  getNextStoryboard,
  getPrevStoryboard,
  getPropAffectedStoryboards,
  getQuadGridImage,
  getRunningResourceTask,
  getSbAllImages,
  getSbAllVideos,
  getSbCharacterId,
  getSbCharacterIds,
  getSbConfirmedKeyframeImages,
  getSbFirstFrameUrl,
  getSbFirstImage,
  getSbImage,
  getSbLastFrameUrl,
  getSbLastImage,
  getSbLatestAuxImages,
  getSbLocalImage,
  getSbPrimaryImages,
  getSbPropId,
  getSbPropIds,
  getSbSelectedCharacters,
  getSbSelectedProps,
  getSbSelectedScene,
  getSbStoryboardReferenceImages,
  getSbUniversalOmniRefSlots,
  getSbVideo,
  getSbVideoDurationForApi,
  getSbVideoError,
  getSceneAffectedStoryboards,
  getSelectedStyle,
  getSelectedStylePrompt,
  getSelectedStylePromptZh,
  getStoryboardAssetReferenceImages,
  getStoryboardCountForApi,
  getStripItems,
  getStylePromptEn,
  getStylePromptZh,
  getVideoDurationForApi,
  getVideoStripItems,
  goList,
  goStoryboardAnchor,
  goWorkbenchAnchor,
  groupByStoryboardId,
  hasAssetImage,
  hasSbFirstLastPair,
  hasSbImage,
  IMAGE_TIER_AREAS,
  imageAiPayload,
  imageRatioOptions,
  imageReferenceUrlForApi,
  imagesAPI,
  imageSpecDialogVisible,
  imageSpecDraft,
  imageSpecPreview,
  imageSpecSummary,
  imageTierOptions,
  imageUrl,
  inferringParams,
  InfoFilled,
  invalidateActiveVideoAiConfigCache,
  isAdmin,
  isAdminUser,
  isAdminViewingOtherProject,
  isAuxStoryboardImage,
  isCharAddToEpisodeLoading,
  isDark,
  isEpisodeExtractRunning,
  isFreshPreconfirm,
  isHttpVideoUrl,
  isPropAddToEpisodeLoading,
  isResourceGenerating,
  isSbUniversalMode,
  isSceneAddToEpisodeLoading,
  isSeedance2VideoModel,
  keyframeDescriptionFromParams,
  keyframeIndexInfo,
  keyframeItemLabel,
  keyframeTimelineLine,
  keyframeTimeRange,
  lastFrameUseFirstLayoutLock,
  latestStoryboardKeyframeBatch,
  linkingTailFrameIds,
  loadAssetWorkbenchTab,
  loadCharLibraryList,
  loadDrama,
  loadDramaAllCharList,
  loadDramaAllPropList,
  loadDramaAllSceneList,
  loadDramaPromise,
  Loading,
  loadInitialWorkbenchData,
  loadPipelineConcurrency,
  loadPropLibraryList,
  loadRuntimeAiConfigs,
  loadSceneLibraryList,
  loadScriptWorkbenchTab,
  loadSelectScriptList,
  loadSingleStoryboardMedia,
  loadStoryboardMedia,
  loadStoryboardsWorkbenchTab,
  loadVideoComposeWorkbenchTab,
  loadWorkbenchSummary,
  loadWorkbenchTab,
  loadWorkflowPresets,
  localPathToThumbUrl,
  localPathToUrl,
  MagicStick,
  markAllWorkbenchTabsLoaded,
  MAX_STORY_EPISODE_COUNT,
  mergeCurrentEpisodePatch,
  Minus,
  Moon,
  navCollapsed,
  navSteps,
  nextTick,
  normalizeAiRouteId,
  normalizeAudioRelPath,
  normalizeImageSpec,
  normalizeRuntimeConcurrency,
  normalizeStoryboardFrameCount,
  normalizeStoryEpisodeCount,
  normalizeVideoSpec,
  novelAiSummarize,
  novelFileContent,
  novelFileName,
  novelImporting,
  novelImportMode,
  novelImportReset,
  novelMaxChapters,
  novelText,
  onAddCharacterToLibrary,
  onAddCharacterToMaterialLibrary,
  onAddCharFromLibrary,
  onAddDramaCharToEpisode,
  onAddDramaPropToEpisode,
  onAddDramaSceneToEpisode,
  onAddEpisode,
  onAddPropFromLibrary,
  onAddPropToLibrary,
  onAddPropToMaterialLibrary,
  onAddSceneFromLibrary,
  onAddSceneToLibrary,
  onAddSceneToMaterialLibrary,
  onAddSingleStoryboard,
  onAiRouteSelectVisible,
  onBatchInferParams,
  onBeforeUnmount,
  onCharLibraryDialogOpen,
  onCharLibraryTabChange,
  onCloseCharDialog,
  onClosePropDialog,
  onCloseSceneDialog,
  onDeleteCharacter,
  onDeleteCharacterRaw,
  onDeleteCharLibrary,
  onDeleteProp,
  onDeletePropLibrary,
  onDeletePropRaw,
  onDeleteScene,
  onDeleteSceneLibrary,
  onDeleteSceneRaw,
  onDeleteSingleStoryboard,
  onEditKeyframeDescription,
  onEditSbImagePrompt,
  onEditSbVideoPrompt,
  onEpisodeSelect,
  onExportNarrationSrt,
  onExportStoryboardSheet,
  onExtractProps,
  onExtractPropsRaw,
  onExtractScenes,
  onExtractScenesRaw,
  onGenerateCharacterImage,
  onGenerateCharacterImageRaw,
  onGenerateCharacters,
  onGenerateCharactersRaw,
  onGeneratePropImage,
  onGeneratePropImageRaw,
  onGenerateSbFrameImage,
  onGenerateSbFramePair,
  onGenerateSbImage,
  onGenerateSbVideo,
  onGenerateSceneImage,
  onGenerateSceneImageRaw,
  onGenerateScript,
  onGenerateStory,
  onGenerateStoryboard,
  onGenerateStoryboardAux,
  onGenerateUniversalSegmentPrompt,
  onGenerateVideo,
  onImagePreviewKeydown,
  onImportNovel,
  onInsertStoryboardBefore,
  onLastFrameLayoutLockChange,
  onLinkTailFrameToNext,
  onMounted,
  onNovelFileChange,
  onOpenSbPromptDialog,
  onOpenVideoParamsDialog,
  onPickScriptFromDialog,
  onPipelineResume,
  onPolishSbPrompt,
  onPolishUniversalSegmentPromptStream,
  onProjectVideoResolutionChange,
  onPropLibraryDialogOpen,
  onPropLibraryTabChange,
  onRefImageDrop,
  onRefImageDrop2,
  onRefImageFileChange,
  onRefImageFileChange2,
  onRegenAffectedSbImages,
  onRegenerateKeyframeItem,
  onRegenerateLayoutDescription,
  onRemoveExtraImage,
  onRemoveSbHistoryImage,
  onResourceDragLeave,
  onResourceDragOver,
  onResourceDrop,
  onResourceImageFileChange,
  onSaveSbImagePrompt,
  onSaveSbNarrationField,
  onSaveSbPromptDialog,
  onSaveSbVideoFields,
  onSaveSbVideoPrompt,
  onSaveUniversalSegmentField,
  onSaveVideoParams,
  onSbAddCharacterCommand,
  onSbImageDragLeave,
  onSbImageDragOver,
  onSbImageDrop,
  onSbImageFileChange,
  onSceneLibraryDialogOpen,
  onSceneLibraryTabChange,
  onSd2CertifyCharacter,
  onSd2CertifyRefresh,
  onSd2PrimaryAction,
  onSd2VoicePrimaryAction,
  onSd2VoiceReplace,
  onSelectSbFrameImage,
  onSelectSbMainImage,
  onSelectSbMainVideo,
  onSelectStripItem,
  onSetPrimaryImage,
  onSplitSbByAudio,
  onStoryboardCharacterChange,
  onStoryboardPropChange,
  onStoryboardSceneChange,
  onStoryboardUseFirstLastFrameChange,
  onStripItemClick,
  onToggleKeyframeLocked,
  onToggleKeyframeSelected,
  onToggleSbUniversalMode,
  onTtsSbDialogue,
  onTtsSbNarration,
  onUniversalSegmentPromptMenu,
  onUniversalSegmentToGrokVideoTags,
  onUploadResourceClick,
  onUploadSbImageClick,
  onUpscaleSbImage,
  onUsePrevTailAsFirst,
  onVideoParamsDialogClosed,
  openAddCharacter,
  openAddScene,
  openCharSd2CertDialog,
  openEditCharLibrary,
  openEditPropLibrary,
  openEditSceneLibrary,
  openFramePromptEditor,
  openImagePreview,
  openImageSpecDialog,
  openSelectScriptDialog,
  parseExtraImages,
  parseImageParamsJson,
  parseJsonObject,
  parseRatioValue,
  parseScriptIntoEpisodes,
  pendingProjectStyleSave,
  Picture,
  PropWorkbench,
  pipelineActiveTasks,
  pipelineConcurrency,
  pipelineCountdown,
  pipelineCountdownMsg,
  pipelineCurrentStep,
  pipelineErrorLog,
  pipelineModelStrategyItems,
  pipelineModelStrategyTypes,
  pipelinePaused,
  pipelineRest,
  pipelineRunning,
  pipelineStepIndex,
  pipelineStepTotal,
  pipelineVideoConcurrency,
  pipelineWithRetry,
  playSbDialogueTts,
  playSbNarrationTts,
  playSbTtsFromRel,
  playSd2Voice,
  Plus,
  polishUniversalSegmentsAfterGeneration,
  pollTask,
  pollTaskWithPause,
  pollUntilResourceHasImage,
  previewGallery,
  previewImageIndex,
  previewImageUrl,
  PROJECT_SETTINGS_SAVE_DELAY_MS,
  projectAiRouteSelectionForSave,
  projectAspectRatio,
  projectImageSpec,
  projectMediaSpecMetadata,
  projectOwnerLabel,
  projectSettingsHydrating,
  projectSettingsSaveTimer,
  projectStylePromptMetadata,
  projectTitle,
  projectVideoResolution,
  projectVideoSpec,
  propAPI,
  propLibraryAPI,
  propLibraryKeyword,
  propLibraryList,
  propLibraryLoading,
  propLibraryPage,
  propLibraryPageSize,
  propLibraryTab,
  propLibraryTotal,
  props,
  propsBlockCollapsed,
  propsExtracting,
  proxyRefs,
  quadPanelLabel,
  QuestionFilled,
  QuickNav,
  reactive,
  readFileAsRefImage,
  recordHasPlayableVideoUrl,
  recoverAndSyncEpisodeTasks,
  recoveringEpisodeTaskKeys,
  ref,
  Refresh,
  refreshStoryboardsForEpisode,
  refreshStoryboardsOnly,
  regenerateEditingFramePrompt,
  regeneratingLayoutSbIds,
  regenSbImagesForAsset,
  regenSbImagesProgress,
  resetWorkbenchTabLoaded,
  resolvedProjectImageSpec,
  resolvedProjectVideoSpec,
  resolveImageSpec,
  resolveSbImageById,
  resolveVideoSpec,
  resourceElapsedLabel,
  resourceImageFileInput,
  resourcePanelCollapsed,
  resourceUploadId,
  resourceUploadPreconfirm,
  resourceUploadType,
  restoreSelectionsFromBackend,
  roundToMultiple,
  route,
  routePrimaryConfig,
  router,
  runConcurrently,
  runGenerateStoryFromPremise,
  runOneClickPipeline,
  runPipelineCountdown,
  runRepairPipeline,
  runtimeAiConfigs,
  runtimeRoutingPolicies,
  saveCharRefImageIfAny,
  savedCurrentEpisodeNumber,
  saveEditingFramePrompt,
  saveProjectSettings,
  savePropRefImageIfAny,
  saveSceneRefImageIfAny,
  saveScriptToBackend,
  sbAction,
  sbAngle,
  sbAngleH,
  sbAngleS,
  sbAngleV,
  sbAtmosphere,
  sbCanSubmitVideo,
  sbCharacterIds,
  sbCreationMode,
  sbDialogue,
  sbDialogueAudioPaths,
  sbDialogueAudioRelPath,
  sbDof,
  sbDuration,
  sbImageFileInput,
  sbImages,
  sbImageUploadForId,
  sbImageUploadSlotById,
  sbLayoutDescription,
  sbLighting,
  sbLocation,
  sbMainVideoPlayerKey,
  sbMovement,
  sbNarration,
  sbNarrationAudioPaths,
  sbNarrationAudioRelPath,
  sbPromptImageText,
  sbPromptPolishedText,
  sbPromptPolishing,
  sbPromptSaving,
  sbPromptTarget,
  sbPromptVideoText,
  sbPropIds,
  sbResult,
  sbSceneId,
  sbSelectedImgId,
  sbSelectedLastImgId,
  sbSelectedVideoId,
  sbShotType,
  sbTime,
  sbTitle,
  sbTruncatedDismissed,
  sbTruncatedWarning,
  sbTtsPreviewAudio,
  sbUniversalSegmentText,
  sbUniversalSegmentTrimmed,
  sbVideoErrors,
  sbVideoFirstLastUrls,
  sbVideos,
  sceneAPI,
  sceneLibraryAPI,
  sceneLibraryKeyword,
  sceneLibraryList,
  sceneLibraryLoading,
  sceneLibraryPage,
  sceneLibraryPageSize,
  sceneLibraryTab,
  sceneLibraryTotal,
  scenes,
  scenesBlockCollapsed,
  scenesExtracting,
  scheduleProjectSettingsSave,
  scriptContent,
  scriptEstimateStoryboardHint,
  scriptEstimateStoryboardTitle,
  scriptEstimateVideoDurationHint,
  scriptEstimateVideoDurationTitle,
  scriptGenerating,
  scriptLanguage,
  scriptStoryboardEstimate,
  scriptStoryboardStyle,
  ScriptWorkbench,
  scriptTextTrimmedForEstimate,
  scriptTitle,
  scriptWorkbenchMode,
  scrollToAnchor,
  scrollToStoryboard,
  scrollToTop,
  SceneWorkbench,
  sd2ActionLabel,
  sd2CertifyingId,
  sd2VoiceActionLabel,
  sd2VoiceUploadingId,
  selectableScriptDramas,
  selectedAiConfigIds,
  selectedEpisodeId,
  selectedWorkflowPreset,
  selectedWorkflowPresetIds,
  selectedWorkflowPresetName,
  selectPreviewEpisodeId,
  selectScriptDramas,
  selectScriptImporting,
  selectScriptLoading,
  setPipelineStep,
  setSbCharacterId,
  setSbCreationModeId,
  setSbPropId,
  Setting,
  shotCountEstimateFromDurationSec,
  showAddProp,
  showAiConfigDialog,
  showCharLibrary,
  showCharSd2Cert,
  showEditCharacter,
  showEditCharLibrary,
  showEditProp,
  showEditPropLibrary,
  showEditScene,
  showEditSceneLibrary,
  showFramePromptEditor,
  showNovelImport,
  showPreviewImage,
  showPropLibrary,
  showSbFramePromptPreview,
  showSbPromptDialog,
  showSceneLibrary,
  showSelectScriptDialog,
  showUsageCenterDialog,
  showVideoParamsDialog,
  showWorkflowConfigDialog,
  skipPipelineCountdown,
  sortStoryboardReferenceImages,
  splitByAudioLoading,
  startBatchImageGeneration,
  startBatchVideoGeneration,
  startOneClickPipeline,
  startRepairPipeline,
  startTextFrameworkPipeline,
  staticThumbUrlFromRel,
  stopBatchImageGeneration,
  stopBatchVideoGeneration,
  stopCharacterPromptPoll,
  stopEpisodeTask,
  stopPropPromptPoll,
  stopResourceGeneration,
  stopSbFramePair,
  stopScenePromptPoll,
  store,
  storyboardAuxRoleOptions,
  storyboardCount,
  storyboardFrameCount,
  storyboardFrameCountOptions,
  storyboardGenerating,
  storyboardImageAiPayload,
  storyboardImageTimeValue,
  storyboardIncludeNarration,
  storyboardMenuExpanded,
  storyboardRefName,
  storyboards,
  storyboardsAPI,
  StoryboardWorkbench,
  storyboardUniversalOmni,
  storyboardUseFirstLastFrame,
  storyEpisodeCount,
  storyGenerating,
  storyInput,
  storyStyle,
  storyType,
  stripItemTitle,
  stylePromptMetadataForSave,
  submitAddProp,
  submitEditCharacter,
  submitEditCharLibrary,
  submitEditProp,
  submitEditPropLibrary,
  submitEditScene,
  submitEditSceneLibrary,
  submitSbFrameImageTask,
  Sunny,
  switchWorkbenchTabForAnchor,
  syncGeneratingSetsFromStore,
  syncStoryboardStateFromEpisode,
  taskClockNow,
  textAiPayload,
  thumbImageUrl,
  toAbsoluteImageUrl,
  toggleAiRoutesExpanded,
  toggleNav,
  toggleTheme,
  trackFilmCreateAction,
  ttsAiPayload,
  ttsSbIds,
  ttsSbNarrationIds,
  universalOmniPolishProgress,
  universalOmniPolishRunning,
  universalSegmentAtImageToGrokTags,
  universalSegmentDurationSecForSb,
  UniversalSegmentOmniAtEditor,
  updateStoryboardDialogue,
  updateStoryboardImageMeta,
  Upload,
  uploadAPI,
  uploadingResourceId,
  uploadingSbImageId,
  uploadingSbImageSlot,
  upscalingSbIds,
  UsageCenterDialog,
  useCharacters,
  useFilmStore,
  useGenerationTaskStore,
  useNavigation,
  usePropsComposable,
  User,
  userFilledStoryboardCount,
  userFilledVideoDuration,
  useRoute,
  useRouter,
  useScenes,
  useTheme,
  usingPrevTailAsFirstIds,
  VIDEO_TIER_AREAS,
  videoAiPayload,
  videoBurnDialogue,
  VideoCamera,
  videoClipDuration,
  VideoWorkbench,
  videoDuration,
  videoErrorMsg,
  videoFrameContiguity,
  videoModelNameFromAiConfig,
  videoMusic,
  videoParamsSaving,
  videoParamsTarget,
  VideoPlay,
  videoProgress,
  videoQuality,
  videoResolution,
  videosAPI,
  videoSfx,
  videoStatus,
  videoSubtitle,
  videoTierOptions,
  videoWatermark,
  videoWatermarkText,
  waitForResume,
  WarningFilled,
  watch,
  workbenchSummary,
  workbenchSummaryLoading,
  workbenchTabLoaded,
  WorkflowPresetConfigDialog,
  workflowPresetLabel,
  workflowPresetLoading,
  workflowPresetOptions,
  workflowPresetPayload,
  ZoomIn,
})

onMounted(async () => {
  window.addEventListener('keydown', onImagePreviewKeydown)
  loadPipelineConcurrency()
  loadWorkflowPresets()
  loadRuntimeAiConfigs()
  applyRouteToStore()
})

watch(() => route.params.id, () => {
  applyRouteToStore()
})

watch(
  () => filmWorkbenchTab.value,
  (tab) => {
    loadWorkbenchTab(tab).catch((err) => {
      ElMessage.error(err.message || '加载当前工作台失败')
    })
  }
)

// 剧本分集切换时同步 URL query 参数（?episode=<episode_id>），使刷新/分享页面仍保持当前选中集
// 同时监听 query 变化，支持浏览器前进/后退时自动切换对应集次
watch(
  () => selectedEpisodeId.value,
  (newId) => {
    if (!dramaId.value) return
    const currentInQuery = route.query.episode != null ? Number(route.query.episode) : null
    const desired = newId != null ? Number(newId) : null
    if (currentInQuery !== desired) {
      const newQuery = { ...route.query }
      if (desired != null) {
        newQuery.episode = String(desired)
      } else {
        delete newQuery.episode
      }
      router.replace({ query: newQuery }).catch(() => {})
    }
  },
  { flush: 'post' }
)

watch(
  () => route.query.episode,
  (newEp) => {
    if (!dramaId.value) return
    const newVal = newEp != null ? Number(newEp) : null
    const currentSel = selectedEpisodeId.value != null ? Number(selectedEpisodeId.value) : null
    if (currentSel !== newVal) {
      onEpisodeSelect(newVal)
    }
  }
)

watch(
  () => [
    storyStyle.value,
    storyType.value,
    projectAspectRatio.value,
    videoClipDuration.value,
    scriptLanguage.value,
    storyboardIncludeNarration.value,
    storyboardUniversalOmni.value,
    storyboardUseFirstLastFrame.value,
    storyboardFrameCount.value,
    lastFrameUseFirstLayoutLock.value,
  ],
  () => scheduleProjectSettingsSave(false)
)

watch(
  () => generationStyle.value,
  () => scheduleProjectSettingsSave(true)
)

watch(
  () => aiRouteTypes.map(({ key }) => selectedAiConfigIds[key]).join('|'),
  () => scheduleProjectSettingsSave(false)
)
</script>

<style src="@/styles/filmCreateShared.css"></style>
