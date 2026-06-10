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
import { ref, computed, onMounted, onBeforeUnmount, watch, reactive, proxyRefs } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
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
import AIConfigContent from '@/components/AIConfigContent.vue'
import WorkflowPresetConfigDialog from '@/components/WorkflowPresetConfigDialog.vue'
import AccountMenu from '@/components/AccountMenu.vue'
import UsageCenterDialog from '@/components/UsageCenterDialog.vue'
import FilmCreateHeader from '@/features/filmCreate/layout/FilmCreateHeader.vue'
import FilmWorkbenchTabs from '@/features/filmCreate/layout/FilmWorkbenchTabs.vue'
import ProjectPipelinePanel from '@/features/filmCreate/layout/ProjectPipelinePanel.vue'
import QuickNav from '@/features/filmCreate/layout/QuickNav.vue'
import { useQuickNavProgress } from '@/features/filmCreate/layout/useQuickNavProgress'
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
import { useFilmCreateProject } from '@/features/filmCreate/shared/composables/useFilmCreateProject'
import { useWorkbenchLoader } from '@/features/filmCreate/shared/composables/useWorkbenchLoader'
import { useMediaPreview } from '@/features/filmCreate/shared/composables/useMediaPreview'
import { useTaskRuntime } from '@/features/filmCreate/shared/composables/useTaskRuntime'
import { usePipelineRunner } from '@/features/filmCreate/shared/composables/usePipelineRunner'
import { usePipelineOrchestrator } from '@/features/filmCreate/shared/composables/usePipelineOrchestrator'
import { useResourceImageManager } from '@/features/filmCreate/shared/composables/useResourceImageManager'
import { useAssetStoryboardLinks } from '@/features/filmCreate/shared/composables/useAssetStoryboardLinks'
import { useAdminProjectGuard } from '@/features/filmCreate/shared/composables/useAdminProjectGuard'
import { localPathToUrl as resourceLocalPathToUrl, parseExtraImages as parseResourceExtraImages } from '@/features/filmCreate/shared/utils/resourceImages'
import { useScriptWorkbench } from '@/features/filmCreate/workbenches/script/useScriptWorkbench'
import { useCharacters } from '@/features/filmCreate/workbenches/characters/useCharacters'
import { useProps as usePropsComposable } from '@/features/filmCreate/workbenches/props/useProps'
import { useScenes } from '@/features/filmCreate/workbenches/scenes/useScenes'
import { useStoryboardSettings } from '@/features/filmCreate/workbenches/storyboards/useStoryboardSettings'
import { useStoryboardAuxActions } from '@/features/filmCreate/workbenches/storyboards/useStoryboardAuxActions'
import { useStoryboardWorkbench } from '@/features/filmCreate/workbenches/storyboards/useStoryboardWorkbench'
import { useStoryboardVideoWorkflow } from '@/features/filmCreate/workbenches/storyboards/useStoryboardVideoWorkflow'
import {
  angleToPromptFragment,
  collectStoryboardAssetReferenceImages,
  imageReferenceUrlForApi as storyboardImageReferenceUrlForApi,
} from '@/features/filmCreate/workbenches/storyboards/storyboardReferenceUtils'
import { useVideoWorkbench } from '@/features/filmCreate/workbenches/video/useVideoWorkbench'

const route = useRoute()
const router = useRouter()
const store = useFilmStore()
const genStore = useGenerationTaskStore()
const { isDark, toggle: toggleTheme } = useTheme()
let loadDrama = async () => {}
const {
  canManageLibrary,
  confirmAdminProjectOperation,
  currentUser,
  isAdminUser,
  isAdminViewingOtherProject,
  projectOwnerLabel,
} = useAdminProjectGuard({ store })

