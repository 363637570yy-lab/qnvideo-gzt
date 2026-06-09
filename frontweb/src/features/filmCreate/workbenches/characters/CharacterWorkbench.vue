<template>
          <!-- 角色生成 -->
          <div v-show="filmWorkbenchTab === 'characters'" id="anchor-characters" class="resource-block card">
            <div class="collapse-header resource-block-header" @click="charactersBlockCollapsed = !charactersBlockCollapsed">
              <h3 class="resource-block-title">角色生成</h3>
              <el-icon class="collapse-icon"><ArrowUp v-if="!charactersBlockCollapsed" /><ArrowDown v-else /></el-icon>
            </div>
            <div v-if="!charactersBlockCollapsed" class="resource-block-body">
              <div class="asset-actions">
                <el-button
                  :type="charactersGenerating ? 'warning' : 'primary'"
                  size="small"
                  :disabled="!charactersGenerating && !dramaId"
                  @click="charactersGenerating ? stopEpisodeTask(GEN_RESOURCE.EXTRACT_CHARACTERS, '已停止角色提取') : onGenerateCharacters()"
                >
                  <el-icon v-if="charactersGenerating" class="is-loading"><Loading /></el-icon>
                  {{ charactersGenerating ? '停止' : '剧本自动提取角色' }}
                </el-button>
                <el-button size="small" :disabled="!dramaId" @click="openAddCharacter">添加角色</el-button>
                <el-button size="small" @click="showCharLibrary = true">本剧角色库</el-button>
                <span class="workflow-preset-label">生成规范</span>
                <el-select
                  v-model="selectedWorkflowPresetIds.character"
                  size="small"
                  filterable
                  class="workflow-preset-select"
                  :loading="workflowPresetLoading"
                >
                  <el-option
                    v-for="preset in workflowPresetOptions.character"
                    :key="preset.id"
                    :label="workflowPresetLabel(preset)"
                    :value="String(preset.id)"
                  />
                </el-select>
                <el-button v-if="isAdminUser" size="small" @click="showWorkflowConfigDialog = true">配置</el-button>
              </div>
              <div class="asset-list asset-list-two">
                <div v-for="char in characters" :key="char.id" class="asset-item asset-item-left-right">
                  <div class="asset-info">
                    <div class="asset-name">
                      <span style="display:inline-flex;align-items:center;gap:4px;flex:1;min-width:0;overflow:hidden">
                        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ char.name }}</span>
                        <el-tag v-if="char.role" size="small" effect="plain" :type="char.role === 'main' ? 'danger' : char.role === 'supporting' ? 'warning' : 'info'" style="flex-shrink:0;padding:0 5px;font-size:11px;height:18px;line-height:18px">{{ charRoleLabel(char.role) }}</el-tag>
                      </span>
                      <el-button type="danger" text size="small" class="btn-delete-icon" title="删除" @click="onDeleteCharacter(char)">
                        <el-icon><Delete /></el-icon>
                      </el-button>
                    </div>
                    <div class="asset-desc-full">{{ char.appearance || char.description || '暂无描述' }}</div>
                    <div class="asset-btns">
                      <el-button size="small" @click="editCharacter(char)">编辑</el-button>
                      <el-button size="small" :loading="addingCharToLibraryId === char.id" :disabled="!hasAssetImage(char)" @click="onAddCharacterToLibrary(char)">
                        加入本剧库
                      </el-button>
                      <el-button size="small" :loading="addingCharToMaterialId === char.id" :disabled="!hasAssetImage(char)" @click="onAddCharacterToMaterialLibrary(char)">
                        加入素材库
                      </el-button><el-button
                        size="small"
                        :type="char.seedance2_asset?.status === 'active' ? 'success' : 'warning'"
                        plain
                        :loading="sd2CertifyingId === char.id"
                        :disabled="!hasAssetImage(char)"
                        @click="onSd2PrimaryAction(char)"
                      >
                        {{ sd2ActionLabel(char) }}
                      </el-button>
                    </div>

                    <!-- Seedance 2.0 音色参考（仅该模型有效，其他模型不生效） -->
                    <div class="sd2-voice-row" style="margin-top:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                      <template v-if="char.seedance2_voice_asset?.status === 'active'">
                        <!-- 音色参考已设置：显示试听 + 更换 -->
                        <el-button
                          size="small"
                          type="success"
                          plain
                          @click="playSd2Voice(char)"
                        >
                          <el-icon><VideoPlay /></el-icon>
                          <span style="margin-left:4px">试听</span>
                        </el-button>
                        <el-button
                          size="small"
                          type="primary"
                          plain
                          :loading="sd2VoiceUploadingId === char.id"
                          @click="onSd2VoiceReplace(char)"
                        >
                          更换
                        </el-button>
                        <span style="font-size:11px;color:#67c23a">音色已设置</span>
                      </template>
                      <template v-else>
                        <el-button
                          size="small"
                          :type="char.seedance2_voice_asset?.status === 'stale' ? 'warning' : 'info'"
                          plain
                          :loading="sd2VoiceUploadingId === char.id"
                          @click="onSd2VoicePrimaryAction(char)"
                        >
                          {{ sd2VoiceActionLabel(char) }}
                        </el-button>
                        <span v-if="char.seedance2_voice_asset?.status === 'stale'" style="font-size:11px;color:#e6a23c">需刷新</span>
                      </template>
                      <span style="font-size:10px;color:#909399">仅 Seedance 2.0 模型生效</span>
                    </div>
                    <div v-if="getCharAffectedStoryboards(char.id).length" class="asset-storyboard-link">
                      <span class="asl-label">影响的分镜：</span>
                      <span
                        v-for="sb in getCharAffectedStoryboards(char.id)"
                        :key="sb.id"
                        class="asl-chip"
                        title="点击跳转到该分镜"
                        @click="scrollToStoryboard(sb.id)"
                      >#{{ sb.storyboard_number }}</span>
                      <span v-if="regenSbImagesForAsset.has('char-' + char.id) && regenSbImagesProgress['char-' + char.id]" class="asl-progress">
                        {{ regenSbImagesProgress['char-' + char.id].current }}/{{ regenSbImagesProgress['char-' + char.id].total }}
                      </span>
                      <el-button
                        size="small"
                        class="asl-regen-btn"
                        :loading="regenSbImagesForAsset.has('char-' + char.id)"
                        @click="onRegenAffectedSbImages('char-' + char.id, getCharAffectedStoryboards(char.id))"
                      >
                        <span v-if="!regenSbImagesForAsset.has('char-' + char.id)">↻ 重新生成分镜图</span>
                      </el-button>
                    </div>
                  </div>
                  <div class="asset-cover-wrap">
                    <div
                      class="asset-cover"
                      :class="{ 'asset-cover--clickable': hasAssetImage(char), 'asset-cover--dragover': dragOverResourceKey === 'char-' + char.id }"
                      role="button"
                      tabindex="0"
                      @click="hasAssetImage(char) && openImagePreview(assetImageUrl(char))"
                      @dragover="onResourceDragOver($event, 'character', char.id)"
                      @dragleave="onResourceDragLeave($event, 'char-' + char.id)"
                      @drop="onResourceDrop($event, 'character', char.id)"
                    >
                      <img v-if="hasAssetImage(char)" :src="assetThumbUrl(char, 320)" class="cover-img" alt="" loading="lazy" decoding="async" />
                      <div v-if="hasAssetImage(char)" class="asset-primary-badge">当前主图</div>
                      <div v-else-if="char.error_msg || char.errorMsg" class="cover-placeholder error" :title="char.error_msg || char.errorMsg">{{ char.error_msg || char.errorMsg }}</div>
                      <div v-else class="cover-placeholder">暂无图</div>
                      <div v-if="isResourceGenerating(GEN_RESOURCE.CHAR_IMAGE, char.id)" class="ai-generating-overlay">
                        <span class="ai-generating-timer">{{ resourceElapsedLabel(GEN_RESOURCE.CHAR_IMAGE, char.id) }}</span>
                        <el-icon class="ai-generating-spinner is-loading"><Loading /></el-icon>
                        <span class="ai-generating-text">生成中...</span>
                      </div>
                      <div v-if="dragOverResourceKey === 'char-' + char.id" class="asset-cover-drop-hint">松开上传</div>
                    </div>
                    <!-- 额外参考图条 -->
                    <div v-if="parseExtraImages(char).length" class="extra-images-strip">
                      <div v-for="ep in parseExtraImages(char)" :key="ep" class="extra-thumb" :title="'点击设为主图（悬停左上角可放大预览）'">
                        <img :src="localPathToThumbUrl(ep, 160)" alt="" loading="lazy" decoding="async" @click="onSetPrimaryImage('character', char, ep)" />
                        <button class="thumb-preview-btn" title="放大预览" @click.stop="openImagePreview(localPathToUrl(ep))">
                          <el-icon :size="10"><ZoomIn /></el-icon>
                        </button>
                        <button class="extra-thumb-remove" title="移除" @click.stop="onRemoveExtraImage('character', char, ep)">×</button>
                      </div>
                    </div>
                    <div class="asset-cover-actions">
                      <el-button
                        :type="isResourceGenerating(GEN_RESOURCE.CHAR_IMAGE, char.id) ? 'warning' : 'primary'"
                        size="small"
                        @click="isResourceGenerating(GEN_RESOURCE.CHAR_IMAGE, char.id) ? stopResourceGeneration(GEN_RESOURCE.CHAR_IMAGE, char.id) : onGenerateCharacterImage(char)"
                      >
                        <el-icon v-if="isResourceGenerating(GEN_RESOURCE.CHAR_IMAGE, char.id)" class="is-loading"><Loading /></el-icon>
                        <el-icon v-else><MagicStick /></el-icon>
                        {{ isResourceGenerating(GEN_RESOURCE.CHAR_IMAGE, char.id) ? '停止' : 'AI 生成' }}
                      </el-button>
                      <el-button type="success" size="small" :loading="uploadingResourceId === 'char-' + char.id" @click="onUploadResourceClick('character', char.id)">
                        <el-icon v-if="uploadingResourceId !== 'char-' + char.id"><Upload /></el-icon>
                        上传
                      </el-button>
                    </div>
                  </div>
                </div>
                <div v-if="characters.length === 0" class="empty-tip">暂无角色，请先「AI 生成角色」或在上一步保存剧本后提取</div>
              </div>
            </div>
          </div>


</template>

<script>
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Setting, Plus, Minus, Sunny, Moon, MagicStick, Upload, Delete, Check, Loading, WarningFilled, User, Box, Picture, Film, VideoCamera, Document, InfoFilled, Refresh, ZoomIn, QuestionFilled, DocumentAdd, Expand, Fold, VideoPlay, DataAnalysis } from '@element-plus/icons-vue'
import UniversalSegmentOmniAtEditor from '@/components/UniversalSegmentOmniAtEditor.vue'

export default {
  name: 'CharacterWorkbench',
  props: { ctx: { type: Object, required: true } },
  components: { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Setting, Plus, Minus, Sunny, Moon, MagicStick, Upload, Delete, Check, Loading, WarningFilled, User, Box, Picture, Film, VideoCamera, Document, InfoFilled, Refresh, ZoomIn, QuestionFilled, DocumentAdd, Expand, Fold, VideoPlay, DataAnalysis, UniversalSegmentOmniAtEditor },
  setup(props) { return props.ctx },
}
</script>
