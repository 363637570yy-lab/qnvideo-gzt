<template>
  <section class="section card script-workbench-unified">
    <el-tabs v-model="modeModel" class="script-workbench-tabs">
      <el-tab-pane label="创作剧本" name="create">
        <div class="script-pane-inner">
          <div class="script-sub-block">
            <h2 class="section-title">故事生成</h2>
            <p class="section-desc">输入一段故事梗概，AI 帮你扩写成完整剧本，或直接导入小说章节</p>
            <el-input
              v-model="storyInputModel"
              type="textarea"
              :rows="4"
              placeholder="例如：一个少女在森林里遇见会说话的狐狸，一起寻找失落的宝石..."
              class="story-textarea"
            />
            <div class="row gap story-action-row">
              <el-select v-model="storyStyleModel" placeholder="故事风格" clearable style="width: 120px" @change="$emit('save-project-settings')">
                <el-option label="现代" value="modern" />
                <el-option label="古风" value="ancient" />
                <el-option label="奇幻" value="fantasy" />
                <el-option label="日常" value="daily" />
              </el-select>
              <el-select v-model="storyTypeModel" placeholder="剧本类型" clearable style="width: 120px" @change="$emit('save-project-settings')">
                <el-option label="剧情" value="drama" />
                <el-option label="喜剧" value="comedy" />
                <el-option label="冒险" value="adventure" />
              </el-select>
              <div class="story-episode-count">
                <span>生成</span>
                <el-input-number
                  v-model="storyEpisodeCountModel"
                  :min="1"
                  :max="maxEpisodeCount"
                  :step="1"
                  :precision="0"
                  controls-position="right"
                  aria-label="生成集数"
                  @change="$emit('normalize-story-episode-count')"
                />
                <span>集</span>
              </div>
              <el-button type="primary" :loading="storyGenerating" @click="$emit('generate-story')">
                生成剧本
              </el-button>
              <el-button plain @click="$emit('open-novel-import')">
                <el-icon><DocumentAdd /></el-icon>
                导入小说
              </el-button>
            </div>
          </div>
          <div class="script-sub-divider" />
          <div id="anchor-script" class="script-sub-block">
            <h2 class="section-title">剧本</h2>
            <div class="row gap script-edit-row">
              <el-select
                v-model="selectedEpisodeIdModel"
                placeholder="选择集数"
                clearable
                style="width: 130px"
                :disabled="!dramaId"
                @change="$emit('episode-select', $event)"
              >
                <el-option
                  v-for="ep in episodes"
                  :key="ep.id"
                  :label="ep.title || '第' + (ep.episode_number || 0) + '集'"
                  :value="ep.id"
                />
              </el-select>
              <el-input v-model="scriptTitleModel" placeholder="集标题" style="width: 150px" />
              <el-button v-if="dramaId" class="add-episode-button" @click="$emit('add-episode')">
                <el-icon><Plus /></el-icon>添加一集
              </el-button>
            </div>
            <el-input
              v-model="scriptContentModel"
              type="textarea"
              :rows="8"
              placeholder="剧本内容将显示在这里，可直接编辑..."
              class="story-textarea"
            />
            <div class="row gap script-save-row">
              <el-button
                :loading="scriptGenerating"
                :disabled="!!dramaId && episodes.length > 0 && !currentEpisodeId"
                @click="$emit('generate-script')"
              >
                保存当前集
              </el-button>
            </div>
          </div>
        </div>
      </el-tab-pane>
      <el-tab-pane label="选择剧本" name="select">
        <p class="section-desc script-mode-hint">
          从剧本库选择后，仅把「故事梗概」与「各集剧本正文」写入当前工程，不会导入角色、分镜、图片或视频。
        </p>
        <el-button type="primary" @click="$emit('open-select-script')">
          <el-icon><Document /></el-icon>
          从已有剧本中选择…
        </el-button>
        <div v-if="dramaId && (episodes.length || storyInputModel)" class="script-preview-wrap">
          <h3 class="preview-block-title">故事梗概</h3>
          <el-input
            :model-value="storyInputModel"
            type="textarea"
            :rows="3"
            readonly
            class="story-textarea"
          />
          <template v-if="episodes.length > 1">
            <h3 class="preview-block-title">分集剧本</h3>
            <el-tabs v-model="selectPreviewEpisodeIdModel" class="preview-ep-tabs">
              <el-tab-pane
                v-for="ep in episodes"
                :key="ep.id"
                :label="ep.title || ('第' + (ep.episode_number || 0) + '集')"
                :name="String(ep.id)"
              >
                <el-input
                  :model-value="ep.script_content || ''"
                  type="textarea"
                  :rows="12"
                  readonly
                  class="story-textarea"
                />
              </el-tab-pane>
            </el-tabs>
          </template>
          <template v-else>
            <h3 class="preview-block-title">剧本正文</h3>
            <el-input
              :model-value="scriptContentModel"
              type="textarea"
              :rows="12"
              readonly
              class="story-textarea"
            />
          </template>
          <div class="preview-actions">
            <el-button type="primary" plain @click="modeModel = 'create'">切换到创作剧本以编辑</el-button>
          </div>
        </div>
        <p v-else class="script-select-empty">尚未选择剧本，请点击上方按钮</p>
      </el-tab-pane>
    </el-tabs>
  </section>
