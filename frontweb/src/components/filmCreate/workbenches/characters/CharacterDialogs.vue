<template>
<el-dialog v-model="showEditCharacter" :title="editCharacterForm?.id ? '编辑角色' : '添加角色'" width="75%" @close="onCloseCharDialog">
  <el-form v-if="editCharacterForm" label-width="90px">
    <!-- 参考图上传区（新增/编辑均显示） -->
    <el-form-item label="参考图">
      <div class="ref-image-zone">
        <div class="ref-image-box" @click="addCharRefFileInput?.click()" @drop.prevent="onRefImageDrop('character', $event)" @dragover.prevent>
          <!-- 优先：刚上传的新参考图 -->
          <img v-if="addCharRefImage" :src="addCharRefImage.dataUrl" class="ref-preview-img" />
          <!-- 次之：已保存的参考图 -->
          <img v-else-if="editCharacterForm.ref_image"
            :src="editCharacterForm.ref_image.startsWith('http') ? editCharacterForm.ref_image : '/static/' + editCharacterForm.ref_image"
            class="ref-preview-img" />
          <!-- 最后：主图（半透明，提示可上传参考图替代） -->
          <img v-else-if="editCharacterForm.id && (editCharacterForm.image_url || editCharacterForm.local_path)"
            :src="assetImageUrl(editCharacterForm)"
            class="ref-preview-img" style="opacity:0.5" />
          <div v-else class="ref-upload-hint"><span class="ref-upload-icon">🖼</span><span>点击或拖入参考图</span></div>
        </div>
        <div v-if="addCharRefImage" class="ref-actions">
          <el-button type="primary" size="small" :loading="extractingCharAppearance" @click="doExtractFromRef('character')">提取特征描述</el-button>
          <el-button size="small" @click="addCharRefImage = null">移除</el-button>
        </div>
        <div v-else-if="editCharacterForm.ref_image" class="ref-actions">
          <el-button type="primary" size="small" :loading="extractingCharAppearance" @click="doExtractCharFromImage">从参考图提取描述</el-button>
          <el-button size="small" @click="clearCharRefImage">移除参考图</el-button>
        </div>
        <div v-else-if="editCharacterForm.id && (editCharacterForm.image_url || editCharacterForm.local_path) && !editCharacterForm.appearance" class="ref-actions">
          <el-button size="small" :loading="extractingCharAppearance" @click="doExtractCharFromImage">从主图提取描述</el-button>
        </div>
      </div>
    </el-form-item>
    <el-form-item label="名称" required>
      <el-input v-model="editCharacterForm.name" placeholder="角色名称" />
    </el-form-item>
    <el-form-item label="身份/定位">
      <el-select v-model="editCharacterForm.role" placeholder="请选择角色类型" style="width:200px">
        <el-option value="main" label="主角" />
        <el-option value="supporting" label="配角" />
        <el-option value="minor" label="次要角色" />
      </el-select>
    </el-form-item>
    <el-form-item label="外貌描述">
      <el-input v-model="editCharacterForm.appearance" type="textarea" :autosize="{ minRows: 4, maxRows: 10 }" placeholder="用于 AI 生成图像的外貌描述，尽量详细" />
    </el-form-item>
    <el-form-item label="简介">
      <el-input v-model="editCharacterForm.description" type="textarea" :autosize="{ minRows: 3, maxRows: 8 }" placeholder="角色背景简介，供剧本生成参考" />
    </el-form-item>
    <el-form-item v-if="editCharacterForm.id">
      <template #label>
        <span style="font-size:12px;line-height:1.4;white-space:normal;word-break:break-all;display:inline-block;width:90px">图生提示词</span>
      </template>
      <div style="width:100%">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-size:12px;color:#909399">AI 润色后的最终提示词，生成四视图图片时直接使用；可手动修改</span>
          <el-button
            size="small"
            :loading="editCharacterPromptGenerating"
            @click="doGenerateCharacterPrompt"
          >重新生成提示词</el-button>
        </div>
        <el-input
          v-model="editCharacterForm.polished_prompt"
          type="textarea"
          :autosize="{ minRows: 5, maxRows: 16 }"
          :placeholder="editCharacterPromptGenerating ? 'AI 正在生成提示词，请稍候…' : '点击「重新生成提示词」由 AI 自动生成，或直接在此输入'"
          :disabled="editCharacterPromptGenerating"
          style="font-size:12px"
        />
      </div>
    </el-form-item>
    <!-- P0-2: 视觉锚点（identity_anchors） -->
    <el-form-item v-if="editCharacterForm.id" label="视觉锚点">
      <div style="width:100%">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-size:12px;color:#909399">AI 从外貌描述提炼的6层视觉特征，用于保持生成图片角色一致性</span>
          <el-button
            size="small"
            :loading="extractingAnchors"
            :disabled="!editCharacterForm.appearance"
            @click="extractIdentityAnchors"
          >提炼视觉锚点</el-button>
        </div>
        <el-input
          v-if="editCharacterForm.identity_anchors"
          :value="typeof editCharacterForm.identity_anchors === 'string'
            ? editCharacterForm.identity_anchors
            : JSON.stringify(editCharacterForm.identity_anchors, null, 2)"
          type="textarea"
          :rows="4"
          readonly
          style="font-size:11px;font-family:monospace"
          placeholder="点击「提炼视觉锚点」生成"
        />
        <div v-else style="font-size:12px;color:#c0c4cc;padding:4px 0">暂无锚点，点击「提炼视觉锚点」自动提炼</div>
      </div>
    </el-form-item>
    <!-- P1-3: 多阶段造型（stages） -->
    <el-form-item v-if="editCharacterForm.id" label="多阶段造型">
      <div style="width:100%">
        <div style="font-size:12px;color:#909399;margin-bottom:6px">
          不同集次的角色造型变化，格式：JSON 数组 [{"episode_range":[1,3],"appearance":"..."}]
        </div>
        <el-input
          v-model="editCharacterForm.stages"
          type="textarea"
          :rows="4"
          placeholder='例：[{"episode_range":[1,5],"appearance":"白衣少年"},{"episode_range":[6,10],"appearance":"黑衣武者"}]'
          style="font-size:12px;font-family:monospace"
        />
      </div>
    </el-form-item>
  </el-form>
  <template #footer>
    <el-button @click="showEditCharacter = false">取消</el-button>
    <el-button type="primary" :loading="editCharacterSaving" :disabled="!editCharacterForm?.name?.trim()" @click="submitEditCharacter">{{ editCharacterForm?.id ? '保存' : '添加' }}</el-button>
  </template>
