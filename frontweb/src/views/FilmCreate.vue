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
import { usePipelineOrchestrator } from '@/features/filmCreate/shared/composables/usePipelineOrchestrator'
import { useResourceImageManager } from '@/features/filmCreate/shared/composables/useResourceImageManager'
import { localPathToUrl as resourceLocalPathToUrl, parseExtraImages as parseResourceExtraImages } from '@/features/filmCreate/shared/utils/resourceImages'
import { runGenerateStoryFromPremise } from '@/composables/useStoryGeneration'
import { useScriptWorkbench } from '@/features/filmCreate/workbenches/script/useScriptWorkbench'
import { useCharacters } from '@/features/filmCreate/workbenches/characters/useCharacters'
import { useProps as usePropsComposable } from '@/features/filmCreate/workbenches/props/useProps'
import { useScenes } from '@/features/filmCreate/workbenches/scenes/useScenes'
import { useStoryboardSettings } from '@/features/filmCreate/workbenches/storyboards/useStoryboardSettings'
import { useStoryboardAuxActions } from '@/features/filmCreate/workbenches/storyboards/useStoryboardAuxActions'
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
  refreshStoryboardsForEpisode,
  refreshStoryboardsOnly,
  applyVideoComposeWorkbenchTab,
  loadScriptWorkbenchTab,
  loadAssetWorkbenchTab,
  loadStoryboardsWorkbenchTab,
  loadVideoComposeWorkbenchTab,
  loadWorkbenchTab,
  loadInitialWorkbenchData,
} = useWorkbenchLoader({
  store,
  dramaAPI,
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

const sbTruncatedWarning = ref(false)
const sbTruncatedDismissed = ref(false)

const {
  canSplitSbByAudio,
  countDialogueLinesInSb,
  formatSrtTimestamp,
  normalizeAudioRelPath,
  onAddSingleStoryboard,
  onBatchInferParams,
  onDeleteSingleStoryboard,
  onExportNarrationSrt,
  onExportStoryboardSheet,
  onGenerateStoryboard,
  onInsertStoryboardBefore,
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
} = useStoryboardAuxActions({
  store,
  dramaAPI,
  imagesAPI,
  storyboardsAPI,
  genStore,
  genResource: GEN_RESOURCE,
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
  projectAspectRatio,
  scriptLanguage,
  showVideoParamsDialog,
  videoParamsTarget,
  videoParamsSaving,
  splitByAudioLoading,
  inferringParams,
  regeneratingLayoutSbIds,
  linkingTailFrameIds,
  usingPrevTailAsFirstIds,
  storyboardUseFirstLastFrame,
  storyboardIncludeNarration,
  storyboardUniversalOmni,
  sbTruncatedWarning,
  sbTruncatedDismissed,
  loadDrama,
  refreshStoryboardsForEpisode,
  refreshStoryboardsOnly,
  loadSingleStoryboardMedia,
  buildExtractTaskMeta,
  confirmAdminProjectOperation,
  trackFilmCreateAction,
  getSelectedStyle,
  getStoryboardCountForApi,
  getVideoDurationForApi,
  workflowPresetPayload,
  textAiPayload,
  ttsAiPayload,
  pollTask: (...args) => pollTask(...args),
  polishUniversalSegmentsAfterGeneration,
  getSbFirstImage,
  getSbLastImage,
  buildFirstFrameImagePrompt,
  buildLastFrameImagePrompt,
  getSbSelectedScene,
  getSbSelectedCharacters,
  getSbSelectedProps,
  getNextStoryboard,
  getPrevStoryboard,
  getSbVideo,
  onSelectSbFrameImage,
  getMovementLabel,
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
  charRoleLabel, onGenerateCharacters, openAddCharacter, stopCharacterPromptPoll, editCharacter,
  saveCharRefImageIfAny, submitEditCharacter, doGenerateCharacterPrompt, doExtractCharFromImage,
  extractIdentityAnchors, clearCharRefImage, onCloseCharDialog, onDeleteCharacter, onGenerateCharacterImage, onSd2CertifyCharacter, onSd2CertifyRefresh, sd2ActionLabel, onSd2PrimaryAction, openCharSd2CertDialog,
  onSd2VoicePrimaryAction, onSd2VoiceReplace, sd2VoiceActionLabel, playSd2Voice,
  loadCharLibraryList, debouncedLoadCharLibrary, loadDramaAllCharList, debouncedLoadDramaAllCharList,
  onCharLibraryDialogOpen, onCharLibraryTabChange, isCharAddToEpisodeLoading,
  openEditCharLibrary, submitEditCharLibrary,
  onDeleteCharLibrary, onAddCharacterToLibrary, onAddCharacterToMaterialLibrary,
  onAddCharFromLibrary, onAddDramaCharToEpisode,
} = useCharacters({
  store,
  dramaId,
  currentEpisodeId,
  getSelectedStyle,
  loadDrama,
  pollTask,
  pollUntilResourceHasImage,
  hasAssetImage,
  isAdminUser,
  canManageLibrary,
  confirmAdminProjectOperation,
  trackFilmCreateAction,
  textAiPayload,
  imageAiPayload,
  workflowPresetPayload,
})

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
  onExtractProps, stopPropPromptPoll, editProp, doGeneratePropPrompt, savePropRefImageIfAny,
  clearPropRefImage, doExtractPropFromImage, submitEditProp, submitAddProp,
  onClosePropDialog, onDeleteProp, onGeneratePropImage,
  loadPropLibraryList, debouncedLoadPropLibrary, loadDramaAllPropList, debouncedLoadDramaAllPropList,
  onPropLibraryDialogOpen, onPropLibraryTabChange, isPropAddToEpisodeLoading,
  openEditPropLibrary, submitEditPropLibrary,
  onDeletePropLibrary, onAddPropToLibrary, onAddPropToMaterialLibrary,
  onAddPropFromLibrary, onAddDramaPropToEpisode,
  doExtractFromRef2,
} = usePropsComposable({
  store,
  dramaId,
  currentEpisodeId,
  getSelectedStyle,
  loadDrama,
  pollTask,
  pollUntilResourceHasImage,
  hasAssetImage,
  isAdminUser,
  canManageLibrary,
  confirmAdminProjectOperation,
  trackFilmCreateAction,
  textAiPayload,
  imageAiPayload,
  workflowPresetPayload,
})

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
  onExtractScenes, openAddScene, stopScenePromptPoll, editScene, doGenerateScenePrompt, doGenerateSceneSinglePrompt,
  saveSceneRefImageIfAny, clearSceneRefImage, doExtractSceneFromImage, submitEditScene,
  onCloseSceneDialog, onDeleteScene, onGenerateSceneImage,
  loadSceneLibraryList, debouncedLoadSceneLibrary, loadDramaAllSceneList, debouncedLoadDramaAllSceneList,
  onSceneLibraryDialogOpen, onSceneLibraryTabChange, isSceneAddToEpisodeLoading,
  openEditSceneLibrary, submitEditSceneLibrary,
  onDeleteSceneLibrary, onAddSceneToLibrary, onAddSceneToMaterialLibrary,
  onAddSceneFromLibrary, onAddDramaSceneToEpisode,
} = useScenes({
  store,
  dramaId,
  currentEpisodeId,
  getSelectedStyle,
  scriptLanguage,
  loadDrama,
  pollTask,
  pollUntilResourceHasImage,
  hasAssetImage,
  dramaAPI,
  isAdminUser,
  canManageLibrary,
  confirmAdminProjectOperation,
  trackFilmCreateAction,
  textAiPayload,
  imageAiPayload,
  workflowPresetPayload,
})

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
  parseExtraImages: parseResourceExtraImages,
  localPathToUrl: resourceLocalPathToUrl,
})

