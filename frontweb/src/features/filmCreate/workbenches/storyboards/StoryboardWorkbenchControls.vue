<template>
        <h2 class="section-title">
          <span>5. 分镜生成</span>
          <span class="step-desc">根据剧本、角色、场景自动生成分镜头脚本</span>
        </h2>
        <div class="sb-setting-groups">
          <div class="sb-setting-group">
            <div class="sb-setting-group-title">分镜脚本设置</div>
            <div class="sb-config-row">
              <label class="sb-config-item">
                <span class="sb-config-label">分镜规范</span>
                <el-select
                  v-model="selectedWorkflowPresetIds.storyboard"
                  size="small"
                  filterable
                  class="sb-config-input"
                  :loading="workflowPresetLoading"
                >
                  <el-option
                    v-for="preset in workflowPresetOptions.storyboard"
                    :key="preset.id"
                    :label="workflowPresetLabel(preset)"
                    :value="String(preset.id)"
                  />
                </el-select>
              </label>
              <label class="sb-config-item">
                <span class="sb-config-label">本次镜数</span>
                <el-input-number v-model="storyboardCount" :min="1" :max="200" :step="5" placeholder="自动" class="sb-config-input" />
                <span class="sb-config-hint sb-config-hint--estimate" :title="scriptEstimateStoryboardTitle">自动{{ scriptEstimateStoryboardHint }}</span>
              </label>
              <label class="sb-config-item">
                <span class="sb-config-label">本次总时长(秒)</span>
                <el-input-number v-model="videoDuration" :min="10" :max="600" :step="5" placeholder="自动" class="sb-config-input" />
                <span class="sb-config-hint sb-config-hint--estimate" :title="scriptEstimateVideoDurationTitle">自动{{ scriptEstimateVideoDurationHint }}</span>
              </label>
              <el-checkbox v-model="storyboardUniversalOmni" @change="() => scheduleProjectSettingsSave(false)">
                全能分镜模式
              </el-checkbox>
              <el-checkbox v-model="storyboardIncludeNarration" @change="() => scheduleProjectSettingsSave(false)">
                生成解说旁白
              </el-checkbox>
            </div>
          </div>
          <div class="sb-setting-group">
            <div class="sb-setting-group-title">分镜图/视频设置</div>
            <div class="sb-config-row">
              <label class="sb-config-item">
                <span class="sb-config-label">关键帧数量</span>
                <el-select v-model="storyboardFrameCount" size="small" style="width:110px" :disabled="storyboardUseFirstLastFrame" @change="() => scheduleProjectSettingsSave(false)">
                  <el-option
                    v-for="count in storyboardFrameCountOptions"
                    :key="count"
                    :label="`${count} 张`"
                    :value="count"
                  />
                </el-select>
                <span class="sb-config-hint">独立关键帧，页面宫格展示</span>
              </label>
              <el-checkbox v-model="storyboardUseFirstLastFrame" @change="onStoryboardUseFirstLastFrameChange">
                首尾帧参考图
              </el-checkbox>
            </div>
          </div>
          <div v-if="storyboards.length > 0" class="sb-export-actions">
            <el-button
              class="sb-export-srt-btn"
              size="small"
              plain
              type="primary"
              :disabled="!currentEpisodeId"
              :loading="exportingStoryboardSheet"
              @click="onExportStoryboardSheet"
            >
              导出分镜表 excel
            </el-button>
            <el-button
              class="sb-export-srt-btn"
              size="small"
              plain
              type="primary"
              :disabled="!currentEpisodeId"
              @click="onExportNarrationSrt"
            >
              导出解说 SRT
            </el-button>
          </div>
        </div>
        <div class="asset-actions sb-batch-actions">
          <div class="flex">
            <el-button
              :type="storyboardGenerating ? 'warning' : 'primary'"
              size="large"
              :loading="universalOmniPolishRunning"
              :disabled="!currentEpisodeId || universalOmniPolishRunning"
              @click="storyboardGenerating ? stopEpisodeTask(GEN_RESOURCE.GENERATE_STORYBOARD, '已停止分镜生成') : onGenerateStoryboard()"
            >
              <el-icon v-if="storyboardGenerating" class="is-loading"><Loading /></el-icon>
              {{ storyboardGenerating ? '停止' : (storyboards.length > 0 ? '重新生成分镜' : 'AI 生成分镜') }}
            </el-button>
            <ElButton type="info" plain size="large" @click="onAddSingleStoryboard">
            添加一个分镜
            </ElButton>
          </div>
          <template v-if="storyboards.length > 0">
            <div class="sb-batch-right">
              <el-button
                type="success"
                plain
                size="large"
                :loading="batchImageRunning"
                :disabled="!currentEpisodeId || batchImageRunning || batchVideoRunning || pipelineRunning || storyboardGenerating || universalOmniPolishRunning"
                @click="startBatchImageGeneration"
              >
                批量生成分镜图
              </el-button>
              <el-button
                type="warning"
                plain
                size="large"
                :loading="batchVideoRunning"
                :disabled="!currentEpisodeId || batchImageRunning || batchVideoRunning || pipelineRunning || storyboardGenerating || universalOmniPolishRunning"
                @click="startBatchVideoGeneration"
              >
                批量生成分镜视频
              </el-button>
              <el-button v-if="batchImageRunning" size="large" type="danger" plain @click="stopBatchImageGeneration">停止图片</el-button>
              <el-button v-if="batchVideoRunning" size="large" type="danger" plain @click="stopBatchVideoGeneration">停止视频</el-button>
            </div>
            <!-- 连贯帧模式 UI 暂时隐藏（保留变量与批量生成逻辑，后续可快速恢复） -->
            <div v-if="false" class="batch-video-options" style="margin-top:8px;display:flex;align-items:center;gap:8px;font-size:13px;">
              <el-checkbox v-model="videoFrameContiguity" size="small">
                连贯帧模式（自动衔接相邻视频帧）
              </el-checkbox>
              <el-tooltip placement="top" :show-after="100">
                <template #content>
                  <div style="max-width:320px;line-height:1.7">
                    <div style="font-weight:600;margin-bottom:4px">连贯帧模式说明</div>
                    <div>启用后批量视频顺序生成，每条视频的<b>末帧</b>自动截取并作为下一条视频的<b>首帧参考图</b>，减少镜头切换的跳跃感。</div>
                    <div style="margin-top:8px;font-weight:600">⚠️ 需要模型支持图生视频（i2v）</div>
                    <div style="margin-top:4px">
                      ✅ 支持：kling-video、kling-omni-video、wan2.2-kf2v-flash、wan2.6-i2v-flash<br/>
                      ❌ 不支持（末帧将被忽略）：wan2.6-t2v、wan2.6-r2v-flash、wanx2.1-vace-plus 等纯文生视频模型
                    </div>
                    <div style="margin-top:8px;color:#faad14">如当前视频模型不支持 i2v，启用此选项不会报错，但末帧衔接不会生效。</div>
                  </div>
                </template>
                <el-icon style="color:#9ca3af;cursor:help"><QuestionFilled /></el-icon>
              </el-tooltip>
            </div>
          </template>
        </div>
        <!-- 批量生成进度 -->
        <div v-if="batchImageRunning || batchVideoRunning || batchImageErrors.length || batchVideoErrors.length" class="batch-status">
          <div v-if="batchImageRunning" class="batch-progress">
            <el-icon class="is-loading"><Loading /></el-icon>
            <span>批量生成分镜图：{{ batchImageProgress.current }}/{{ batchImageProgress.total }}</span>
            <span v-if="batchImageProgress.failed > 0" class="batch-failed">{{ batchImageProgress.failed }} 条失败</span>
            <span v-if="batchImageStopping" class="batch-stopping">（正在停止...）</span>
          </div>
          <div v-if="batchVideoRunning" class="batch-progress">
            <el-icon class="is-loading"><Loading /></el-icon>
            <span>批量生成分镜视频：{{ batchVideoProgress.current }}/{{ batchVideoProgress.total }}</span>
            <span v-if="batchVideoProgress.failed > 0" class="batch-failed">{{ batchVideoProgress.failed }} 条失败</span>
            <span v-if="batchVideoStopping" class="batch-stopping">（正在停止...）</span>
          </div>
          <div v-if="batchImageErrors.length > 0" class="batch-error-log">
            <div class="batch-error-title">分镜图生成失败记录：</div>
            <div v-for="(e, i) in batchImageErrors" :key="i" class="batch-error-line">{{ e }}</div>
          </div>
          <div v-if="batchVideoErrors.length > 0" class="batch-error-log">
            <div class="batch-error-title">分镜视频生成失败记录：</div>
            <div v-for="(e, i) in batchVideoErrors" :key="i" class="batch-error-line">{{ e }}</div>
          </div>
        </div>
        <div v-if="storyboardGenerating || universalOmniPolishRunning" class="storyboard-generating-tip">
          <el-icon class="is-loading"><Loading /></el-icon>
          <span v-if="universalOmniPolishRunning">
            正在润色全能提示词：第 {{ universalOmniPolishProgress.current }} / {{ universalOmniPolishProgress.total }} 镜
            <template v-if="universalOmniPolishProgress.label">（{{ universalOmniPolishProgress.label }}）</template>
            …
          </span>
          <span v-else>正在分析剧本并拆解分镜，请稍候...</span>
        </div>
        <div v-if="sbTruncatedWarning && !sbTruncatedDismissed && storyboards.length > 0" class="sb-truncated-warning">
          <el-icon><WarningFilled /></el-icon>
          <span>检测到分镜可能不完整（AI 输出被截断），请确认分镜数量是否符合预期，必要时可重新生成。</span>
          <el-button size="small" text @click="sbTruncatedDismissed = true">关闭</el-button>
        </div>
</template>

<script>
import { Loading, QuestionFilled, WarningFilled } from '@element-plus/icons-vue'

export default {
  name: 'StoryboardWorkbenchControls',
  props: {
    ctx: { type: Object, required: true },
  },
  components: {
    Loading,
    QuestionFilled,
    WarningFilled,
  },
  setup(props) {
    return props.ctx
  },
}
</script>
