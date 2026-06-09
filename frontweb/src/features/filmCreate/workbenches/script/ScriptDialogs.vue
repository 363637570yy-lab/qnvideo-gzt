<template>
<el-dialog
    v-model="showSelectScriptDialog"
    title="从剧本库导入"
    width="640px"
    destroy-on-close
    @open="loadSelectScriptList"
  >
    <div v-loading="selectScriptLoading || selectScriptImporting" class="select-script-list">
      <div
        v-for="d in selectableScriptDramas"
        :key="d.id"
        class="select-script-item"
        :class="{ disabled: selectScriptImporting }"
        @click="!selectScriptImporting && onPickScriptFromDialog(d.id)"
      >
        <div class="select-script-title">{{ d.title || '未命名' }}</div>
        <div class="select-script-desc">{{ (d.description || '暂无简介').slice(0, 200) }}{{ (d.description && d.description.length > 200) ? '…' : '' }}</div>
      </div>
      <div v-if="!selectScriptLoading && selectScriptDramas.length === 0" class="select-script-empty">剧本库为空，请先在「剧本管理」创建剧本</div>
      <div v-else-if="!selectScriptLoading && selectableScriptDramas.length === 0" class="select-script-empty">没有可导入的其他剧本</div>
    </div>
  </el-dialog>


<el-dialog v-model="showNovelImport" title="导入小说/长文" width="600px" @close="novelImportReset">
  <div class="novel-import-dialog">
    <p style="color:#6b7280;font-size:13px;margin-bottom:12px">支持粘贴小说文本或上传 txt 文件，AI 自动识别章节并转换为剧本集数</p>
    <el-tabs v-model="novelImportMode">
      <el-tab-pane label="粘贴文本" name="text">
        <el-input
          v-model="novelText"
          type="textarea"
          :rows="10"
          placeholder="粘贴小说正文，AI 会自动识别章节..."
        />
      </el-tab-pane>
      <el-tab-pane label="上传文件" name="file">
        <el-upload
          drag
          :auto-upload="false"
          :on-change="onNovelFileChange"
          accept=".txt,.md"
          :show-file-list="false"
        >
          <el-icon class="el-icon--upload"><DocumentAdd /></el-icon>
          <div class="el-upload__text">拖拽 .txt / .md 文件到此处，或<em>点击上传</em></div>
        </el-upload>
        <div v-if="novelFileName" style="margin-top:8px;font-size:13px;color:#409eff">已选择：{{ novelFileName }}</div>
      </el-tab-pane>
    </el-tabs>
    <div class="novel-import-options" style="margin-top:12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:6px;font-size:13px">
        <span>最多导入集数：</span>
        <el-input-number v-model="novelMaxChapters" :min="1" :max="20" size="small" style="width:100px" />
      </div>
      <el-checkbox v-model="novelAiSummarize" size="small">AI 转换为剧本格式（会消耗 Token）</el-checkbox>
    </div>
  </div>
  <template #footer>
    <el-button @click="showNovelImport = false">取消</el-button>
    <el-button type="primary" :loading="novelImporting" @click="onImportNovel">开始导入</el-button>
  </template>
</el-dialog>


</template>

<script>
import { DocumentAdd } from '@element-plus/icons-vue'

export default {
  name: 'ScriptDialogs',
  components: { DocumentAdd },
  props: {
    ctx: { type: Object, required: true },
  },
  setup(props) {
    return props.ctx
  },
}
</script>