</template>

<script setup>
import { Document, DocumentAdd, Plus } from '@element-plus/icons-vue'

const modeModel = defineModel('mode', { type: String, default: 'create' })
const storyInputModel = defineModel('storyInput', { type: String, default: '' })
const storyStyleModel = defineModel('storyStyle', { type: String, default: '' })
const storyTypeModel = defineModel('storyType', { type: String, default: '' })
const storyEpisodeCountModel = defineModel('storyEpisodeCount', { type: Number, default: 1 })
const selectedEpisodeIdModel = defineModel('selectedEpisodeId', { type: [Number, String, null], default: null })
const scriptTitleModel = defineModel('scriptTitle', { type: String, default: '' })
const scriptContentModel = defineModel('scriptContent', { type: String, default: '' })
const selectPreviewEpisodeIdModel = defineModel('selectPreviewEpisodeId', { type: String, default: '' })

defineProps({
  maxEpisodeCount: { type: Number, default: 20 },
  storyGenerating: { type: Boolean, default: false },
  scriptGenerating: { type: Boolean, default: false },
  dramaId: { type: [Number, String, null], default: null },
  currentEpisodeId: { type: [Number, String, null], default: null },
  episodes: { type: Array, default: () => [] },
})

defineEmits([
  'save-project-settings',
  'normalize-story-episode-count',
  'generate-story',
  'open-novel-import',
  'episode-select',
  'add-episode',
  'generate-script',
  'open-select-script',
])
</script>

<style scoped>
.section {
  margin-bottom: 24px;
}
.card {
  background: #1e1f28;
  border-radius: 14px;
  padding: 22px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
}
html.light .card {
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(16px) saturate(1.3);
  -webkit-backdrop-filter: blur(16px) saturate(1.3);
  border-color: rgba(139, 92, 246, 0.08);
  box-shadow: 0 1px 0 rgba(255,255,255,0.8) inset, 0 4px 20px rgba(99, 102, 241, 0.05);
}
.section-title {
  font-size: 1.05rem;
  margin: 0 0 4px;
  color: #f4f4f5;
  font-weight: 600;
  letter-spacing: -0.01em;
}
html.light .section-title { color: #1e1b4b; }
.section-desc {
  margin: 0 0 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.55;
}
.row {
  display: flex;
  align-items: center;
}
.gap {
  gap: 10px;
}
.script-workbench-unified {
  margin-bottom: 0;
  order: 3;
}
.script-workbench-tabs :deep(.el-tabs__header) {
  margin-bottom: 16px;
}
.script-workbench-tabs :deep(.el-tabs__nav-wrap::after) {
  height: 1px;
}
.script-workbench-tabs :deep(.el-tabs__item) {
  font-size: 15px;
  font-weight: 600;
}
.script-pane-inner {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.script-sub-block {
  padding-top: 4px;
}
.script-sub-divider {
  margin: 20px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
html.light .script-sub-divider {
  border-top-color: rgba(0, 0, 0, 0.08);
}
.story-action-row,
.script-edit-row,
.script-save-row {
  margin-top: 10px;
  flex-wrap: wrap;
}
.script-edit-row {
  margin-bottom: 10px;
}
.script-save-row {
  margin-top: 8px;
}
.add-episode-button {
  margin-left: auto;
}
.story-textarea :deep(.el-textarea__inner) {
  line-height: 1.65;
}
.story-episode-count {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.story-episode-count :deep(.el-input-number) {
  width: 96px;
}
.script-mode-hint {
  margin-top: 0;
  margin-bottom: 12px;
}
.script-preview-wrap {
  margin-top: 20px;
}
.preview-block-title {
  margin: 16px 0 8px;
  font-size: 0.95rem;
  font-weight: 600;
  color: #a1a1aa;
}
html.light .preview-block-title {
  color: #64748b;
}
.preview-block-title:first-of-type {
  margin-top: 0;
}
.preview-actions {
  margin-top: 16px;
}
.script-select-empty {
  margin-top: 16px;
  color: #71717a;
  font-size: 14px;
}
.preview-ep-tabs {
  margin-top: 4px;
}
</style>

