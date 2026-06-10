<template>
  <el-dialog
    :model-value="visible"
    title="一键换Key"
    width="440px"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-alert
      type="warning"
      :closable="false"
      style="margin-bottom: 16px"
      title="此操作将替换所有配置的 API Key，请确认新 Key 可用后再提交。"
      show-icon
    />
    <el-form label-width="80px">
      <el-form-item label="新 API Key">
        <el-input
          :model-value="input"
          type="password"
          show-password
          placeholder="粘贴新的 API Key"
          clearable
          @update:model-value="$emit('update:input', $event)"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="!input.trim()" @click="$emit('submit')">确认替换</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
defineProps({
  visible: { type: Boolean, default: false },
  input: { type: String, default: '' },
  saving: { type: Boolean, default: false },
})

defineEmits(['update:visible', 'update:input', 'submit'])
</script>
