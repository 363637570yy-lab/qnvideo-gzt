<template>
<el-dialog v-model="showEditScene" :title="editSceneForm?.id ? '编辑场景' : '添加场景'" width="75%" @close="onCloseSceneDialog">
  <el-form v-if="editSceneForm" label-width="90px">
    <!-- 参考图上传区（新增/编辑均显示） -->
    <el-form-item label="参考图">
      <div class="ref-image-zone">
        <div class="ref-image-box" @click="addSceneRefFileInput?.click()" @drop.prevent="onRefImageDrop('scene', $event)" @dragover.prevent>
          <img v-if="addSceneRefImage" :src="addSceneRefImage.dataUrl" class="ref-preview-img" />
          <img v-else-if="editSceneForm.ref_image"
            :src="editSceneForm.ref_image.startsWith('http') ? editSceneForm.ref_image : '/static/' + editSceneForm.ref_image"
            class="ref-preview-img" />
          <img v-else-if="editSceneForm.id && (editSceneForm.image_url || editSceneForm.local_path)"
            :src="assetImageUrl(editSceneForm)" class="ref-preview-img" style="opacity:0.5" />
          <div v-else class="ref-upload-hint"><span class="ref-upload-icon">🖼</span><span>点击或拖入参考图</span></div>
        </div>
        <div v-if="addSceneRefImage" class="ref-actions">
          <el-button type="primary" size="small" :loading="extractingSceneDesc" @click="doExtractFromRef('scene')">提取特征描述</el-button>
          <el-button size="small" @click="addSceneRefImage = null">移除</el-button>
        </div>
        <div v-else-if="editSceneForm.ref_image" class="ref-actions">
          <el-button type="primary" size="small" :loading="extractingSceneDesc" @click="doExtractSceneFromImage">从参考图提取描述</el-button>
          <el-button size="small" @click="clearSceneRefImage">移除参考图</el-button>
        </div>
        <div v-else-if="editSceneForm.id && (editSceneForm.image_url || editSceneForm.local_path) && !editSceneForm.prompt" class="ref-actions">
          <el-button size="small" :loading="extractingSceneDesc" @click="doExtractSceneFromImage">从主图提取描述</el-button>
        </div>
      </div>
    </el-form-item>
    <el-form-item label="地点" required>
      <el-input v-model="editSceneForm.location" placeholder="如：森林、教室" />
    </el-form-item>
    <el-form-item label="时间">
      <el-input v-model="editSceneForm.time" placeholder="如：白天、傍晚" />
    </el-form-item>
    <el-form-item label="场景描述">
      <el-input v-model="editSceneForm.prompt" type="textarea" :autosize="{ minRows: 3, maxRows: 8 }" placeholder="场景的简要描述，供 AI 生成四视图时参考" />
    </el-form-item>
    <el-form-item v-if="editSceneForm.id">
      <template #label>
        <span style="font-size:12px;line-height:1.4;white-space:normal;word-break:break-all;display:inline-block;width:90px">单图提示词</span>
      </template>
      <div style="width:100%">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-size:12px;color:#909399">单图场景的完整图片提示词（不含四宫格布局），生图时直接使用；可手动修改</span>
          <el-button size="small" :loading="editScenePromptGenerating" @click="doGenerateSceneSinglePrompt">重新生成提示词</el-button>
        </div>
        <el-input
          v-model="editSceneForm.polished_prompt_single"
          type="textarea"
          :autosize="{ minRows: 5, maxRows: 16 }"
          placeholder="单图场景提示词，点击场景列表的「AI 生成」按钮（不勾选四宫格）后会自动生成"
          style="font-size:12px"
        />
      </div>
    </el-form-item>
    <el-form-item v-if="editSceneForm.id">
      <template #label>
        <span style="font-size:12px;line-height:1.4;white-space:normal;word-break:break-all;display:inline-block;width:90px">四视图提示词</span>
      </template>
      <div style="width:100%">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-size:12px;color:#909399">AI 生成的完整四视图图片提示词，生图时直接使用；可手动修改</span>
          <el-button size="small" :loading="editScenePromptGenerating" @click="doGenerateScenePrompt">重新生成提示词</el-button>
        </div>
        <el-input
          v-model="editSceneForm.polished_prompt"
          type="textarea"
          :autosize="{ minRows: 5, maxRows: 16 }"
          :placeholder="editScenePromptGenerating ? 'AI 正在生成四视图提示词，请稍候…' : '点击「重新生成提示词」由 AI 自动生成，或直接在此输入'"
          :disabled="editScenePromptGenerating"
          style="font-size:12px"
        />
      </div>
    </el-form-item>
  </el-form>
  <template #footer>
    <el-button @click="showEditScene = false">取消</el-button>
    <el-button type="primary" :loading="editSceneSaving" :disabled="!editSceneForm?.location?.trim()" @click="submitEditScene">{{ editSceneForm?.id ? '保存' : '添加' }}</el-button>
  </template>
</el-dialog>


