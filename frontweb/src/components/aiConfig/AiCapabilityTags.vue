<template>
  <div class="capability-tags">
    <template v-if="visibleCapabilities.length">
      <el-tag
        v-for="cap in visibleCapabilities"
        :key="cap.key"
        class="capability-tag"
        size="small"
        :type="tagType(cap.group)"
        effect="plain"
      >
        {{ cap.label || cap.key }}
      </el-tag>
      <el-tooltip v-if="hiddenCount > 0" placement="top">
        <template #content>
          <div class="capability-tooltip">
            <span v-for="cap in hiddenCapabilities" :key="cap.key">{{ cap.label || cap.key }}</span>
          </div>
        </template>
        <el-tag class="capability-tag" size="small" type="info" effect="plain">+{{ hiddenCount }}</el-tag>
      </el-tooltip>
    </template>
    <span v-else class="capability-empty">-</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  capabilities: { type: Array, default: () => [] },
  limit: { type: Number, default: 4 },
})

const cleanCapabilities = computed(() => (
  (props.capabilities || [])
    .filter((item) => item && item.key)
))
const visibleCapabilities = computed(() => cleanCapabilities.value.slice(0, Math.max(1, props.limit)))
const hiddenCapabilities = computed(() => cleanCapabilities.value.slice(Math.max(1, props.limit)))
const hiddenCount = computed(() => hiddenCapabilities.value.length)

function tagType(group) {
  const map = {
    input: 'info',
    output: 'success',
    runtime: 'warning',
    usage: 'info',
    control: 'danger',
    audio: 'success',
  }
  return map[group] || 'info'
}
</script>

<style scoped>
.capability-tags {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  min-height: 24px;
}

.capability-tag {
  margin: 0;
}

.capability-empty {
  color: #909399;
}

.capability-tooltip {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
