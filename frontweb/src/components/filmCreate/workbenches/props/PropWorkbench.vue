<template>
          <!-- 道具生成 -->
          <div v-show="filmWorkbenchTab === 'props'" id="anchor-props" class="resource-block card">
            <div class="collapse-header resource-block-header" @click="propsBlockCollapsed = !propsBlockCollapsed">
              <h3 class="resource-block-title">道具生成</h3>
              <el-icon class="collapse-icon"><ArrowUp v-if="!propsBlockCollapsed" /><ArrowDown v-else /></el-icon>
            </div>
            <div v-if="!propsBlockCollapsed" class="resource-block-body">
              <div class="asset-actions">
                <el-button
                  :type="propsExtracting ? 'warning' : 'primary'"
                  size="small"
                  :disabled="!propsExtracting && !currentEpisodeId"
                  @click="propsExtracting ? stopEpisodeTask(GEN_RESOURCE.EXTRACT_PROPS, '已停止道具提取') : onExtractProps()"
                >
                  <el-icon v-if="propsExtracting" class="is-loading"><Loading /></el-icon>
                  {{ propsExtracting ? '停止' : '从剧本提取道具' }}
                </el-button>
                <el-button size="small" :disabled="!dramaId" @click="showAddProp = true">添加道具</el-button>
                <el-button size="small" @click="showPropLibrary = true">本剧道具库</el-button>
                <span class="workflow-preset-label">生成规范</span>
                <el-select
                  v-model="selectedWorkflowPresetIds.prop"
                  size="small"
                  filterable
                  class="workflow-preset-select"
                  :loading="workflowPresetLoading"
                >
                  <el-option
                    v-for="preset in workflowPresetOptions.prop"
                    :key="preset.id"
                    :label="workflowPresetLabel(preset)"
                    :value="String(preset.id)"
                  />
                </el-select>
                <el-button v-if="isAdminUser" size="small" @click="showWorkflowConfigDialog = true">配置</el-button>
              </div>
              <div class="asset-list asset-list-two">
                <div v-for="prop in props" :key="prop.id" class="asset-item asset-item-left-right">
                  <div class="asset-info">
                    <div class="asset-name">
                      <span>{{ prop.name }}</span>
                      <el-button type="danger" text size="small" class="btn-delete-icon" title="删除" @click="onDeleteProp(prop)">
                        <el-icon><Delete /></el-icon>
                      </el-button>
                    </div>
                    <div class="asset-desc-full">{{ prop.description || prop.prompt || '暂无描述' }}</div>
                    <div class="asset-btns">
                      <el-button size="small" @click="editProp(prop)">编辑</el-button>
                      <el-button size="small" :loading="addingPropToLibraryId === prop.id" :disabled="!hasAssetImage(prop)" @click="onAddPropToLibrary(prop)">
                        加入本剧库
                      </el-button>
                      <el-button size="small" :loading="addingPropToMaterialId === prop.id" :disabled="!hasAssetImage(prop)" @click="onAddPropToMaterialLibrary(prop)">
                        加入素材库
                      </el-button></div>
                    <div v-if="getPropAffectedStoryboards(prop.id).length" class="asset-storyboard-link">
                      <span class="asl-label">影响的分镜：</span>
                      <span
                        v-for="sb in getPropAffectedStoryboards(prop.id)"
                        :key="sb.id"
                        class="asl-chip"
                        title="点击跳转到该分镜"
                        @click="scrollToStoryboard(sb.id)"
                      >#{{ sb.storyboard_number }}</span>
                      <span v-if="regenSbImagesForAsset.has('prop-' + prop.id) && regenSbImagesProgress['prop-' + prop.id]" class="asl-progress">
                        {{ regenSbImagesProgress['prop-' + prop.id].current }}/{{ regenSbImagesProgress['prop-' + prop.id].total }}
                      </span>
                      <el-button
                        size="small"
                        class="asl-regen-btn"
                        :loading="regenSbImagesForAsset.has('prop-' + prop.id)"
                        @click="onRegenAffectedSbImages('prop-' + prop.id, getPropAffectedStoryboards(prop.id))"
                      >
                        <span v-if="!regenSbImagesForAsset.has('prop-' + prop.id)">↻ 重新生成分镜图</span>
                      </el-button>
                    </div>
                  </div>
                  <div class="asset-cover-wrap">
                    <div
                      class="asset-cover"
                      :class="{ 'asset-cover--clickable': hasAssetImage(prop), 'asset-cover--dragover': dragOverResourceKey === 'prop-' + prop.id }"
                      role="button"
                      tabindex="0"
                      @click="hasAssetImage(prop) && openImagePreview(assetImageUrl(prop))"
                      @dragover="onResourceDragOver($event, 'prop', prop.id)"
                      @dragleave="onResourceDragLeave($event, 'prop-' + prop.id)"
                      @drop="onResourceDrop($event, 'prop', prop.id)"
                    >
                      <img v-if="hasAssetImage(prop)" :src="assetThumbUrl(prop, 320)" class="cover-img" alt="" loading="lazy" decoding="async" />
                      <div v-if="hasAssetImage(prop)" class="asset-primary-badge">当前主图</div>
                      <div v-else-if="prop.error_msg || prop.errorMsg" class="cover-placeholder error" :title="prop.error_msg || prop.errorMsg">{{ prop.error_msg || prop.errorMsg }}</div>
                      <div v-else class="cover-placeholder">暂无图</div>
                      <div v-if="isResourceGenerating(GEN_RESOURCE.PROP_IMAGE, prop.id)" class="ai-generating-overlay">
                        <span class="ai-generating-timer">{{ resourceElapsedLabel(GEN_RESOURCE.PROP_IMAGE, prop.id) }}</span>
                        <el-icon class="ai-generating-spinner is-loading"><Loading /></el-icon>
                        <span class="ai-generating-text">生成中...</span>
                      </div>
                      <div v-if="dragOverResourceKey === 'prop-' + prop.id" class="asset-cover-drop-hint">松开上传</div>
                    </div>
                    <div v-if="parseExtraImages(prop).length" class="extra-images-strip">
                      <div v-for="ep in parseExtraImages(prop)" :key="ep" class="extra-thumb" title="点击设为主图（悬停左上角可放大预览）">
                        <img :src="localPathToThumbUrl(ep, 160)" alt="" loading="lazy" decoding="async" @click="onSetPrimaryImage('prop', prop, ep)" />
                        <button class="thumb-preview-btn" title="放大预览" @click.stop="openImagePreview(localPathToUrl(ep))">
                          <el-icon :size="10"><ZoomIn /></el-icon>
                        </button>
                        <button class="extra-thumb-remove" title="移除" @click.stop="onRemoveExtraImage('prop', prop, ep)">×</button>
                      </div>
                    </div>
                    <div class="asset-cover-actions">
                      <el-tooltip :content="selectedWorkflowPresetName('prop')" placement="top">
                        <el-button
                          :type="isResourceGenerating(GEN_RESOURCE.PROP_IMAGE, prop.id) ? 'warning' : 'primary'"
                          size="small"
                          @click="isResourceGenerating(GEN_RESOURCE.PROP_IMAGE, prop.id) ? stopResourceGeneration(GEN_RESOURCE.PROP_IMAGE, prop.id) : onGeneratePropImage(prop)"
                        >
                          <el-icon v-if="isResourceGenerating(GEN_RESOURCE.PROP_IMAGE, prop.id)" class="is-loading"><Loading /></el-icon>
                          <el-icon v-else><MagicStick /></el-icon>
                          {{ isResourceGenerating(GEN_RESOURCE.PROP_IMAGE, prop.id) ? '停止' : 'AI 生成' }}
                        </el-button>
                      </el-tooltip>
                      <el-button type="success" size="small" :loading="uploadingResourceId === 'prop-' + prop.id" @click="onUploadResourceClick('prop', prop.id)">
                        <el-icon v-if="uploadingResourceId !== 'prop-' + prop.id"><Upload /></el-icon>
                        上传
                      </el-button>
                    </div>
                  </div>
                </div>
                <div v-if="props.length === 0" class="empty-tip">暂无道具，可从剧本提取或添加</div>
              </div>
            </div>
          </div>


</template>

<script>
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Setting, Plus, Minus, Sunny, Moon, MagicStick, Upload, Delete, Check, Loading, WarningFilled, User, Box, Picture, Film, VideoCamera, Document, InfoFilled, Refresh, ZoomIn, QuestionFilled, DocumentAdd, Expand, Fold, VideoPlay, DataAnalysis } from '@element-plus/icons-vue'
import UniversalSegmentOmniAtEditor from '@/components/UniversalSegmentOmniAtEditor.vue'

export default {
  name: 'PropWorkbench',
  props: { ctx: { type: Object, required: true } },
  components: { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Setting, Plus, Minus, Sunny, Moon, MagicStick, Upload, Delete, Check, Loading, WarningFilled, User, Box, Picture, Film, VideoCamera, Document, InfoFilled, Refresh, ZoomIn, QuestionFilled, DocumentAdd, Expand, Fold, VideoPlay, DataAnalysis, UniversalSegmentOmniAtEditor },
  setup(props) { return props.ctx },
}
</script>
