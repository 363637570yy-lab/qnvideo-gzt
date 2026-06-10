<template>
  <section class="section card pipeline-section">
    <div class="project-settings-block">
      <div class="settings-block-title">项目整体设置</div>
      <div class="project-settings-list">
        <label class="project-setting-field">
          <span>项目画幅</span>
          <el-select v-model="ctx.projectAspectRatio" @change="() => ctx.scheduleProjectSettingsSave(false)">
            <el-option label="16:9 横屏" value="16:9" />
            <el-option label="9:16 竖屏" value="9:16" />
            <el-option label="3:4 竖版" value="3:4" />
            <el-option label="1:1 方形" value="1:1" />
            <el-option label="4:3" value="4:3" />
            <el-option label="21:9 宽银幕" value="21:9" />
          </el-select>
        </label>
        <label class="project-setting-field">
          <span>图像规格</span>
          <el-button class="media-spec-button" @click="ctx.openImageSpecDialog">
            {{ ctx.imageSpecSummary }}
          </el-button>
        </label>
        <label class="project-setting-field">
          <span>视频清晰度</span>
          <el-select v-model="ctx.projectVideoResolution" @change="ctx.onProjectVideoResolutionChange">
            <el-option
              v-for="tier in ctx.videoTierOptions"
              :key="tier.value"
              :label="tier.label"
              :value="tier.value"
            />
          </el-select>
        </label>
        <label class="project-setting-field">
          <span>默认每段时长</span>
          <el-select v-model="ctx.videoClipDuration" @change="() => ctx.scheduleProjectSettingsSave(false)">
            <el-option label="4秒/段" :value="4" />
            <el-option label="5秒/段" :value="5" />
            <el-option label="8秒/段" :value="8" />
            <el-option label="10秒/段" :value="10" />
            <el-option label="12秒/段" :value="12" />
            <el-option label="15秒/段" :value="15" />
          </el-select>
        </label>
        <label class="project-setting-field">
          <span>默认语言</span>
          <el-select v-model="ctx.scriptLanguage" placeholder="默认语言" @change="() => ctx.scheduleProjectSettingsSave(false)">
            <el-option label="中文" value="zh" />
            <el-option label="英文" value="en" />
          </el-select>
        </label>
        <label class="project-setting-field project-setting-field--style">
          <span>主画风</span>
          <StylePickerButton
            v-model="ctx.generationStyle"
            :options="ctx.generationStyleOptions"
            @change="() => ctx.scheduleProjectSettingsSave(true)"
          />
        </label>
      </div>
    </div>
    <div class="one-click-actions">
      <span class="one-click-label">🚀 一键动作</span>
      <el-button
        type="primary"
        :loading="ctx.pipelineRunning && !ctx.pipelinePaused"
        :disabled="!ctx.currentEpisodeId || ctx.pipelineRunning"
        title="仅提取角色、场景、道具与生成分镜文本，不生成图片与视频"
        @click="ctx.startTextFrameworkPipeline"
      >
        一键生成素材及分镜文本
      </el-button>
      <el-button
        :loading="ctx.pipelineRunning && !ctx.pipelinePaused"
        :disabled="!ctx.currentEpisodeId || ctx.pipelineRunning"
        @click="ctx.startOneClickPipeline"
      >
        一键成片（测试中慎用！）
      </el-button>
      <template v-if="ctx.pipelineRunning">
        <el-button v-if="!ctx.pipelinePaused" type="warning" @click="ctx.pipelinePaused = true">⏸ 暂停</el-button>
        <el-button v-else type="success" @click="ctx.onPipelineResume">▶ 继续</el-button>
      </template>
    </div>
    <div class="pipeline-model-strategy" v-loading="ctx.aiRouteLoading">
      <span class="pipeline-model-strategy-title">本次生成模型</span>
      <label
        v-for="item in ctx.pipelineModelStrategyTypes"
        :key="item.key"
        class="pipeline-model-field"
      >
        <span>{{ item.label }}</span>
        <el-select
          v-model="ctx.selectedAiConfigIds[item.key]"
          clearable
          filterable
          placeholder="自动"
          @visible-change="onModelSelectVisible"
          @change="onModelSelectionChange"
        >
          <el-option label="自动（按全局策略）" value="" />
          <el-option
            v-for="cfg in modelOptions(item.key)"
            :key="cfg.id"
            :label="ctx.configOptionLabel(cfg)"
            :value="String(cfg.id)"
          />
        </el-select>
      </label>
      <el-button size="small" text @click="ctx.loadRuntimeAiConfigs(true)">刷新</el-button>
    </div>
    <div v-if="ctx.pipelineRunning || ctx.pipelineErrorLog.length > 0" class="pipeline-status">
      <div v-if="ctx.pipelineCurrentStep" class="pipeline-current-step">
        <span v-if="ctx.pipelineStepIndex > 0" class="pipeline-step-badge">{{ ctx.pipelineStepIndex }}/{{ ctx.pipelineStepTotal }}</span>
        {{ ctx.pipelineCurrentStep.replace(/^\[步骤 \d+\/\d+\] /, '') }}
      </div>
      <div v-if="ctx.pipelineCountdown > 0" class="pipeline-countdown">
        <div class="pipeline-countdown-ring">
          <span class="pipeline-countdown-num">{{ ctx.pipelineCountdown }}</span>
          <span class="pipeline-countdown-unit">秒</span>
        </div>
        <div class="pipeline-countdown-body">
          <p class="pipeline-countdown-msg">{{ ctx.pipelineCountdownMsg }}</p>
          <div class="pipeline-countdown-actions">
            <el-button size="small" type="success" @click="ctx.skipPipelineCountdown">⚡ 立即开始下一阶段</el-button>
            <el-button v-if="!ctx.pipelinePaused" size="small" type="warning" @click="ctx.pipelinePaused = true">⏸ 暂停倒计时</el-button>
            <span v-else class="pipeline-countdown-paused">已暂停 — 点击右上角"继续"恢复</span>
          </div>
        </div>
      </div>
      <div v-if="ctx.pipelineActiveTasks.size > 0" class="pipeline-active-tasks">
        <span
          v-for="label in Array.from(ctx.pipelineActiveTasks)"
          :key="label"
          class="pipeline-task-chip"
        >
          <span class="pipeline-task-dot" />{{ label }}
        </span>
      </div>
      <div v-if="ctx.pipelineErrorLog.length > 0" class="pipeline-error-log">
        <div class="pipeline-error-title">执行过程中的错误：</div>
        <div v-for="(entry, idx) in ctx.pipelineErrorLog" :key="idx" class="pipeline-error-line">
          [{{ entry.step }}] {{ entry.message }}
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import StylePickerButton from '@/components/StylePickerButton.vue'

const props = defineProps({
  ctx: { type: Object, required: true }
})

const ctx = computed(() => props.ctx)

function modelOptions(type) {
  return props.ctx.runtimeAiConfigs?.[type] || []
}

function onModelSelectVisible(visible) {
  props.ctx.onAiRouteSelectVisible?.(visible)
}

function onModelSelectionChange() {
  props.ctx.scheduleProjectSettingsSave?.(false)
}
</script>
