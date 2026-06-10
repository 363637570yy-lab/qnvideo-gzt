<template>
  <section class="section card">
    <div class="section-header">
      <div class="section-title">分集列表</div>
      <span class="section-count">共 {{ episodes.length }} 集</span>
      <EpisodeBatchImportDialog
        ref="episodeBatchImportDialogRef"
        :start-episode-number="nextEpisodeNumber"
        style="margin-left: auto"
        @import="$emit('batch-import', $event)"
      />
      <el-button size="small" type="primary" :loading="addingEpisode" @click="$emit('add-episode')">
        <el-icon><Plus /></el-icon>新增一集
      </el-button>
    </div>
    <div v-if="episodes.length === 0" class="empty-tip">暂无分集，点击「新增一集」开始创作</div>
    <div v-else class="episode-grid">
      <div
        v-for="ep in episodes"
        :key="ep.id"
        class="episode-card"
        title="点击进入制作页"
        @click="$emit('go-episode', ep.id)"
      >
        <div class="episode-card-header">
          <span class="episode-num">第 {{ ep.episode_number ?? ep.number ?? '?' }} 集</span>
          <el-button
            size="small"
            type="danger"
            plain
            circle
            :icon="Delete"
            :loading="deletingEpisodeId === ep.id"
            @click.stop="$emit('delete-episode', ep)"
          />
        </div>
        <div class="episode-title">{{ ep.title || '未命名' }}</div>
        <div class="episode-preview">{{ (ep.script_content || '').slice(0, 20) || '暂无剧本' }}</div>
        <div class="episode-stats">
          <span class="ep-stat">
            <span class="ep-stat-num">{{ ep.storyboard_count ?? ep.storyboards?.length ?? 0 }}</span> 分镜
          </span>
          <span v-if="ep.status" class="ep-stat ep-stat--status" :class="'ep-status--' + ep.status">{{ epStatusLabel(ep.status) }}</span>
        </div>
        <div class="episode-enter">
          <el-icon class="episode-enter-icon"><VideoPlay /></el-icon>
          进入制作
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import { Delete, Plus, VideoPlay } from '@element-plus/icons-vue'
import EpisodeBatchImportDialog from '@/components/EpisodeBatchImportDialog.vue'

defineProps({
  episodes: { type: Array, default: () => [] },
  nextEpisodeNumber: { type: Number, default: 1 },
  addingEpisode: { type: Boolean, default: false },
  deletingEpisodeId: { type: [Number, String], default: null },
  epStatusLabel: { type: Function, required: true },
})

defineEmits(['batch-import', 'add-episode', 'delete-episode', 'go-episode'])

const episodeBatchImportDialogRef = ref(null)

defineExpose({
  openBatchImportDialog() {
    episodeBatchImportDialogRef.value?.openDialog?.()
  },
})
</script>
