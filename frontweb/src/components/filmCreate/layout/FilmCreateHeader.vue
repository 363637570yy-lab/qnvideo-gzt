<template>
    <!-- 顶部 -->
    <header class="header">
      <div class="header-inner">
        <h1 class="logo" @click="goList">
          <span class="logo-main">芊柠AI视频工作台</span>
          <span class="logo-sub">QN AI Video</span>
        </h1>
        <span class="breadcrumb-sep">›</span>
        <span class="page-title">{{ dramaId ? projectTitle : '新建故事' }}</span>
        <el-select
          v-if="dramaId"
          v-model="selectedEpisodeId"
          class="header-episode-select"
          placeholder="选择集数"
          clearable
          size="small"
          style="width: 130px"
          @change="onEpisodeSelect"
        >
          <el-option
            v-for="ep in (store.drama?.episodes || [])"
            :key="ep.id"
            :label="ep.title || '第' + (ep.episode_number || 0) + '集'"
            :value="ep.id"
          />
        </el-select>
        <el-button v-if="dramaId" class="btn-back-drama" title="打开项目详情与剧集管理" @click="router.push('/drama/' + dramaId)">
          <el-icon><Document /></el-icon>
          剧集管理
        </el-button>
        <div class="header-actions">
          <el-button class="btn-theme" :title="isDark ? '切换到浅色模式' : '切换到暗色模式'" @click="toggleTheme">
            <el-icon><Sunny v-if="isDark" /><Moon v-else /></el-icon>
            {{ isDark ? '浅色' : '暗色' }}
          </el-button>
          <el-button class="btn-ai-config" @click="showUsageCenterDialog = true">
            <el-icon><DataAnalysis /></el-icon>
            用量中心
          </el-button>
          <el-button v-if="isAdminUser" class="btn-ai-config" @click="showAiConfigDialog = true">
            <el-icon><Setting /></el-icon>
            AI配置
          </el-button>
          <el-button v-if="isAdminUser" class="btn-ai-config" @click="showWorkflowConfigDialog = true">
            <el-icon><Setting /></el-icon>
            工作流配置
          </el-button>
          <AccountMenu :user="currentUser" />
        </div>
      </div>
    </header>


</template>

<script>
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Setting, Plus, Minus, Sunny, Moon, MagicStick, Upload, Delete, Check, Loading, WarningFilled, User, Box, Picture, Film, VideoCamera, Document, InfoFilled, Refresh, ZoomIn, QuestionFilled, DocumentAdd, Expand, Fold, VideoPlay, DataAnalysis } from '@element-plus/icons-vue'
import AccountMenu from '@/components/AccountMenu.vue'

export default {
  name: 'FilmCreateHeader',
  props: {
    ctx: { type: Object, required: true },
  },
  components: { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Setting, Plus, Minus, Sunny, Moon, MagicStick, Upload, Delete, Check, Loading, WarningFilled, User, Box, Picture, Film, VideoCamera, Document, InfoFilled, Refresh, ZoomIn, QuestionFilled, DocumentAdd, Expand, Fold, VideoPlay, DataAnalysis, AccountMenu },
  setup(props) {
    return props.ctx
  },
}
</script>

