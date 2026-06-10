<template>
  <header class="header">
    <div class="header-inner">
      <h1 class="logo" @click="$emit('go-list')">
        <span class="logo-main">芊柠AI视频工作台</span>
        <span class="logo-sub">QN AI Video</span>
      </h1>
      <span class="breadcrumb-sep">›</span>
      <span class="page-title">{{ title || '剧集管理' }}</span>
      <el-button class="btn-back-list" @click="$emit('go-list')">
        <el-icon><ArrowLeft /></el-icon>返回列表
      </el-button>
      <div class="header-actions">
        <el-button class="btn-theme" :title="isDark ? '切换到浅色模式' : '切换到暗色模式'" @click="$emit('toggle-theme')">
          <el-icon><Sunny v-if="isDark" /><Moon v-else /></el-icon>
          {{ isDark ? '浅色' : '暗色' }}
        </el-button>
        <el-button type="primary" @click="$emit('go-create')">
          <el-icon><VideoPlay /></el-icon>进入制作
        </el-button>
      </div>
    </div>
  </header>
</template>

<script setup>
import { ArrowLeft, Moon, Sunny, VideoPlay } from '@element-plus/icons-vue'

defineProps({
  title: { type: String, default: '' },
  isDark: { type: Boolean, default: false },
})

defineEmits(['go-list', 'toggle-theme', 'go-create'])
</script>
