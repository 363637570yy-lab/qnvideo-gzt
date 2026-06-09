<template>
  <div class="model-runtime-panel">
    <div class="runtime-toolbar">
      <div class="toolbar-left">
        <span class="toolbar-title">模型运行观测</span>
        <el-select v-model="filters.service_type" size="small" style="width: 126px" @change="reload">
          <el-option label="全部类型" value="all" />
          <el-option label="文本" value="text" />
          <el-option label="图像" value="image" />
          <el-option label="视频" value="video" />
          <el-option label="音频" value="tts" />
        </el-select>
        <el-select v-model="filters.status" size="small" style="width: 116px" @change="reload">
          <el-option label="全部状态" value="all" />
          <el-option label="成功" value="success" />
          <el-option label="失败" value="failed" />
        </el-select>
        <el-select v-model="filters.days" size="small" style="width: 104px" @change="reload">
          <el-option label="24 小时" :value="1" />
          <el-option label="7 天" :value="7" />
          <el-option label="30 天" :value="30" />
          <el-option label="90 天" :value="90" />
        </el-select>
      </div>
      <el-button type="primary" plain size="small" :loading="loading" @click="reload">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
    </div>

    <div class="summary-strip" v-loading="summaryLoading">
      <div class="summary-cell">
        <span class="summary-label">请求数</span>
        <strong>{{ formatNumber(summary.totals.requests) }}</strong>
      </div>
      <div class="summary-cell">
        <span class="summary-label">失败数</span>
        <strong :class="{ danger: summary.totals.failed > 0 }">{{ formatNumber(summary.totals.failed) }}</strong>
      </div>
      <div class="summary-cell">
        <span class="summary-label">平均耗时</span>
        <strong>{{ formatElapsed(summary.totals.avg_elapsed_ms) }}</strong>
      </div>
      <div class="summary-cell">
        <span class="summary-label">最长耗时</span>
        <strong>{{ formatElapsed(summary.totals.max_elapsed_ms) }}</strong>
      </div>
      <div class="summary-cell">
        <span class="summary-label">Token</span>
        <strong>{{ formatNumber(summary.totals.total_tokens) }}</strong>
      </div>
      <div class="summary-cell">
        <span class="summary-label">图片数</span>
        <strong>{{ formatNumber(summary.totals.image_count) }}</strong>
      </div>
    </div>

    <div class="runtime-grid">
      <section class="runtime-section">
        <div class="section-head">
          <h3>按类型汇总</h3>
        </div>
        <el-table :data="summary.by_service" size="small" empty-text="暂无调用记录">
          <el-table-column prop="service_type" label="类型" width="96">
            <template #default="{ row }">{{ serviceLabel(row.service_type) }}</template>
          </el-table-column>
          <el-table-column prop="requests" label="请求" width="72" />
          <el-table-column prop="failed" label="失败" width="72">
            <template #default="{ row }">
              <span :class="{ danger: row.failed > 0 }">{{ row.failed }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="avg_elapsed_ms" label="平均耗时" width="100">
            <template #default="{ row }">{{ formatElapsed(row.avg_elapsed_ms) }}</template>
          </el-table-column>
          <el-table-column label="消耗" min-width="150">
            <template #default="{ row }">{{ formatUsage(row) }}</template>
          </el-table-column>
        </el-table>
      </section>

      <section class="runtime-section">
        <div class="section-head">
          <h3>配置/模型 Top</h3>
        </div>
        <el-table :data="summary.by_config" size="small" empty-text="暂无调用记录">
          <el-table-column prop="config_name" label="配置" min-width="126" show-overflow-tooltip>
            <template #default="{ row }">{{ row.config_name || `#${row.config_id || '-'}` }}</template>
          </el-table-column>
          <el-table-column prop="model" label="模型" min-width="128" show-overflow-tooltip />
          <el-table-column prop="requests" label="请求" width="72" />
          <el-table-column prop="failed" label="失败" width="72">
            <template #default="{ row }">
              <span :class="{ danger: row.failed > 0 }">{{ row.failed }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="avg_elapsed_ms" label="平均耗时" width="100">
            <template #default="{ row }">{{ formatElapsed(row.avg_elapsed_ms) }}</template>
          </el-table-column>
        </el-table>
      </section>
    </div>

    <section class="runtime-section logs-section">
      <div class="section-head">
        <h3>最近调用</h3>
        <span class="muted">只展示脱敏摘要，不保存完整提示词和密钥</span>
      </div>
      <el-table
        v-loading="logLoading"
        :data="logs.items"
        size="small"
        empty-text="暂无调用记录"
      >
        <el-table-column prop="created_at" label="时间" width="154">
          <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column prop="service_type" label="类型" width="82">
          <template #default="{ row }">{{ serviceLabel(row.service_type) }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="82">
          <template #default="{ row }">
            <el-tag :type="row.status === 'success' ? 'success' : 'danger'" size="small">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="config_name" label="配置" min-width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.config_name || `#${row.config_id || '-'}` }}</template>
        </el-table-column>
        <el-table-column prop="model" label="模型" min-width="136" show-overflow-tooltip />
        <el-table-column prop="scene_key" label="场景" min-width="126" show-overflow-tooltip />
        <el-table-column prop="elapsed_ms" label="耗时" width="88">
          <template #default="{ row }">{{ formatElapsed(row.elapsed_ms) }}</template>
        </el-table-column>
        <el-table-column label="消耗" min-width="142">
          <template #default="{ row }">{{ formatUsage(row) }}</template>
        </el-table-column>
        <el-table-column prop="error_message" label="错误摘要" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.error_message || '-' }}</template>
        </el-table-column>
      </el-table>
      <div class="pagination-row">
        <el-pagination
          background
          layout="prev, pager, next"
          :current-page="currentPage"
          :page-size="pageSize"
          :total="logs.total"
          @current-change="onPageChange"
        />
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { aiAPI } from '@/api/ai'

