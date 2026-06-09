<template>
  <el-dialog
    v-model="dialogVisible"
    title="用量中心"
    width="980px"
    destroy-on-close
    class="usage-center-dialog"
  >
    <div class="usage-toolbar">
      <el-segmented v-model="days" :options="dayOptions" @change="loadUsage" />
      <el-button :loading="loading" @click="loadUsage">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
    </div>

    <div v-loading="loading" class="usage-content">
      <div class="usage-summary-grid">
        <div v-for="item in serviceRows" :key="item.service_type" class="usage-summary-item">
          <span class="usage-summary-label">{{ serviceLabel(item.service_type) }}</span>
          <strong>{{ formatNumber(item.requests) }}</strong>
          <span class="usage-summary-sub">{{ serviceUnitText(item) }}</span>
        </div>
      </div>

      <div class="usage-section">
        <h3>模型/API 用量</h3>
        <el-table :data="modelRows" size="small" height="280" empty-text="暂无用量记录">
          <el-table-column prop="config_id" label="配置" width="86">
            <template #default="{ row }">#{{ row.config_id || '—' }}</template>
          </el-table-column>
          <el-table-column prop="provider" label="提供商" width="100" show-overflow-tooltip />
          <el-table-column prop="model" label="模型" min-width="170" show-overflow-tooltip>
            <template #default="{ row }">{{ row.model || '—' }}</template>
          </el-table-column>
          <el-table-column prop="requests" label="请求" width="82" align="right">
            <template #default="{ row }">{{ formatNumber(row.requests) }}</template>
          </el-table-column>
          <el-table-column prop="total_tokens" label="Token" width="110" align="right">
            <template #default="{ row }">{{ formatNumber(row.total_tokens) }}</template>
          </el-table-column>
          <el-table-column prop="image_count" label="图片" width="90" align="right">
            <template #default="{ row }">{{ formatNumber(row.image_count) }}</template>
          </el-table-column>
          <el-table-column prop="video_seconds" label="视频秒" width="100" align="right">
            <template #default="{ row }">{{ formatNumber(row.video_seconds) }}</template>
          </el-table-column>
          <el-table-column prop="audio_seconds" label="音频秒" width="100" align="right">
            <template #default="{ row }">{{ formatNumber(row.audio_seconds) }}</template>
          </el-table-column>
        </el-table>
      </div>

      <div class="usage-section">
        <h3>功能场景用量</h3>
        <el-table :data="sceneRows" size="small" height="220" empty-text="暂无场景记录">
          <el-table-column prop="service_type" label="类型" width="90">
            <template #default="{ row }">{{ serviceLabel(row.service_type) }}</template>
          </el-table-column>
          <el-table-column prop="scene_key" label="场景" min-width="190" show-overflow-tooltip>
            <template #default="{ row }">{{ row.scene_key || '未标记' }}</template>
          </el-table-column>
          <el-table-column prop="requests" label="请求" width="90" align="right">
            <template #default="{ row }">{{ formatNumber(row.requests) }}</template>
          </el-table-column>
          <el-table-column prop="total_tokens" label="Token" width="110" align="right">
            <template #default="{ row }">{{ formatNumber(row.total_tokens) }}</template>
          </el-table-column>
          <el-table-column prop="image_count" label="图片" width="90" align="right">
            <template #default="{ row }">{{ formatNumber(row.image_count) }}</template>
          </el-table-column>
          <el-table-column prop="video_seconds" label="视频秒" width="100" align="right">
            <template #default="{ row }">{{ formatNumber(row.video_seconds) }}</template>
          </el-table-column>
          <el-table-column prop="audio_seconds" label="音频秒" width="100" align="right">
            <template #default="{ row }">{{ formatNumber(row.audio_seconds) }}</template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { aiAPI } from '@/api/ai'

const props = defineProps({
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['update:visible'])

const dialogVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value),
})

const dayOptions = [
  { label: '今天', value: 1 },
  { label: '7天', value: 7 },
  { label: '30天', value: 30 },
]
const days = ref(1)
const loading = ref(false)
const usage = ref({ totals: {}, by_day: [], by_config: [], by_scene: [] })

const serviceRows = computed(() => {
  const map = new Map([
    ['text', emptyServiceRow('text')],
    ['image', emptyServiceRow('image')],
    ['video', emptyServiceRow('video')],
    ['tts', emptyServiceRow('tts')],
  ])
  for (const row of usage.value?.by_day || []) {
    const key = normalizeServiceType(row.service_type)
    const current = map.get(key) || emptyServiceRow(key)
    addUsage(current, row)
    map.set(key, current)
  }
  return [...map.values()]
})

const modelRows = computed(() => (usage.value?.by_config || []).slice(0, 30))
const sceneRows = computed(() => (usage.value?.by_scene || []).slice(0, 30))

function normalizeServiceType(value) {
  const raw = String(value || '').trim()
  return raw === 'audio' ? 'tts' : raw
}

function emptyServiceRow(serviceType) {
  return {
    service_type: serviceType,
    requests: 0,
    total_tokens: 0,
    image_count: 0,
    video_seconds: 0,
    audio_seconds: 0,
  }
}

function addUsage(target, row) {
  for (const key of ['requests', 'total_tokens', 'image_count', 'video_seconds', 'audio_seconds']) {
    target[key] += Number(row?.[key] || 0)
  }
}

function serviceLabel(serviceType) {
  return {
    text: '文本',
    image: '图片',
    video: '视频',
    tts: '音频',
  }[normalizeServiceType(serviceType)] || serviceType || '其他'
}

function serviceUnitText(row) {
  const serviceType = normalizeServiceType(row.service_type)
  if (serviceType === 'text') return `${formatNumber(row.total_tokens)} Token`
  if (serviceType === 'image') return `${formatNumber(row.image_count)} 张`
  if (serviceType === 'video') return `${formatNumber(row.video_seconds)} 秒`
  if (serviceType === 'tts') return `${formatNumber(row.audio_seconds)} 秒`
  return '请求'
}

function formatNumber(value) {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return '0'
  return n.toLocaleString('zh-CN', { maximumFractionDigits: n < 10 ? 1 : 0 })
}

async function loadUsage() {
  loading.value = true
  try {
    usage.value = await aiAPI.publicModelUsageDaily({ days: days.value })
  } catch (e) {
    ElMessage.error('读取用量失败：' + (e?.message || ''))
  } finally {
    loading.value = false
  }
}

watch(
  () => props.visible,
  (open) => {
    if (open) loadUsage()
  }
)
</script>

<style scoped>
.usage-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.usage-content {
  min-height: 380px;
}

.usage-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

.usage-summary-item {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: #fff;
  min-width: 0;
}

.usage-summary-label {
  color: #606266;
  font-size: 13px;
}

.usage-summary-item strong {
  color: #1f2937;
  font-size: 22px;
  line-height: 1.2;
}

.usage-summary-sub {
  color: #909399;
  font-size: 12px;
}

.usage-section {
  margin-top: 14px;
}

.usage-section h3 {
  font-size: 15px;
  line-height: 1.4;
  margin: 0 0 8px;
  color: #303133;
}

@media (max-width: 720px) {
  .usage-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
