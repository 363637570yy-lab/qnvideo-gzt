<template>
  <div class="routing-policy-card">
    <div class="routing-policy-title">{{ label }}全局策略</div>
    <span class="routing-policy-label">路由</span>
    <el-select v-model="localPolicy.strategy" size="small" style="width: 132px" @change="save">
      <el-option label="顺序优先" value="sequential" />
      <el-option label="轮询" value="round_robin" />
    </el-select>
    <span class="routing-policy-label">同时生成上限</span>
    <el-input-number
      v-model="localPolicy.concurrency_limit"
      size="small"
      :min="1"
      :max="concurrencyLimitMax"
      controls-position="right"
      @change="save"
    />
    <span class="routing-policy-label">提交请求超时</span>
    <el-input-number
      v-model="requestTimeoutSeconds"
      size="small"
      :min="1"
      :max="1800"
      :step="10"
      controls-position="right"
      @change="save"
    />
    <span class="routing-policy-label">秒</span>
    <template v-if="policyKey === 'video'">
      <span class="routing-policy-label">视频生成最长等待</span>
      <el-input-number
        v-model="videoPollTimeoutSeconds"
        size="small"
        :min="1"
        :max="86400"
        :step="60"
        controls-position="right"
        @change="save"
      />
      <span class="routing-policy-label">秒</span>
    </template>
    <span class="routing-policy-label">失败重试</span>
    <el-input-number
      v-model="localPolicy.retry_count"
      size="small"
      :min="0"
      :max="5"
      controls-position="right"
      @change="save"
    />
    <span class="routing-policy-label">次</span>
    <span class="routing-policy-label">异常暂停</span>
    <el-input-number
      v-model="localPolicy.cooldown_seconds"
      size="small"
      :min="0"
      :max="86400"
      :step="30"
      controls-position="right"
      @change="save"
    />
    <span class="routing-policy-label">秒</span>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  label: { type: String, default: '' },
  policyKey: { type: String, required: true },
  policy: { type: Object, default: null },
})
const emit = defineEmits(['save'])

const localPolicy = ref({})
const concurrencyLimitMax = computed(() => props.policyKey === 'image' ? 8 : 500)
const requestTimeoutSeconds = computed({
  get() {
    return normalizeTimeoutSeconds(localPolicy.value)
  },
  set(value) {
    setPolicyRequestTimeoutSeconds(localPolicy.value, value)
  },
})
const videoPollTimeoutSeconds = computed({
  get() {
    return normalizeVideoPollTimeoutSeconds(localPolicy.value)
  },
  set(value) {
    setPolicyVideoPollTimeoutSeconds(localPolicy.value, value)
  },
})

watch(
  () => props.policy,
  (policy) => {
    localPolicy.value = normalizePolicyForUi(policy || {}, props.policyKey)
  },
  { immediate: true, deep: true }
)

function toPositiveInt(value, fallback = 0) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.trunc(n)
}

function clampNumber(value, fallback, min, max) {
  const n = toPositiveInt(value, fallback)
  return Math.min(max, Math.max(min, n))
}

function normalizeTimeoutSeconds(policy) {
  if (!policy) return 0
  return clampNumber(policy.request_timeout_seconds, 120, 1, 1800)
}

function normalizeVideoPollTimeoutSeconds(policy) {
  if (!policy) return 0
  return clampNumber(policy.video_poll_timeout_seconds, 3600, 1, 86400)
}

function setPolicyRequestTimeoutSeconds(policy, value) {
  if (!policy) return
  policy.request_timeout_seconds = clampNumber(value, normalizeTimeoutSeconds(policy), 1, 1800)
}

function setPolicyVideoPollTimeoutSeconds(policy, value) {
  if (!policy) return
  policy.video_poll_timeout_seconds = clampNumber(value, normalizeVideoPollTimeoutSeconds(policy), 1, 86400)
}

function normalizeConcurrencyLimit(policy, key) {
  const fallback = key === 'image' ? 4 : 1
  const max = key === 'image' ? 8 : 500
  return clampNumber(policy?.concurrency_limit, fallback, 1, max)
}

function normalizePolicyForUi(policy, key) {
  const next = { ...(policy || {}) }
  next.strategy = next.strategy === 'round_robin' ? 'round_robin' : 'sequential'
  next.concurrency_limit = normalizeConcurrencyLimit(next, key)
  next.retry_count = clampNumber(next.retry_count, 0, 0, 5)
  next.cooldown_seconds = clampNumber(next.cooldown_seconds, 0, 0, 86400)
  setPolicyRequestTimeoutSeconds(next, normalizeTimeoutSeconds(next))
  if (key === 'video') {
    setPolicyVideoPollTimeoutSeconds(next, normalizeVideoPollTimeoutSeconds(next))
  }
  return next
}

function save() {
  const payload = normalizePolicyForUi(localPolicy.value, props.policyKey)
  localPolicy.value = payload
  emit('save', { key: props.policyKey, policy: payload })
}
</script>

<style scoped>
.routing-policy-card {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 12px 14px;
  margin-bottom: 12px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fbfbff;
}

.routing-policy-title {
  font-weight: 700;
  color: #303133;
  margin-right: 4px;
}

.routing-policy-label {
  color: #606266;
}

.routing-policy-card :deep(.el-input-number) {
  width: 120px;
}
</style>
