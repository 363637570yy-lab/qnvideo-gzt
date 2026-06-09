<template>
<el-dialog v-model="imageSpecDialogVisible" title="设置图像尺寸" width="520px" class="media-spec-dialog">
  <div class="media-spec-current">当前：{{ imageSpecPreview.width }}x{{ imageSpecPreview.height }}</div>
  <el-radio-group v-model="imageSpecDraft.mode" class="media-spec-mode">
    <el-radio-button label="auto">自动</el-radio-button>
    <el-radio-button label="ratio">按比例</el-radio-button>
    <el-radio-button label="custom">自定义宽高</el-radio-button>
  </el-radio-group>
  <template v-if="imageSpecDraft.mode !== 'custom'">
    <div class="media-spec-section-title">基准分辨率</div>
    <div class="media-spec-tier-grid">
      <button
        v-for="tier in imageTierOptions"
        :key="tier.value"
        type="button"
        class="media-spec-choice"
        :class="{ active: imageSpecDraft.tier === tier.value }"
        @click="imageSpecDraft.tier = tier.value"
      >
        {{ tier.label }}
      </button>
    </div>
    <div class="media-spec-section-title">图像比例</div>
    <div class="media-spec-ratio-grid">
      <button
        v-for="ratio in imageRatioOptions"
        :key="ratio.value"
        type="button"
        class="media-spec-ratio-choice"
        :class="{ active: imageSpecDraft.ratio === ratio.value }"
        @click="imageSpecDraft.ratio = ratio.value"
      >
        <span class="media-spec-ratio-icon" :style="{ aspectRatio: ratio.aspect }" />
        <span>{{ ratio.label }}</span>
      </button>
    </div>
  </template>
  <div v-else class="media-spec-custom-grid">
    <label>
      <span>宽度</span>
      <el-input-number v-model="imageSpecDraft.width" :min="256" :max="8192" :step="64" />
    </label>
    <label>
      <span>高度</span>
      <el-input-number v-model="imageSpecDraft.height" :min="256" :max="8192" :step="64" />
    </label>
  </div>
  <div class="media-spec-result">
    <span>将使用</span>
    <strong>{{ imageSpecPreview.width }}x{{ imageSpecPreview.height }}</strong>
  </div>
  <template #footer>
    <el-button @click="imageSpecDialogVisible = false">取消</el-button>
    <el-button type="primary" @click="confirmImageSpec">确定</el-button>
  </template>
</el-dialog>


<el-dialog v-if="isAdminUser" v-model="showAiConfigDialog" title="AI 配置" width="90%" destroy-on-close class="ai-config-dialog">
  <AIConfigContent v-if="showAiConfigDialog && isAdminUser" />
</el-dialog>

<UsageCenterDialog v-model:visible="showUsageCenterDialog" />

<WorkflowPresetConfigDialog
  v-if="isAdminUser"
  v-model="showWorkflowConfigDialog"
  @changed="loadWorkflowPresets"
/>


<!-- 图片放大预览：点击遮罩关闭，左右可切换当前页面图集 -->
<Teleport to="body">
  <div
    v-if="previewImageUrl"
    class="image-preview-overlay"
    @click="closeImagePreview"
  >
    <button class="image-preview-close" type="button" title="关闭" @click.stop="closeImagePreview">×</button>
    <button
      v-if="previewGallery.length > 1"
      class="image-preview-nav image-preview-nav--prev"
      type="button"
      title="上一张"
      @click.stop="showPreviewImage(-1)"
    >
      <el-icon><ArrowLeft /></el-icon>
    </button>
    <img :src="previewImageUrl" alt="" class="image-preview-img" @click.stop />
    <button
      v-if="previewGallery.length > 1"
      class="image-preview-nav image-preview-nav--next"
      type="button"
      title="下一张"
      @click.stop="showPreviewImage(1)"
    >
      <el-icon><ArrowRight /></el-icon>
    </button>
    <div v-if="previewGallery.length > 1" class="image-preview-count" @click.stop>
      {{ previewImageIndex + 1 }} / {{ previewGallery.length }}
    </div>
  </div>
</Teleport>

</template>

<script>
import AIConfigContent from '@/components/AIConfigContent.vue'
import UsageCenterDialog from '@/components/UsageCenterDialog.vue'
import WorkflowPresetConfigDialog from '@/components/WorkflowPresetConfigDialog.vue'
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'

export default {
  name: 'FilmCreateCommonDialogs',
  components: { AIConfigContent, UsageCenterDialog, WorkflowPresetConfigDialog, ArrowLeft, ArrowRight },
  props: {
    ctx: { type: Object, required: true },
  },
  setup(props) {
    return props.ctx
  },
}
</script>
