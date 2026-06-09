<template>
  <section class="section card video-config-section">
    <h2 class="section-title">视频配置</h2>
    <div class="config-grid">
      <el-form-item label="字幕">
        <div class="video-option-row">
          <el-switch v-model="subtitleModel" />
          <span v-if="subtitleModel" class="video-option-hint">开启后，合成整集时会检测解说旁白：若有文案则自动生成 SRT、按分镜时长合成旁白语音（过长加速 / 过短补静音）、与成片对齐后烧录字幕并混音。</span>
        </div>
      </el-form-item>
      <el-form-item label="对白烧录">
        <div class="video-option-row">
          <el-switch v-model="burnDialogueModel" />
          <span v-if="burnDialogueModel" class="video-option-hint">开启后，将把各镜「配音」生成的对白 TTS 按分镜时长对齐并混入整集成片（无对白音频的分镜为静音）。可与「字幕」旁白同时开启，两条音轨会叠混。</span>
        </div>
      </el-form-item>
      <el-form-item label="水印">
        <div class="video-option-row">
          <el-switch v-model="watermarkModel" />
          <el-input
            v-if="watermarkModel"
            v-model="watermarkTextModel"
            placeholder="右下角水印文字"
            maxlength="200"
            show-word-limit
            clearable
            class="video-watermark-input"
          />
        </div>
      </el-form-item>
    </div>
    <p class="config-tip">
      文本/图片/视频使用的模型以
      <template v-if="isAdminUser">
        「<el-link type="primary" :underline="false" @click="$emit('open-ai-config')">AI 配置</el-link>」
      </template>
      <template v-else>管理员配置</template>
      中设为默认的为准。
    </p>
  </section>

  <section id="anchor-video" class="section card">
    <h2 class="section-title">合成视频</h2>
    <el-button
      type="primary"
      size="large"
      :loading="videoStatus === 'generating'"
      :disabled="!currentEpisodeId || storyboardsCount === 0 || videoStatus === 'generating'"
      @click="$emit('generate-video')"
    >
      合成视频
    </el-button>
    <div v-if="videoStatus === 'generating'" class="video-progress">
      <el-progress :percentage="videoProgress" :status="videoProgress >= 100 ? 'success' : undefined" />
      <p>视频生成中...</p>
    </div>
    <div v-if="videoStatus === 'done'" class="video-done">
      <el-alert type="success" title="视频生成完成" show-icon />
    </div>
    <div v-else-if="videoStatus === 'error'" class="video-error">
      <el-alert type="error" :title="videoErrorMsg" show-icon />
    </div>
    <div v-if="currentEpisodeVideoUrl" class="video-preview-wrap">
      <p class="video-preview-label">本集合成视频预览</p>
      <video
        :src="currentEpisodeVideoUrl"
        controls
        class="video-preview-player"
        preload="metadata"
      />
    </div>
  </section>
</template>

<script setup>
const subtitleModel = defineModel('subtitle', { type: Boolean, default: false })
const burnDialogueModel = defineModel('burnDialogue', { type: Boolean, default: false })
const watermarkModel = defineModel('watermark', { type: Boolean, default: false })
const watermarkTextModel = defineModel('watermarkText', { type: String, default: '' })

defineProps({
  isAdminUser: { type: Boolean, default: false },
  currentEpisodeId: { type: [Number, String, null], default: null },
  storyboardsCount: { type: Number, default: 0 },
  videoStatus: { type: String, default: '' },
  videoProgress: { type: Number, default: 0 },
  videoErrorMsg: { type: String, default: '' },
  currentEpisodeVideoUrl: { type: String, default: '' },
})

defineEmits(['open-ai-config', 'generate-video'])
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
  transition: border-color 0.3s ease, box-shadow 0.3s ease, transform 0.3s ease;
}
.card:hover {
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 6px 28px rgba(0, 0, 0, 0.25);
}
html.light .card {
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(16px) saturate(1.3);
  -webkit-backdrop-filter: blur(16px) saturate(1.3);
  border-color: rgba(139, 92, 246, 0.08);
  box-shadow: 0 1px 0 rgba(255,255,255,0.8) inset, 0 4px 20px rgba(99, 102, 241, 0.05);
}
html.light .card:hover {
  border-color: rgba(139, 92, 246, 0.18);
  box-shadow: 0 1px 0 rgba(255,255,255,0.8) inset, 0 8px 36px rgba(99, 102, 241, 0.08);
}
.section-title {
  font-size: 1.05rem;
  margin: 0 0 4px;
  color: #f4f4f5;
  font-weight: 600;
  letter-spacing: -0.01em;
}
html.light .section-title { color: #1e1b4b; }
.video-config-section,
#anchor-video {
  order: 3;
}
.config-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px 18px;
}
.config-tip {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.video-option-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.video-option-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.4;
}
.video-watermark-input {
  max-width: 320px;
}
.video-progress {
  margin-top: 12px;
  max-width: 420px;
}
.video-done,
.video-error {
  margin-top: 12px;
}
.video-preview-wrap {
  margin-top: 14px;
}
.video-preview-label {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.video-preview-player {
  width: min(100%, 720px);
  max-height: 420px;
  border-radius: 8px;
  background: #000;
}
</style>