</el-dialog>


<el-dialog
  v-model="showCharSd2Cert"
  title="SD2 认证详情"
  width="min(720px, 92vw)"
  destroy-on-close
  class="sd2-cert-dialog"
>
  <template v-if="charSd2CertPayload">
    <el-descriptions :column="1" border size="small" class="sd2-cert-desc">
      <el-descriptions-item label="素材 ID">
        <span class="sd2-cert-value">{{ charSd2CertPayload.hub_asset_id || '—' }}</span>
      </el-descriptions-item>
      <el-descriptions-item label="asset_url">
        <code class="sd2-cert-value">{{ charSd2CertPayload.asset_url || '—' }}</code>
      </el-descriptions-item>
      <el-descriptions-item label="状态">
        <span class="sd2-cert-value">{{ charSd2CertPayload.status || '—' }}</span>
      </el-descriptions-item>
      <el-descriptions-item label="注册图片 URL">
        <span class="sd2-cert-value">{{ charSd2CertPayload.source_image_url || '—' }}</span>
      </el-descriptions-item>
      <el-descriptions-item v-if="charSd2CertPayload.sd2_provider" label="认证提供方">
        <span class="sd2-cert-value">{{ charSd2CertPayload.sd2_provider }}</span>
      </el-descriptions-item>
    </el-descriptions>
  </template>
  <template #footer>
    <el-button @click="showCharSd2Cert = false">关闭</el-button>
  </template>
</el-dialog>