const pageSize = 50
const filters = reactive({
  service_type: 'all',
  status: 'all',
  days: 7,
})
const currentPage = ref(1)
const summaryLoading = ref(false)
const logLoading = ref(false)
const summary = ref({
  totals: {},
  by_service: [],
  by_config: [],
  slow_calls: [],
})
const logs = ref({
  items: [],
  total: 0,
})
const loading = computed(() => summaryLoading.value || logLoading.value)

function requestParams() {
  return {
    days: filters.days,
    service_type: filters.service_type,
    status: filters.status,
  }
}

async function loadSummary() {
  summaryLoading.value = true
  try {
    const data = await aiAPI.modelUsageSummary(requestParams())
    summary.value = {
      totals: data?.totals || {},
      by_service: data?.by_service || [],
      by_config: data?.by_config || [],
      slow_calls: data?.slow_calls || [],
    }
  } catch (e) {
    ElMessage.error('读取模型运行摘要失败：' + (e?.message || ''))
  } finally {
    summaryLoading.value = false
  }
}

async function loadLogs() {
  logLoading.value = true
  try {
    const data = await aiAPI.modelCallLogs({
      ...requestParams(),
      limit: pageSize,
      offset: (currentPage.value - 1) * pageSize,
    })
    logs.value = {
      items: data?.items || [],
      total: Number(data?.total || 0),
    }
  } catch (e) {
    ElMessage.error('读取模型调用日志失败：' + (e?.message || ''))
  } finally {
    logLoading.value = false
  }
}

async function reload() {
  currentPage.value = 1
  await Promise.all([loadSummary(), loadLogs()])
}

async function onPageChange(page) {
  currentPage.value = page
  await loadLogs()
}

function formatNumber(value) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n.toLocaleString('zh-CN', { maximumFractionDigits: 1 }) : '0'
}

function formatElapsed(value) {
  const ms = Number(value || 0)
  if (!Number.isFinite(ms) || ms <= 0) return '-'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`
}

function formatTime(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value).replace('T', ' ').slice(0, 19)
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function serviceLabel(value) {
  const map = {
    text: '文本',
    image: '图像',
    video: '视频',
    tts: '音频',
  }
  return map[value] || value || '-'
}

function statusLabel(value) {
  const map = {
    success: '成功',
    failed: '失败',
    unknown: '未知',
  }
  return map[value] || value || '-'
}

function formatUsage(row = {}) {
  const parts = []
  if (Number(row.total_tokens) > 0) parts.push(`${formatNumber(row.total_tokens)} token`)
  if (Number(row.image_count) > 0) parts.push(`${formatNumber(row.image_count)} 图`)
  if (Number(row.audio_seconds) > 0) parts.push(`${formatNumber(row.audio_seconds)} 音频秒`)
  if (Number(row.video_seconds) > 0) parts.push(`${formatNumber(row.video_seconds)} 视频秒`)
  return parts.join(' / ') || '-'
}

onMounted(reload)
</script>

<style scoped>
.model-runtime-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.runtime-toolbar,
.section-head,
.pagination-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.toolbar-title {
  font-size: 16px;
  font-weight: 700;
  color: #111827;
}

.summary-strip {
  display: grid;
  grid-template-columns: repeat(6, minmax(110px, 1fr));
  border: 1px solid #ebeef5;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}

.summary-cell {
  min-height: 72px;
  padding: 12px 14px;
  border-right: 1px solid #ebeef5;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
}

.summary-cell:last-child {
  border-right: 0;
}

.summary-label,
.muted {
  color: #6b7280;
  font-size: 13px;
}

.summary-cell strong {
  color: #111827;
  font-size: 20px;
  line-height: 1.1;
}

.danger {
  color: #dc2626;
  font-weight: 700;
}

.runtime-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 14px;
}

.runtime-section {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fff;
  padding: 14px;
}

.section-head {
  margin-bottom: 10px;
}

.section-head h3 {
  margin: 0;
  font-size: 15px;
  line-height: 1.4;
  color: #111827;
}

.logs-section {
  padding-bottom: 10px;
}

.pagination-row {
  justify-content: flex-end;
  margin-top: 12px;
}

@media (max-width: 1180px) {
  .summary-strip {
    grid-template-columns: repeat(3, minmax(110px, 1fr));
  }

  .summary-cell:nth-child(3n) {
    border-right: 0;
  }

  .runtime-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .summary-strip {
    grid-template-columns: repeat(2, minmax(110px, 1fr));
  }

  .summary-cell:nth-child(3n) {
    border-right: 1px solid #ebeef5;
  }

  .summary-cell:nth-child(2n) {
    border-right: 0;
  }
}
</style>