// ── Composable: Navigation ─────────────────────────────
const filmWorkbenchTab = ref('script')
const {
  anchorTabMap,
  goStoryboardAnchor,
  goWorkbenchAnchor,
  navCollapsed,
  storyboardMenuExpanded,
  switchWorkbenchTabForAnchor,
  toggleNav,
  scrollToTop,
  scrollToAnchor,
} = useNavigation({ filmWorkbenchTab })

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
  aiRoutePayload,
  textAiPayload,
  imageAiPayload,
  storyboardImageAiPayload,
  videoAiPayload,
  ttsAiPayload,
  loadRuntimeAiConfigs,
  onAiRouteSelectVisible,
} = useAiRouteSelection({ pipelineConcurrency, pipelineVideoConcurrency, setPipelineConcurrencyFallback })
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
  onAddEpisode,
  onGenerateScript,
  onGenerateStory,
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
  saveScriptToBackend,
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
  generationStyle,
  projectAspectRatio,
  videoClipDuration,
  scriptLanguage,
  projectStylePromptMetadata,
  projectMediaSpecMetadata,
  projectAiRouteSelectionForSave,
  aiRouteMetadataKey: AI_ROUTE_METADATA_KEY,
  textAiPayload,
  trackFilmCreateAction,
  onEpisodeSelect: (...args) => onEpisodeSelect(...args),
})
const workbenchTabLoaded = reactive({
  script: false,
  characters: false,
  scenes: false,
  props: false,
  storyboards: false,
  videoCompose: false,
})

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

const {
  dedupeStoryboardsForAssetLink,
  getCharAffectedStoryboards,
  getSceneAffectedStoryboards,
  getPropAffectedStoryboards,
  scrollToStoryboard,
  onRegenAffectedSbImages,
} = useAssetStoryboardLinks({
  storyboards,
  filmWorkbenchTab,
  regenSbImagesForAsset,
  regenSbImagesProgress,
  storyboardUseFirstLastFrame,
  dramaId,
  submitSbFrameImageTask,
  createStoryboardImageTasks,
  getSelectedStyle,
})

const sbTruncatedWarning = ref(false)
const sbTruncatedDismissed = ref(false)
let polishUniversalSegmentsAfterGeneration = async () => ({ polished: 0, skipped: true })

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
  polishUniversalSegmentsAfterGeneration: (...args) => polishUniversalSegmentsAfterGeneration(...args),
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

// 资源工作台子区块折叠状态
const charactersBlockCollapsed = ref(false)
const propsBlockCollapsed = ref(false)
const scenesBlockCollapsed = ref(false)

const { navSteps } = useQuickNavProgress({
  GEN_RESOURCE,
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
  getSbAllVideos,
  hasAssetImage,
  hasSbImage,
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
  sbCreationMode,
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
  buildSbGenMeta,
  getSelectedStyle,
  videoAiPayload,
  pollTask,
  pipelineRest,
  loadDrama,
  loadStoryboardMedia,
  loadSingleStoryboardMedia,
  confirmAdminProjectOperation,
  recordHasPlayableVideoUrl,
})
const {
  ACTIVE_VIDEO_AI_CONFIG_TTL_MS,
  buildSbAuxTimelinePrompt,
  buildSbKeyframeTimelinePrompt,
  buildUniversalSegmentFieldOverrides,
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
  getSbVideoDurationForApi,
  isSeedance2VideoModel,
  isSbUniversalMode,
  latestStoryboardKeyframeBatch,
  onEditSbImagePrompt,
  onEditSbVideoPrompt,
  onGenerateSbVideo,
  onGenerateUniversalSegmentPrompt,
  onOpenSbPromptDialog,
  onPolishSbPrompt,
  onPolishUniversalSegmentPromptStream,
  onSaveSbImagePrompt,
  onSaveSbPromptDialog,
  onSaveSbVideoPrompt,
  onSaveUniversalSegmentField,
  onToggleSbUniversalMode,
  onUniversalSegmentPromptMenu,
  onUniversalSegmentToGrokVideoTags,
  polishUniversalSegmentsAfterGeneration: runPolishUniversalSegmentsAfterGeneration,
  sbCanSubmitVideo,
  sbUniversalSegmentTrimmed,
  sbVideoFirstLastUrls,
  setSbCreationModeId,
  sortStoryboardReferenceImages,
  startBatchVideoGeneration,
  stopBatchVideoGeneration,
  storyboardImageTimeValue,
  storyboardRefName,
  toAbsoluteImageUrl,
  universalSegmentDurationSecForSb,
  videoModelNameFromAiConfig,
} = storyboardVideoWorkflow
polishUniversalSegmentsAfterGeneration = runPolishUniversalSegmentsAfterGeneration
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

