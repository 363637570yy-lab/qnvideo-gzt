<template>
  <el-dialog
    :model-value="visible"
    title="每日限额设置"
    width="560px"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:visible', $event)"
  >
    <template v-if="targetRow">
      <el-alert
        type="info"
        :closable="false"
        class="quota-dialog-tip"
        title="默认 0 表示不限制。这里的限额只作用于当前 API 配置；选择具体模型后，可细分到该配置内的单个模型。"
      />
      <el-form label-width="120px" class="quota-form">
        <el-form-item label="配置">
          <span>{{ targetRow.name || ('配置 #' + targetRow.id) }}</span>
        </el-form-item>
        <el-form-item label="限额对象">
          <el-select v-model="quotaForm.model" style="width: 100%" @change="$emit('hydrate')">
            <el-option label="整条配置（所有模型）" value="" />
            <el-option
              v-for="model in targetModels"
              :key="model"
              :label="model"
              :value="model"
            />
          </el-select>
        </el-form-item>
        <el-form-item
          v-for="unit in quotaUnitsForRow(targetRow)"
          :key="unit.unit"
          :label="'每日' + unit.label"
        >
          <div class="quota-input-row">
            <el-input-number
              v-model="quotaForm.limits[unit.unit]"
              :min="0"
              :step="unit.step || 1"
              controls-position="right"
            />
            <span class="quota-used-hint">
              今日已用 {{ formatQuotaNumber(quotaUsedValue(targetRow, unit.unit, quotaForm.model)) }} {{ unit.suffix }}
            </span>
          </div>
        </el-form-item>
        <el-form-item label="超额动作">
          <el-select v-model="quotaForm.action_on_exceed" style="width: 260px">
            <el-option
              v-for="action in actionOptions"
              :key="action.value"
              :label="action.label"
              :value="action.value"
            />
          </el-select>
        </el-form-item>
      </el-form>
    </template>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="$emit('save')">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
defineProps({
  visible: { type: Boolean, default: false },
  targetRow: { type: Object, default: null },
  targetModels: { type: Array, default: () => [] },
  quotaForm: { type: Object, required: true },
  actionOptions: { type: Array, default: () => [] },
  saving: { type: Boolean, default: false },
  quotaUnitsForRow: { type: Function, required: true },
  formatQuotaNumber: { type: Function, required: true },
  quotaUsedValue: { type: Function, required: true },
})

defineEmits(['update:visible', 'hydrate', 'save'])
</script>
