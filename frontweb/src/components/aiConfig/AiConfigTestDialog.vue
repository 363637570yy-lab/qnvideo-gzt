<template>
  <el-dialog :model-value="visible" title="测试连接" width="420px" @update:model-value="$emit('update:visible', $event)">
    <p v-if="testResult === null">正在测试…</p>
    <template v-else-if="testResult">
      <el-alert
        v-if="testServiceType === 'image' || testServiceType === 'video'"
        type="success"
        title="连接成功"
        description="API Key 有效，网络已连通。提示：测试仅验证 Key 合法性，不实际生成图片/视频，模型名填错、账号未开通该功能或配额不足时实际生成仍可能报错。"
        show-icon
        :closable="false"
      />
      <el-alert
        v-else
        type="success"
        title="连接成功"
        description="文本生成接口已正常响应。"
        show-icon
        :closable="false"
      />
    </template>
    <el-alert v-else type="error" :title="testError || '连接失败'" show-icon :closable="false" />
    <template #footer>
      <el-button @click="$emit('update:visible', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
defineProps({
  visible: { type: Boolean, default: false },
  testResult: { default: null },
  testServiceType: { type: String, default: '' },
  testError: { type: String, default: '' },
})

defineEmits(['update:visible'])
</script>