<el-dialog v-model="showSceneLibrary" title="场景资源库" width="720px" destroy-on-close class="library-dialog" @open="onSceneLibraryDialogOpen">
  <el-tabs v-model="sceneLibraryTab" class="char-library-tabs" @tab-change="onSceneLibraryTabChange">
    <el-tab-pane label="本剧场景库" name="library">
      <div class="library-toolbar">
        <el-input v-model="sceneLibraryKeyword" placeholder="搜索地点或描述" clearable style="width: 200px" @input="debouncedLoadSceneLibrary()" />
      </div>
      <div v-loading="sceneLibraryLoading" class="library-list">
        <div v-for="item in sceneLibraryList" :key="'slib-' + item.id" class="library-item">
          <div class="library-item-cover" @click="openImagePreview(assetImageUrl(item))">
            <img v-if="item.image_url || item.local_path" :src="assetThumbUrl(item, 240)" alt="" loading="lazy" decoding="async" />
            <span v-else class="library-item-placeholder">暂无图</span>
          </div>
          <div class="library-item-info">
            <div class="library-item-name">{{ item.location || item.time || '未命名' }}</div>
            <div class="library-item-desc">{{ (item.description || item.prompt || '').slice(0, 60) }}{{ (item.description || item.prompt || '').length > 60 ? '…' : '' }}</div>
            <div class="library-item-actions">
              <el-button size="small" type="primary" :loading="isSceneAddToEpisodeLoading('library', item.id)" :disabled="!currentEpisodeId" @click="onAddSceneFromLibrary(item)">加入本集</el-button>
              <el-button size="small" :disabled="!canManageLibrary(item)" @click="openEditSceneLibrary(item)">编辑</el-button>
              <el-button v-if="canManageLibrary(item)" size="small" type="danger" plain @click="onDeleteSceneLibrary(item)">删除</el-button>
            </div>
          </div>
        </div>
        <div v-if="!sceneLibraryLoading && sceneLibraryList.length === 0" class="library-empty">暂无本剧场景库记录，可将本剧场景「加入本剧库」后在此查看</div>
      </div>
      <div class="library-pagination">
        <el-pagination v-model:current-page="sceneLibraryPage" v-model:page-size="sceneLibraryPageSize" :total="sceneLibraryTotal" :page-sizes="[10, 20, 50]" layout="total, sizes, prev, pager, next" @current-change="loadSceneLibraryList" @size-change="loadSceneLibraryList" />
      </div>
    </el-tab-pane>
    <el-tab-pane label="本剧所有场景" name="drama">
      <div class="library-toolbar">
        <el-input v-model="dramaAllSceneKeyword" placeholder="搜索地点或描述" clearable style="width: 200px" @input="debouncedLoadDramaAllSceneList()" />
      </div>
      <div v-loading="dramaAllSceneLoading" class="library-list">
        <div v-for="item in dramaAllSceneList" :key="'sdr-' + item.id" class="library-item">
          <div class="library-item-cover" @click="openImagePreview(assetImageUrl(item))">
            <img v-if="item.image_url || item.local_path" :src="assetThumbUrl(item, 240)" alt="" loading="lazy" decoding="async" />
            <span v-else class="library-item-placeholder">暂无图</span>
          </div>
          <div class="library-item-info">
            <div class="library-item-name">{{ item.location || '未命名' }}<span v-if="item.time" class="library-item-sub"> · {{ item.time }}</span></div>
            <div class="library-item-desc">{{ (item.description || item.prompt || '').slice(0, 60) }}{{ (item.description || item.prompt || '').length > 60 ? '…' : '' }}</div>
            <div class="library-item-actions">
              <el-button size="small" type="primary" :loading="isSceneAddToEpisodeLoading('drama', item.id)" :disabled="!currentEpisodeId" @click="onAddDramaSceneToEpisode(item)">加入本集</el-button>
            </div>
          </div>
        </div>
        <div v-if="!dramaAllSceneLoading && dramaAllSceneList.length === 0" class="library-empty">本剧暂无制作场景，请先在场景面板创建</div>
      </div>
      <div class="library-pagination">
        <el-pagination v-model:current-page="dramaAllScenePage" v-model:page-size="dramaAllScenePageSize" :total="dramaAllSceneTotal" :page-sizes="[10, 20, 50]" layout="total, sizes, prev, pager, next" @current-change="loadDramaAllSceneList" @size-change="loadDramaAllSceneList" />
      </div>
    </el-tab-pane>
  </el-tabs>
  <template #footer>
    <el-button @click="showSceneLibrary = false">关闭</el-button>
  </template>
</el-dialog>

<el-dialog v-model="showEditSceneLibrary" title="编辑公共场景" width="440px" @close="editSceneLibraryForm = null">
  <el-form v-if="editSceneLibraryForm" label-width="80px">
    <el-form-item label="地点">
      <el-input v-model="editSceneLibraryForm.location" placeholder="场景地点" />
    </el-form-item>
    <el-form-item label="时间">
      <el-input v-model="editSceneLibraryForm.time" placeholder="如：浅色/夜晚" />
    </el-form-item>
    <el-form-item label="分类">
      <el-input v-model="editSceneLibraryForm.category" placeholder="可选" />
    </el-form-item>
    <el-form-item label="描述">
      <el-input v-model="editSceneLibraryForm.description" type="textarea" :rows="3" placeholder="可选" />
    </el-form-item>
    <el-form-item label="标签">
      <el-input v-model="editSceneLibraryForm.tags" placeholder="可选，逗号分隔" />
    </el-form-item>
  </el-form>
  <template #footer>
    <el-button @click="showEditSceneLibrary = false">取消</el-button>
    <el-button type="primary" :loading="editSceneLibrarySaving" @click="submitEditSceneLibrary">保存</el-button>
  </template>
</el-dialog>


</template>

<script>
export default {
  name: 'SceneDialogs',
  props: {
    ctx: { type: Object, required: true },
  },
  setup(props) {
    return props.ctx
  },
}
</script>
