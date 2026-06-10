<template>
  <el-table
    v-loading="loading"
    :data="configs"
    stripe
    style="width: 100%"
    @selection-change="$emit('selection-change', $event)"
  >
    <el-table-column v-if="!vendorLock.enabled" type="selection" width="46" />
    <el-table-column v-if="!vendorLock.enabled" label="优先级" width="152">
      <template #default="{ row }">
        <div class="order-actions">
          <el-button link size="small" :disabled="!canMoveConfig(row, 'top')" @click="$emit('move-config', row, 'top')">置顶</el-button>
          <el-button link size="small" :disabled="!canMoveConfig(row, 'up')" @click="$emit('move-config', row, 'up')">上移</el-button>
          <el-button link size="small" :disabled="!canMoveConfig(row, 'down')" @click="$emit('move-config', row, 'down')">下移</el-button>
        </div>
      </template>
    </el-table-column>
    <el-table-column prop="name" label="名称" min-width="130" />
    <el-table-column prop="provider" label="提供商" width="96" />
    <el-table-column prop="api_protocol" label="接口规范" min-width="128" show-overflow-tooltip>
      <template #default="{ row }">{{ protocolLabel(row.api_protocol) }}</template>
    </el-table-column>
    <el-table-column prop="base_url" label="Base URL" min-width="170" show-overflow-tooltip />
    <el-table-column prop="default_model" label="默认模型" min-width="130" show-overflow-tooltip>
      <template #default="{ row }">
        {{ row.default_model || (Array.isArray(row.model) && row.model[0]) || '—' }}
      </template>
    </el-table-column>
    <el-table-column label="能力" min-width="178">
      <template #default="{ row }">
        <AiCapabilityTags :capabilities="row.capabilities || []" :limit="4" />
      </template>
    </el-table-column>
    <el-table-column label="今日用量" min-width="154">
      <template #default="{ row }">
        <div v-if="quotaUnitsForRow(row).length" class="quota-lines">
          <span v-for="unit in quotaUnitsForRow(row)" :key="unit.unit" class="quota-line">
            {{ unit.short }} {{ formatQuotaNumber(quotaUsedValue(row, unit.unit)) }}
          </span>
        </div>
        <span v-else class="no-default">—</span>
      </template>
    </el-table-column>
    <el-table-column label="每日限额" min-width="168">
      <template #default="{ row }">
        <div v-if="quotaUnitsForRow(row).length" class="quota-limit-cell">
          <span class="quota-limit-summary">{{ quotaLimitSummary(row) }}</span>
          <el-button link type="primary" size="small" @click="$emit('open-quota', row)">设置</el-button>
        </div>
        <span v-else class="no-default">—</span>
      </template>
    </el-table-column>
    <el-table-column prop="service_type" label="类型" width="148">
      <template #default="{ row }">
        <span :class="['type-badge', 'type-' + row.service_type]">
          <el-icon class="type-icon">
            <ChatDotRound v-if="row.service_type === 'text'" />
            <Picture v-else-if="row.service_type === 'image'" />
            <VideoCamera v-else-if="row.service_type === 'video'" />
            <Microphone v-else-if="row.service_type === 'tts'" />
            <Key v-else-if="row.service_type === 'jimeng2_character_auth'" />
          </el-icon>
          {{ serviceTypeLabel(row.service_type) }}
        </span>
      </template>
    </el-table-column>
    <el-table-column prop="health_status" label="状态" width="92">
      <template #default="{ row }">
        <el-tooltip
          :disabled="!row.last_error && !row.disabled_until"
          placement="top"
          :content="healthStatusTooltip(row)"
        >
          <el-tag :type="healthStatusTagType(row)" size="small">
            {{ healthStatusLabel(row) }}
          </el-tag>
        </el-tooltip>
      </template>
    </el-table-column>
    <el-table-column prop="is_active" label="启用" width="78">
      <template #default="{ row }">
        <el-switch
          v-if="!vendorLock.enabled"
          :model-value="!!row.is_active"
          size="small"
          @change="$emit('toggle-active', row, $event)"
        />
        <el-tag v-else-if="row.is_active" type="success" size="small">启用</el-tag>
        <el-tag v-else type="info" size="small">停用</el-tag>
      </template>
    </el-table-column>
    <el-table-column label="操作" width="180" fixed="right">
      <template #default="{ row }">
        <el-button link type="primary" size="small" @click="$emit('test', row)">测试</el-button>
        <el-button link type="primary" size="small" @click="$emit('edit', row)">{{ vendorLock.enabled ? '修改Key' : '编辑' }}</el-button>
        <el-button v-if="!vendorLock.enabled" link type="danger" size="small" @click="$emit('delete', row)">删除</el-button>
      </template>
    </el-table-column>
  </el-table>
</template>

<script setup>
import { ChatDotRound, Key, Microphone, Picture, VideoCamera } from '@element-plus/icons-vue'
import AiCapabilityTags from './AiCapabilityTags.vue'

defineProps({
  loading: { type: Boolean, default: false },
  configs: { type: Array, default: () => [] },
  vendorLock: { type: Object, default: () => ({ enabled: false }) },
  canMoveConfig: { type: Function, required: true },
  protocolLabel: { type: Function, required: true },
  quotaUnitsForRow: { type: Function, required: true },
  formatQuotaNumber: { type: Function, required: true },
  quotaUsedValue: { type: Function, required: true },
  quotaLimitSummary: { type: Function, required: true },
  serviceTypeLabel: { type: Function, required: true },
  healthStatusTooltip: { type: Function, required: true },
  healthStatusTagType: { type: Function, required: true },
  healthStatusLabel: { type: Function, required: true },
})

defineEmits([
  'selection-change',
  'move-config',
  'open-quota',
  'toggle-active',
  'test',
  'edit',
  'delete',
])
</script>