const filmCreateProject = useFilmCreateProject({
  route,
  store,
  dramaAPI,
  backfillDramaStylePromptMetadataIfNeeded,
  workbenchTabLoaded,
  filmWorkbenchTab,
  selectedEpisodeId,
  savedCurrentEpisodeNumber,
  scriptTitle,
  storyInput,
  storyStyle,
  storyType,
  workbenchSummary,
  clearPendingProjectSettingsSave,
  setProjectSettingsHydrating,
  hydrateProjectSettingsFromDrama,
  hydrateStoryboardSettingsFromMetadata,
  applyProjectAiRouteSelection,
  syncStoryboardStateFromEpisode,
  loadStoryboardMedia,
  markAllWorkbenchTabsLoaded,
  loadWorkbenchSummary,
  loadWorkbenchTab,
  loadInitialWorkbenchData,
  resetWorkbenchTabLoaded,
  resetScriptWorkbenchState,
  resetProjectSettings,
  resetStoryboardSettings,
  recoverAndSyncEpisodeTasks,
})
loadDrama = filmCreateProject.loadDrama
const {
  applyRouteToStore,
  loadDramaPromise,
  onEpisodeSelect,
} = filmCreateProject

function imageReferenceUrlForApi(item) {
  return storyboardImageReferenceUrlForApi(item, assetImageUrl)
}

function getStoryboardAssetReferenceImages(sbId) {
  return collectStoryboardAssetReferenceImages(sbId, {
    assetImageUrl,
    getSbSelectedScene,
    getSbSelectedCharacters,
    getSbSelectedProps,
  })
}

function onLastFrameLayoutLockChange() {
  scheduleProjectSettingsSave(false)
}

function updateStoryboardDialogue(sbId) {
  // 可在此防抖后调用后端更新 dialogue
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
  try {
    await dramaAPI.saveOutline(store.dramaId, payload)
    ElMessage({
      type: 'success',
      message: '修改已实时保存，再次生成素材、分镜或视频时将按当前设置生效。',
      duration: 2600,
      showClose: true,
    })
  } catch (e) {
    console.error('Settings auto-save failed', e)
    ElMessage.error(e?.message || '项目设置保存失败')
  }
}

onBeforeUnmount(() => {
  clearPendingProjectSettingsSave()
  stopSbTtsPreview()
  window.removeEventListener('keydown', onImagePreviewKeydown)
})

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
  AIConfigContent,
  aiRouteLoading,
  aiRoutePayload,
  aiRoutesLoaded,
  allActiveTasks,
  anchorTabMap,
  angleToPromptFragment,
  applyAssetsWorkbenchTab,
  applyDefaultWorkflowSelections,
  applyProjectAiRouteSelection,
  applyRouteToStore,
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
  onAiRouteSelectVisible,
  openSelectScriptDialog,
  parseExtraImages,
  parseImageParamsJson,
  parseJsonObject,
  parseRatioValue,
  pendingProjectStyleSave,
  Picture,
  PropWorkbench,
  pipelineActiveTasks,
  pipelineConcurrency,
  pipelineCountdown,
  pipelineCountdownMsg,
  pipelineCurrentStep,
  pipelineErrorLog,
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
  resourceUploadId,
  resourceUploadType,
  restoreSelectionsFromBackend,
  roundToMultiple,
  route,
  router,
  runConcurrently,
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
  selectedEpisodeId,
  selectedAiConfigIds,
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
  toggleNav,
  toggleTheme,
  trackFilmCreateAction,
  ttsAiPayload,
  ttsSbIds,
  ttsSbNarrationIds,
  universalOmniPolishProgress,
  universalOmniPolishRunning,
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