<el-dialog v-model="showCharLibrary" title="角色资源库" width="720px" destroy-on-close class="library-dialog" @open="onCharLibraryDialogOpen">
  <el-tabs v-model="charLibraryTab" class="char-library-tabs" @tab-change="onCharLibraryTabChange">
    <el-tab-pane label="本剧角色库" name="library">
      <div class="library-toolbar">
        <el-input v-model="charLibraryKeyword" placeholder="搜索名称或描述" clearable style="width: 200px" @input="debouncedLoadCharLibrary()" />
      </div>
      <div v-loading="charLibraryLoading" class="library-list">
        <div v-for="item in charLibraryList" :key="'lib-' + item.id" class="library-item">
          <div class="library-item-cover" @click="openImagePreview(assetImageUrl(item))">
            <img v-if="item.image_url || item.local_path" :src="assetThumbUrl(item, 240)" alt="" loading="lazy" decoding="async" />
            <span v-else class="library-item-placeholder">暂无图</span>
          </div>
          <div class="library-item-info">
            <div class="library-item-name">{{ item.name || '未命名' }}</div>
            <div class="library-item-desc">{{ (item.description || '').slice(0, 60) }}{{ (item.description || '').length > 60 ? '…' : '' }}</div>
            <div class="library-item-actions">
              <el-button size="small" type="primary" :loading="isCharAddToEpisodeLoading('library', item.id)" :disabled="!currentEpisodeId" @click="onAddCharFromLibrary(item)">加入本集</el-button>
              <el-button size="small" :disabled="!canManageLibrary(item)" @click="openEditCharLibrary(item)">编辑</el-button>
              <el-button v-if="canManageLibrary(item)" size="small" type="danger" plain @click="onDeleteCharLibrary(item)">删除</el-button>
            </div>
          </div>
        </div>
        <div v-if="!charLibraryLoading && charLibraryList.length === 0" class="library-empty">暂无本剧角色库记录，可将本剧角色「加入本剧库」后在此查看</div>
      </div>
      <div class="library-pagination">
        <el-pagination
          v-model:current-page="charLibraryPage"
          v-model:page-size="charLibraryPageSize"
          :total="charLibraryTotal"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @current-change="loadCharLibraryList"
          @size-change="loadCharLibraryList"
        />
      </div>
    </el-tab-pane>

    <el-tab-pane label="本剧所有角色" name="drama">
      <div class="library-toolbar">
        <el-input v-model="dramaAllCharKeyword" placeholder="搜索名称或描述" clearable style="width: 200px" @input="debouncedLoadDramaAllCharList()" />
      </div>
      <div v-loading="dramaAllCharLoading" class="library-list">
        <div v-for="item in dramaAllCharList" :key="'drama-' + item.id" class="library-item">
          <div class="library-item-cover" @click="openImagePreview(assetImageUrl(item))">
            <img v-if="item.image_url || item.local_path" :src="assetThumbUrl(item, 240)" alt="" loading="lazy" decoding="async" />
            <span v-else class="library-item-placeholder">暂无图</span>
          </div>
          <div class="library-item-info">
            <div class="library-item-name">
              {{ item.name || '未命名' }}
              <el-tag v-if="item.role" size="small" type="info" style="margin-left: 6px">{{ charRoleLabel(item.role) }}</el-tag>
            </div>
            <div class="library-item-desc">{{ (item.description || item.appearance || '').slice(0, 60) }}{{ (item.description || item.appearance || '').length > 60 ? '…' : '' }}</div>
            <div class="library-item-actions">
              <el-button size="small" type="primary" :loading="isCharAddToEpisodeLoading('drama', item.id)" :disabled="!currentEpisodeId" @click="onAddDramaCharToEpisode(item)">加入本集</el-button>
            </div>
          </div>
        </div>
        <div v-if="!dramaAllCharLoading && dramaAllCharList.length === 0" class="library-empty">本剧暂无制作角色，请先在角色面板创建</div>
      </div>
      <div class="library-pagination">
        <el-pagination
          v-model:current-page="dramaAllCharPage"
          v-model:page-size="dramaAllCharPageSize"
          :total="dramaAllCharTotal"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @current-change="loadDramaAllCharList"
          @size-change="loadDramaAllCharList"
        />
      </div>
    </el-tab-pane>

  </el-tabs>
  <template #footer>
    <el-button @click="showCharLibrary = false">关闭</el-button>
  </template>
</el-dialog>

<el-dialog v-model="showEditCharLibrary" title="编辑公共角色" width="440px" @close="editCharLibraryForm = null">
  <el-form v-if="editCharLibraryForm" label-width="80px">
    <el-form-item label="名称">
      <el-input v-model="editCharLibraryForm.name" placeholder="角色名称" />
    </el-form-item>
    <el-form-item label="分类">
      <el-input v-model="editCharLibraryForm.category" placeholder="可选" />
    </el-form-item>
    <el-form-item label="描述">
      <el-input v-model="editCharLibraryForm.description" type="textarea" :rows="3" placeholder="可选" />
    </el-form-item>
    <el-form-item label="标签">
      <el-input v-model="editCharLibraryForm.tags" placeholder="可选，逗号分隔" />
    </el-form-item>
  </el-form>
  <template #footer>
    <el-button @click="showEditCharLibrary = false">取消</el-button>
    <el-button type="primary" :loading="editCharLibrarySaving" @click="submitEditCharLibrary">保存</el-button>
  </template>
</el-dialog>


</template>

<script>
export default {
  name: 'CharacterDialogs',
  props: {
    ctx: { type: Object, required: true },
  },
  setup(props) {
    return props.ctx
  },
}
</script>
