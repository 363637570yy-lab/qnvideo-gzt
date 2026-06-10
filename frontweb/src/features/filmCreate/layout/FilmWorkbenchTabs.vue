<template>
  <nav class="film-workbench-tabs" aria-label="制作工作台">
    <button
      v-for="tab in tabs"
      :key="tab.name"
      type="button"
      class="film-workbench-tab"
      :class="{ active: activeTab === tab.name }"
      :aria-current="activeTab === tab.name ? 'page' : undefined"
      @click="activeTab = tab.name"
    >
      <el-icon class="film-workbench-tab-icon">
        <component :is="tab.icon" />
      </el-icon>
      <span>{{ tab.label }}</span>
    </button>
  </nav>
</template>

<script setup>
import { Box, Document, Film, Picture, User, VideoCamera } from '@element-plus/icons-vue'

const activeTab = defineModel({ type: String, default: 'script' })

const tabs = [
  { label: '故事剧本', name: 'script', icon: Document },
  { label: '角色', name: 'characters', icon: User },
  { label: '场景', name: 'scenes', icon: Picture },
  { label: '道具', name: 'props', icon: Box },
  { label: '分镜', name: 'storyboards', icon: Film },
  { label: '视频/合成', name: 'videoCompose', icon: VideoCamera },
]
</script>
