<template>
<el-dialog v-model="showAddProp" title="添加道具" width="600px" @close="() => { addPropForm = { name: '', type: '', description: '', prompt: '' }; addPropAddRefImage = null }">
  <el-form label-width="90px">
    <el-form-item label="参考图">
      <div class="ref-image-zone">
        <div class="ref-image-box" @click="addPropAddRefFileInput?.click()" @drop.prevent="onRefImageDrop2('addProp', $event)" @dragover.prevent>
          <img v-if="addPropAddRefImage" :src="addPropAddRefImage.dataUrl" class="ref-preview-img" />
          <div v-else class="ref-upload-hint"><span class="ref-upload-icon">🖼</span><span>点击或拖入参考图</span></div>
        </div>
        <div v-if="addPropAddRefImage" class="ref-actions">
          <el-button type="primary" size="small" :loading="extractingPropAddDesc" @click="doExtractFromRef2('addProp')">提取特征描述</el-button>
          <el-button size="small" @click="addPropAddRefImage = null">移除</el-button>
        </div>
      </div>
    </el-form-item>
    <el-form-item label="名称" required>
      <el-input v-model="addPropForm.name" placeholder="道具名称" />
    </el-form-item>
    <el-form-item label="类型">
      <el-input v-model="addPropForm.type" placeholder="如：物品、建筑" />
    </el-form-item>
    <el-form-item label="描述">
      <el-input v-model="addPropForm.description" type="textarea" :rows="3" placeholder="描述" />
    </el-form-item>
    <el-form-item label="图生提示词">
      <el-input v-model="addPropForm.prompt" type="textarea" :rows="2" placeholder="用于 AI 生成图片的提示词" />
    </el-form-item>
  </el-form>
  <template #footer>
    <el-button @click="showAddProp = false">取消</el-button>
    <el-button type="primary" :loading="addPropSaving" :disabled="!addPropForm.name.trim()" @click="submitAddProp">确定</el-button>
  </template>
</el-dialog>


<el-dialog v-model="showEditProp" :title="editPropForm?.id ? '编辑道具' : '添加道具'" width="75%" @close="onClosePropDialog">
  <el-form v-if="editPropForm" label-width="90px">
    <!-- 参考图上传区（新增/编辑均显示） -->
    <el-form-item label="参考图">
      <div class="ref-image-zone">
        <div class="ref-image-box" @click="addPropRefFileInput?.click()" @drop.prevent="onRefImageDrop('prop', $event)" @dragover.prevent>
          <img v-if="addPropRefImage" :src="addPropRefImage.dataUrl" class="ref-preview-img" />
          <img v-else-if="editPropForm.ref_image"
            :src="editPropForm.ref_image.startsWith('http') ? editPropForm.ref_image : '/static/' + editPropForm.ref_image"
            class="ref-preview-img" />
          <img v-else-if="editPropForm.id && (editPropForm.image_url || editPropForm.local_path)"
            :src="assetImageUrl(editPropForm)" class="ref-preview-img" style="opacity:0.5" />
          <div v-else class="ref-upload-hint"><span class="ref-upload-icon">🖼</span><span>点击或拖入参考图</span></div>
        </div>
        <div v-if="addPropRefImage" class="ref-actions">
          <el-button type="primary" size="small" :loading="extractingPropDesc" @click="doExtractFromRef('prop')">提取特征描述</el-button>
          <el-button size="small" @click="addPropRefImage = null">移除</el-button>
        </div>
        <div v-else-if="editPropForm.ref_image" class="ref-actions">
          <el-button type="primary" size="small" :loading="extractingPropDesc" @click="doExtractPropFromImage">从参考图提取描述</el-button>
          <el-button size="small" @click="clearPropRefImage">移除参考图</el-button>
        </div>
        <div v-else-if="editPropForm.id && (editPropForm.image_url || editPropForm.local_path) && !editPropForm.description" class="ref-actions">
          <el-button size="small" :loading="extractingPropDesc" @click="doExtractPropFromImage">从主图提取描述</el-button>
        </div>
      </div>
    </el-form-item>
    <el-form-item label="名称" required>
      <el-input v-model="editPropForm.name" placeholder="道具名称" />
    </el-form-item>
    <el-form-item label="类型">
      <el-input v-model="editPropForm.type" placeholder="如：物品、建筑" />
    </el-form-item>
    <el-form-item label="描述">
      <el-input v-model="editPropForm.description" type="textarea" :autosize="{ minRows: 3, maxRows: 8 }" placeholder="道具描述" />
    </el-form-item>
    <el-form-item label="图生提示词">
      <div style="width:100%">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-size:12px;color:#909399">AI 润色后的图片提示词，生成图片时直接使用；可手动修改</span>
          <el-button size="small" :loading="editPropPromptGenerating" @click="doGeneratePropPrompt">重新生成提示词</el-button>
        </div>
        <el-input
          v-model="editPropForm.prompt"
          type="textarea"
          :autosize="{ minRows: 5, maxRows: 16 }"
          :placeholder="editPropPromptGenerating ? 'AI 正在生成提示词，请稍候…' : '点击「重新生成提示词」由 AI 自动生成，或直接在此输入'"
          :disabled="editPropPromptGenerating"
        />
      </div>
    </el-form-item>
  </el-form>
  <template #footer>
    <el-button @click="showEditProp = false">取消</el-button>
    <el-button type="primary" :loading="editPropSaving" :disabled="!editPropForm?.name?.trim()" @click="submitEditProp">保存</el-button>
  </template>
</el-dialog>