const {
  resourceImageFileInput,
  resourceUploadType,
  resourceUploadId,
  uploadingResourceId,
  dragOverResourceKey,
  parseExtraImages,
  localPathToUrl,
  localPathToThumbUrl,
  onRefImageFileChange,
  onRefImageDrop,
  onRefImageFileChange2,
  onRefImageDrop2,
  doExtractFromRef,
  onResourceDragOver,
  onResourceDragLeave,
  onResourceDrop,
  onUploadResourceClick,
  doUploadResourceImage,
  onSetPrimaryImage,
  onRemoveExtraImage,
  onResourceImageFileChange,
} = useResourceImageManager({
  store,
  dramaId,
  uploadAPI,
  characterAPI,
  propAPI,
  sceneAPI,
  loadDrama,
  confirmAdminProjectOperation,
  thumbImageUrl,
  staticThumbUrlFromRel,
  addCharRefImage,
  addPropRefImage,
  addSceneRefImage,
  addPropAddRefImage,
  extractingCharAppearance,
  extractingPropDesc,
  extractingSceneDesc,
  editCharacterForm,
  editPropForm,
  editSceneForm,
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

const {
  runOneClickPipeline,
  runRepairPipeline,
  startOneClickPipeline,
  startRepairPipeline,
  startTextFrameworkPipeline,
} = usePipelineOrchestrator({
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
  confirmAdminProjectOperation,
  trackFilmCreateAction,
  startPipeline,
  finishPipeline,
  addPipelineError,
  checkPause,
  waitForResume,
  pipelineRest,
  setPipelineStep,
  runPipelineCountdown,
  runConcurrently,
  pipelineWithRetry,
  pollTaskWithPause,
  pollUntilResourceHasImage,
  loadDrama,
  loadStoryboardMedia,
  loadSingleStoryboardMedia,
  refreshStoryboardsOnly,
  polishUniversalSegmentsAfterGeneration,
  getSelectedStyle,
  textAiPayload,
  imageAiPayload,
  videoAiPayload,
  workflowPresetPayload,
  getStoryboardCountForApi,
  getVideoDurationForApi,
  hasAssetImage,
  hasSbImage,
  recordHasPlayableVideoUrl,
  isSbUniversalMode,
  sbCanSubmitVideo,
  collectSbOmniReferenceAbsoluteUrls,
  collectSbClassicVideoReferenceAbsoluteUrls,
  getSbFirstFrameUrl,
  getMainImageUrlForVideo,
  toAbsoluteImageUrl,
  sbVideoFirstLastUrls,
  buildSbVideoPromptForApi,
  getSbVideoDurationForApi,
  submitSbFrameImageTask,
  createStoryboardImageTasks,
  getFinalizeMergeOptions,
})

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

onBeforeUnmount(() => {
  clearPendingProjectSettingsSave()
  stopSbTtsPreview()
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
  onDeleteCharLibrary,
  onDeleteProp,
  onDeletePropLibrary,
  onDeleteScene,
  onDeleteSceneLibrary,
  onDeleteSingleStoryboard,
  onEditKeyframeDescription,
  onEditSbImagePrompt,
  onEditSbVideoPrompt,
  onEpisodeSelect,
  onExportNarrationSrt,
  onExportStoryboardSheet,
  onExtractProps,
  onExtractScenes,
  onGenerateCharacterImage,
  onGenerateCharacters,
  onGeneratePropImage,
  onGenerateSbFrameImage,
  onGenerateSbFramePair,
  onGenerateSbImage,
  onGenerateSbVideo,
  onGenerateSceneImage,
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
