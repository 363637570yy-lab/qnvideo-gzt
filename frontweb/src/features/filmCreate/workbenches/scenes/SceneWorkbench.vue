<template>
          <!-- 场景生成 -->
          <div v-show="filmWorkbenchTab === 'scenes'" id="anchor-scenes" class="resource-block card">
            <div class="collapse-header resource-block-header" @click="scenesBlockCollapsed = !scenesBlockCollapsed">
              <h3 class="resource-block-title">场景生成</h3>
              <el-icon class="collapse-icon"><ArrowUp v-if="!scenesBlockCollapsed" /><ArrowDown v-else /></el-icon>
            </div>
            <div v-if="!scenesBlockCollapsed" class="resource-block-body">
              <div class="asset-actions">
                <el-button
                  :type="scenesExtracting ? 'warning' : 'primary'"
                  size="small"
                  :disabled="!scenesExtracting && !currentEpisodeId"
                  @click="scenesExtracting ? stopEpisodeTask(GEN_RESOURCE.EXTRACT_SCENES, '已停止场景提取') : onExtractScenes()"
                >
                  <el-icon v-if="scenesExtracting" class="is-loading"><Loading /></el-icon>
                  {{ scenesExtracting ? '停止' : '从剧本提取场景' }}
                </el-button>
                <el-button size="small" :disabled="!dramaId" @click="openAddScene">添加场景</el-button>
                <el-button size="small" @click="showSceneLibrary = true">本剧场景库</el-button>
                <span class="workflow-preset-label">生成规范</span>
                <el-select
                  v-model="selectedWorkflowPresetIds.scene"
                  size="small"
                  filterable
                  class="workflow-preset-select"
                  :loading="workflowPresetLoading"
                >
                  <el-option
                    v-for="preset in workflowPresetOptions.scene"
                    :key="preset.id"
                    :label="workflowPresetLabel(preset)"
                    :value="String(preset.id)"
                  />
                </el-select>
                <el-button v-if="isAdminUser" size="small" @click="showWorkflowConfigDialog = true">配置</el-button>
              </div>
              <div class="asset-list asset-list-two">
                <div v-for="scene in scenes" :key="scene.id" class="asset-item asset-item-left-right">
                  <div class="asset-info">
                    <div class="asset-name">
                      <span>{{ scene.location }}</span>
                      <el-button type="danger" text size="small" class="btn-delete-icon" title="删除" @click="onDeleteScene(scene)">
                        <el-icon><Delete /></el-icon>
                      </el-button>
                    </div>
                    <div class="asset-desc-full">{{ scene.description || scene.prompt || scene.time || '暂无描述' }}</div>
                    <div class="asset-btns">
                      <el-button size="small" @click="editScene(scene)">编辑</el-button>
                      <el-button size="small" :loading="addingSceneToLibraryId === scene.id" :disabled="!hasAssetImage(scene)" @click="onAddSceneToLibrary(scene)">
                        加入本剧库
                      </el-button>
                      <el-button size="small" :loading="addingSceneToMaterialId === scene.id" :disabled="!hasAssetImage(scene)" @click="onAddSceneToMaterialLibrary(scene)">
                        加入素材库
                      </el-button></div>
                    <div v-if="getSceneAffectedStoryboards(scene.id).length" class="asset-storyboard-link">
                      <span class="asl-label">影响的分镜：</span>
                      <span
                        v-for="sb in getSceneAffectedStoryboards(scene.id)"
                        :key="sb.id"
                        class="asl-chip"
                        title="点击跳转到该分镜"
                        @click="scrollToStoryboard(sb.id)"
                      >#{{ sb.storyboard_number }}</span>
                      <span v-if="regenSbImagesForAsset.has('scene-' + scene.id) && regenSbImagesProgress['scene-' + scene.id]" class="asl-progress">
                        {{ regenSbImagesProgress['scene-' + scene.id].current }}/{{ regenSbImagesProgress['scene-' + scene.id].total }}
                      </span>
                      <el-button
                        size="small"
                        class="asl-regen-btn"
                        :loading="regenSbImagesForAsset.has('scene-' + scene.id)"
                        @click="onRegenAffectedSbImages('scene-' + scene.id, getSceneAffectedStoryboards(scene.id))"
                      >
                        <span v-if="!regenSbImagesForAsset.has('scene-' + scene.id)">↻ 重新生成分镜图</span>
                      </el-button>
                    </div>
                  </div>
                  <div class="asset-cover-wrap">
                    <div
                      class="asset-cover"
                      :class="{ 'asset-cover--clickable': hasAssetImage(scene), 'asset-cover--dragover': dragOverResourceKey === 'scene-' + scene.id }"
                      role="button"
                      tabindex="0"
                      @click="hasAssetImage(scene) && openImagePreview(assetImageUrl(scene))"
                      @dragover="onResourceDragOver($event, 'scene', scene.id)"
                      @dragleave="onResourceDragLeave($event, 'scene-' + scene.id)"
                      @drop="onResourceDrop($event, 'scene', scene.id)"
                    >
                      <img v-if="hasAssetImage(scene)" :src="assetThumbUrl(scene, 320)" class="cover-img" alt="" loading="lazy" decoding="async" />
                      <div v-if="hasAssetImage(scene)" class="asset-primary-badge">当前主图</div>
                      <div v-else-if="scene.error_msg || scene.errorMsg" class="cover-placeholder error" :title="scene.error_msg || scene.errorMsg">{{ scene.error_msg || scene.errorMsg }}</div>
                      <div v-else class="cover-placeholder">暂无图</div>
                      <div v-if="isResourceGenerating(GEN_RESOURCE.SCENE_IMAGE, scene.id)" class="ai-generating-overlay">
                        <span class="ai-generating-timer">{{ resourceElapsedLabel(GEN_RESOURCE.SCENE_IMAGE, scene.id) }}</span>
                        <el-icon class="ai-generating-spinner is-loading"><Loading /></el-icon>
                        <span class="ai-generating-text">生成中...</span>
                      </div>
                      <div v-if="dragOverResourceKey === 'scene-' + scene.id" class="asset-cover-drop-hint">松开上传</div>
                    </div>
                    <div v-if="parseExtraImages(scene).length" class="extra-images-strip">
                      <div v-for="ep in parseExtraImages(scene)" :key="ep" class="extra-thumb" title="点击设为主图（悬停左上角可放大预览）">
                        <img :src="localPathToThumbUrl(ep, 160)" alt="" loading="lazy" decoding="async" @click="onSetPrimaryImage('scene', scene, ep)" />
                        <button class="thumb-preview-btn" title="放大预览" @click.stop="openImagePreview(localPathToUrl(ep))">
                          <el-icon :size="10"><ZoomIn /></el-icon>
                        </button>
                        <button class="extra-thumb-remove" title="移除" @click.stop="onRemoveExtraImage('scene', scene, ep)">×</button>
                      </div>
                    </div>
                    <div class="asset-cover-actions">
                      <el-tooltip :content="selectedWorkflowPresetName('scene')" placement="top">
                        <el-button
                          :type="isResourceGenerating(GEN_RESOURCE.SCENE_IMAGE, scene.id) ? 'warning' : 'primary'"
                          size="small"
                          @click="isResourceGenerating(GEN_RESOURCE.SCENE_IMAGE, scene.id) ? stopResourceGeneration(GEN_RESOURCE.SCENE_IMAGE, scene.id) : onGenerateSceneImage(scene)"
                        >
                          <el-icon v-if="isResourceGenerating(GEN_RESOURCE.SCENE_IMAGE, scene.id)" class="is-loading"><Loading /></el-icon>
                          <el-icon v-else><MagicStick /></el-icon>
                          {{ isResourceGenerating(GEN_RESOURCE.SCENE_IMAGE, scene.id) ? '停止' : 'AI 生成' }}
                        </el-button>
                      </el-tooltip>
                      <el-button type="success" size="small" :loading="uploadingResourceId === 'scene-' + scene.id" @click="onUploadResourceClick('scene', scene.id)">
                        <el-icon v-if="uploadingResourceId !== 'scene-' + scene.id"><Upload /></el-icon>
                        上传
                      </el-button>
                    </div>
                  </div>
                </div>
                <div v-if="scenes.length === 0" class="empty-tip">暂无场景，请从剧本提取</div>
              </div>
            </div>
          </div>

</template>

<script>
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Setting, Plus, Minus, Sunny, Moon, MagicStick, Upload, Delete, Check, Loading, WarningFilled, User, Box, Picture, Film, VideoCamera, Document, InfoFilled, Refresh, ZoomIn, QuestionFilled, DocumentAdd, Expand, Fold, VideoPlay, DataAnalysis } from '@element-plus/icons-vue'
import UniversalSegmentOmniAtEditor from '@/components/UniversalSegmentOmniAtEditor.vue'

export default {
  name: 'SceneWorkbench',
  props: { ctx: { type: Object, required: true } },
  components: { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Setting, Plus, Minus, Sunny, Moon, MagicStick, Upload, Delete, Check, Loading, WarningFilled, User, Box, Picture, Film, VideoCamera, Document, InfoFilled, Refresh, ZoomIn, QuestionFilled, DocumentAdd, Expand, Fold, VideoPlay, DataAnalysis, UniversalSegmentOmniAtEditor },
  setup(props) { return props.ctx },
}
</script>