<el-dialog v-model="showPropLibrary" title="道具资源库" width="720px" destroy-on-close class="library-dialog" @open="onPropLibraryDialogOpen">
  <el-tabs v-model="propLibraryTab" class="char-library-tabs" @tab-change="onPropLibraryTabChange">
    <el-tab-pane label="本剧道具库" name="library">
      <div class="library-toolbar">
        <el-input v-model="propLibraryKeyword" placeholder="搜索名称或描述" clearable style="width: 200px" @input="debouncedLoadPropLibrary()" />
      </div>
      <div v-loading="propLibraryLoading" class="library-list">
        <div v-for="item in propLibraryList" :key="'plib-' + item.id" class="library-item">
          <div class="library-item-cover" @click="openImagePreview(assetImageUrl(item))">
            <img v-if="item.image_url || item.local_path" :src="assetThumbUrl(item, 240)" alt="" loading="lazy" decoding="async" />
            <span v-else class="library-item-placeholder">暂无图</span>
          </div>
          <div class="library-item-info">
            <div class="library-item-name">{{ item.name || '未命名' }}</div>
            <div class="library-item-desc">{{ (item.description || item.prompt || '').slice(0, 60) }}{{ (item.description || item.prompt || '').length > 60 ? '…' : '' }}</div>
            <div class="library-item-actions">
              <el-button size="small" type="primary" :loading="isPropAddToEpisodeLoading('library', item.id)" :disabled="!currentEpisodeId" @click="onAddPropFromLibrary(item)">加入本集</el-button>
              <el-button size="small" :disabled="!canManageLibrary(item)" @click="openEditPropLibrary(item)">编辑</el-button>
              <el-button v-if="canManageLibrary(item)" size="small" type="danger" plain @click="onDeletePropLibrary(item)">删除</el-button>
            </div>
          </div>
        </div>
        <div v-if="!propLibraryLoading && propLibraryList.length === 0" class="library-empty">暂无本剧道具库记录，可将本剧道具「加入本剧库」后在此查看</div>
      </div>
      <div class="library-pagination">
        <el-pagination v-model:current-page="propLibraryPage" v-model:page-size="propLibraryPageSize" :total="propLibraryTotal" :page-sizes="[10, 20, 50]" layout="total, sizes, prev, pager, next" @current-change="loadPropLibraryList" @size-change="loadPropLibraryList" />
      </div>
    </el-tab-pane>
    <el-tab-pane label="本剧所有道具" name="drama">
      <div class="library-toolbar">
        <el-input v-model="dramaAllPropKeyword" placeholder="搜索名称或描述" clearable style="width: 200px" @input="debouncedLoadDramaAllPropList()" />
      </div>
      <div v-loading="dramaAllPropLoading" class="library-list">
        <div v-for="item in dramaAllPropList" :key="'pdr-' + item.id" class="library-item">
          <div class="library-item-cover" @click="openImagePreview(assetImageUrl(item))">
            <img v-if="item.image_url || item.local_path" :src="assetThumbUrl(item, 240)" alt="" loading="lazy" decoding="async" />
            <span v-else class="library-item-placeholder">暂无图</span>
          </div>
          <div class="library-item-info">
            <div class="library-item-name">{{ item.name || '未命名' }}</div>
            <div class="library-item-desc">{{ (item.description || item.prompt || '').slice(0, 60) }}{{ (item.description || item.prompt || '').length > 60 ? '…' : '' }}</div>
            <div class="library-item-actions">
              <el-button size="small" type="primary" :loading="isPropAddToEpisodeLoading('drama', item.id)" :disabled="!currentEpisodeId" @click="onAddDramaPropToEpisode(item)">加入本集</el-button>
            </div>
          </div>
        </div>
        <div v-if="!dramaAllPropLoading && dramaAllPropList.length === 0" class="library-empty">本剧暂无制作道具，请先在道具面板创建</div>
      </div>
      <div class="library-pagination">
        <el-pagination v-model:current-page="dramaAllPropPage" v-model:page-size="dramaAllPropPageSize" :total="dramaAllPropTotal" :page-sizes="[10, 20, 50]" layout="total, sizes, prev, pager, next" @current-change="loadDramaAllPropList" @size-change="loadDramaAllPropList" />
      </div>
    </el-tab-pane>
  </el-tabs>
  <template #footer>
    <el-button @click="showPropLibrary = false">关闭</el-button>
  </template>
</el-dialog>

<el-dialog v-model="showEditPropLibrary" title="编辑公共道具" width="440px" @close="editPropLibraryForm = null">
  <el-form v-if="editPropLibraryForm" label-width="80px">
    <el-form-item label="名称">
      <el-input v-model="editPropLibraryForm.name" placeholder="道具名称" />
    </el-form-item>
    <el-form-item label="分类">
      <el-input v-model="editPropLibraryForm.category" placeholder="可选" />
    </el-form-item>
    <el-form-item label="描述">
      <el-input v-model="editPropLibraryForm.description" type="textarea" :rows="3" placeholder="可选" />
    </el-form-item>
    <el-form-item label="标签">
      <el-input v-model="editPropLibraryForm.tags" placeholder="可选，逗号分隔" />
    </el-form-item>
  </el-form>
  <template #footer>
    <el-button @click="showEditPropLibrary = false">取消</el-button>
    <el-button type="primary" :loading="editPropLibrarySaving" @click="submitEditPropLibrary">保存</el-button>
  </template>
</el-dialog>


</template>

<script>
export default {
  name: 'PropDialogs',
  props: {
    ctx: { type: Object, required: true },
  },
  setup(props) {
    return props.ctx
  },
}
</script>
