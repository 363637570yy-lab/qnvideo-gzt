<template>
  <el-tabs v-model="activeTab" class="film-workbench-tabs">
    <el-tab-pane label="剧本" name="script" />
    <el-tab-pane label="角色" name="characters" />
    <el-tab-pane label="场景" name="scenes" />
    <el-tab-pane label="道具" name="props" />
    <el-tab-pane label="分镜" name="storyboards" />
    <el-tab-pane label="视频/合成" name="videoCompose" />
  </el-tabs>
</template>

<script setup>
const activeTab = defineModel({ type: String, default: 'script' })
</script>

