<template>
  <section class="section card res-section">
    <nav class="res-tabbar">
      <span class="res-tab-group-label">资源库</span>
      <button
        v-for="t in libraryTabs"
        :key="t.v"
        class="res-tab res-tab--lib"
        :class="{ active: activeTab === t.v }"
        @click="setTab(t.v)"
      >{{ t.label }}</button>
      <span class="res-tab-spacer"></span>
      <span class="res-tab-group-label res-tab-group-label--prod">制作资源</span>
      <button
        v-for="t in dramaTabs"
        :key="t.v"
        class="res-tab res-tab--drama"
        :class="{ active: activeTab === t.v }"
        @click="setTab(t.v)"
      >{{ t.label }}</button>
    </nav>

    <template v-if="activeTab === 'lib-char'">
      <div class="library-toolbar">
        <el-input :model-value="charKw" placeholder="搜索角色" clearable style="width: 200px" @input="onKeywordInput('char', $event)" />
        <el-button size="small" @click="$emit('open-import', 'char')">从素材库导入</el-button>
      </div>
      <div v-loading="charLoading" class="library-list">
        <div v-for="item in charList" :key="item.id" class="library-item">
          <div class="library-item-cover" @click="$emit('preview', assetImageUrl(item))">
            <img v-if="item.image_url || item.local_path" :src="assetImageUrl(item)" alt="" />
            <span v-else class="library-placeholder">暂无图</span>
          </div>
          <div class="library-item-info">
            <div class="library-item-name">{{ item.name || '未命名' }}</div>
            <div class="library-item-desc">{{ (item.description || '').slice(0, 60) }}</div>
            <div class="library-item-actions">
              <el-button size="small" @click="$emit('edit-char', item)">编辑</el-button>
              <el-button v-if="canManageLibrary(item)" size="small" type="danger" plain @click="$emit('delete-char', item)">删除</el-button>
            </div>
          </div>
        </div>
        <div v-if="!charLoading && charList.length === 0" class="library-empty">暂无本剧角色库记录，可在制作页面「加入本剧库」</div>
      </div>
      <div class="library-pagination">
        <el-pagination
          :current-page="charPage"
          :page-size="charPageSize"
          :total="charTotal"
          :page-sizes="[10,20,50]"
          layout="total, sizes, prev, pager, next"
          @current-change="onPageChange('char', $event)"
          @size-change="onPageSizeChange('char', $event)"
        />
      </div>
    </template>

    <template v-if="activeTab === 'lib-scene'">
      <div class="library-toolbar">
        <el-input :model-value="sceneKw" placeholder="搜索场景" clearable style="width: 200px" @input="onKeywordInput('scene', $event)" />
        <el-button size="small" @click="$emit('open-import', 'scene')">从素材库导入</el-button>
      </div>
      <div v-loading="sceneLoading" class="library-list">
        <div v-for="item in sceneList" :key="item.id" class="library-item">
          <div class="library-item-cover" @click="$emit('preview', assetImageUrl(item))">
            <img v-if="item.image_url || item.local_path" :src="assetImageUrl(item)" alt="" />
            <span v-else class="library-placeholder">暂无图</span>
          </div>
          <div class="library-item-info">
            <div class="library-item-name">{{ item.location || item.time || '未命名' }}</div>
            <div class="library-item-desc">{{ (item.description || item.prompt || '').slice(0, 60) }}</div>
            <div class="library-item-actions">
              <el-button size="small" @click="$emit('edit-scene', item)">编辑</el-button>
              <el-button v-if="canManageLibrary(item)" size="small" type="danger" plain @click="$emit('delete-scene', item)">删除</el-button>
            </div>
          </div>
        </div>
        <div v-if="!sceneLoading && sceneList.length === 0" class="library-empty">暂无本剧场景库记录，可在制作页面「加入本剧库」</div>
      </div>
      <div class="library-pagination">
        <el-pagination
          :current-page="scenePage"
          :page-size="scenePageSize"
          :total="sceneTotal"
          :page-sizes="[10,20,50]"
          layout="total, sizes, prev, pager, next"
          @current-change="onPageChange('scene', $event)"
          @size-change="onPageSizeChange('scene', $event)"
        />
      </div>
    </template>

    <template v-if="activeTab === 'lib-prop'">
      <div class="library-toolbar">
        <el-input :model-value="propKw" placeholder="搜索道具" clearable style="width: 200px" @input="onKeywordInput('prop', $event)" />
        <el-button size="small" @click="$emit('open-import', 'prop')">从素材库导入</el-button>
      </div>
      <div v-loading="propLoading" class="library-list">
        <div v-for="item in propList" :key="item.id" class="library-item">
          <div class="library-item-cover" @click="$emit('preview', assetImageUrl(item))">
            <img v-if="item.image_url || item.local_path" :src="assetImageUrl(item)" alt="" />
            <span v-else class="library-placeholder">暂无图</span>
          </div>
          <div class="library-item-info">
            <div class="library-item-name">{{ item.name || '未命名' }}</div>
            <div class="library-item-desc">{{ (item.description || item.prompt || '').slice(0, 60) }}</div>
            <div class="library-item-actions">
              <el-button size="small" @click="$emit('edit-prop', item)">编辑</el-button>
              <el-button v-if="canManageLibrary(item)" size="small" type="danger" plain @click="$emit('delete-prop', item)">删除</el-button>
            </div>
          </div>
        </div>
        <div v-if="!propLoading && propList.length === 0" class="library-empty">暂无本剧道具库记录，可在制作页面「加入本剧库」</div>
      </div>
      <div class="library-pagination">
        <el-pagination
          :current-page="propPage"
          :page-size="propPageSize"
          :total="propTotal"
          :page-sizes="[10,20,50]"
          layout="total, sizes, prev, pager, next"
          @current-change="onPageChange('prop', $event)"
          @size-change="onPageSizeChange('prop', $event)"
        />
      </div>
    </template>

    <template v-if="activeTab === 'drama-char'">
      <div v-loading="dramaCharLoading" class="drama-res-list">
        <template v-if="dramaCharacters.length">
          <div v-for="item in dramaCharacters" :key="item.id" class="drama-res-item">
            <div class="drama-res-cover" @click="$emit('preview', assetImageUrl(item))">
              <img v-if="item.image_url || item.local_path" :src="assetImageUrl(item)" alt="" />
              <span v-else class="library-placeholder">暂无图</span>
            </div>
            <div class="drama-res-info">
              <div class="drama-res-name">{{ item.name || '未命名' }}</div>
              <div v-if="item.role" class="drama-res-meta">
                <el-tag size="small" type="info">{{ item.role === 'main' ? '主角' : item.role === 'supporting' ? '配角' : item.role }}</el-tag>
              </div>
              <div class="drama-res-desc">{{ (item.description || item.prompt || '').slice(0, 80) }}</div>
              <div class="drama-res-actions">
                <el-button size="small" @click="$emit('edit-drama-char', item)">编辑</el-button>
              </div>
            </div>
          </div>
        </template>
        <div v-else class="library-empty">本剧暂无制作角色，请前往剧集制作页面创建</div>
      </div>
    </template>

    <template v-if="activeTab === 'drama-scene'">
      <div v-loading="dramaSceneLoading" class="drama-res-list">
        <template v-if="dramaScenes.length">
          <div v-for="item in dramaScenes" :key="item.id" class="drama-res-item">
            <div class="drama-res-cover" @click="$emit('preview', assetImageUrl(item))">
              <img v-if="item.image_url || item.local_path" :src="assetImageUrl(item)" alt="" />
              <span v-else class="library-placeholder">暂无图</span>
            </div>
            <div class="drama-res-info">
              <div class="drama-res-name">{{ item.location || '未命名' }}</div>
              <div v-if="item.time" class="drama-res-meta">
                <el-tag size="small" type="info">{{ item.time }}</el-tag>
              </div>
              <div class="drama-res-desc">{{ (item.description || item.prompt || '').slice(0, 80) }}</div>
              <div class="drama-res-actions">
                <el-button size="small" @click="$emit('edit-drama-scene', item)">编辑</el-button>
              </div>
            </div>
          </div>
        </template>
        <div v-else class="library-empty">本剧暂无制作场景，请前往剧集制作页面创建</div>
      </div>
    </template>

    <template v-if="activeTab === 'drama-prop'">
      <div v-loading="dramaPropLoading" class="drama-res-list">
        <template v-if="dramaProps.length">
          <div v-for="item in dramaProps" :key="item.id" class="drama-res-item">
            <div class="drama-res-cover" @click="$emit('preview', assetImageUrl(item))">
              <img v-if="item.image_url || item.local_path" :src="assetImageUrl(item)" alt="" />
              <span v-else class="library-placeholder">暂无图</span>
            </div>
            <div class="drama-res-info">
              <div class="drama-res-name">{{ item.name || '未命名' }}</div>
              <div v-if="item.type" class="drama-res-meta">
                <el-tag size="small" type="info">{{ item.type }}</el-tag>
              </div>
              <div class="drama-res-desc">{{ (item.description || item.prompt || '').slice(0, 80) }}</div>
              <div class="drama-res-actions">
                <el-button size="small" @click="$emit('edit-drama-prop', item)">编辑</el-button>
              </div>
            </div>
          </div>
        </template>
        <div v-else class="library-empty">本剧暂无制作道具，请前往剧集制作页面创建</div>
      </div>
    </template>
  </section>
</template>

<script setup>
const libraryTabs = [
  { v: 'lib-char', label: '角色' },
  { v: 'lib-scene', label: '场景' },
  { v: 'lib-prop', label: '道具' },
]
const dramaTabs = [
  { v: 'drama-char', label: '角色' },
  { v: 'drama-scene', label: '场景' },
  { v: 'drama-prop', label: '道具' },
]

const props = defineProps({
  activeTab: { type: String, default: 'lib-char' },
  assetImageUrl: { type: Function, required: true },
  canManageLibrary: { type: Function, required: true },
  charList: { type: Array, default: () => [] },
  charLoading: { type: Boolean, default: false },
  charPage: { type: Number, default: 1 },
  charPageSize: { type: Number, default: 20 },
  charTotal: { type: Number, default: 0 },
  charKw: { type: String, default: '' },
  sceneList: { type: Array, default: () => [] },
  sceneLoading: { type: Boolean, default: false },
  scenePage: { type: Number, default: 1 },
  scenePageSize: { type: Number, default: 20 },
  sceneTotal: { type: Number, default: 0 },
  sceneKw: { type: String, default: '' },
  propList: { type: Array, default: () => [] },
  propLoading: { type: Boolean, default: false },
  propPage: { type: Number, default: 1 },
  propPageSize: { type: Number, default: 20 },
  propTotal: { type: Number, default: 0 },
  propKw: { type: String, default: '' },
  dramaCharacters: { type: Array, default: () => [] },
  dramaScenes: { type: Array, default: () => [] },
  dramaProps: { type: Array, default: () => [] },
  dramaCharLoading: { type: Boolean, default: false },
  dramaSceneLoading: { type: Boolean, default: false },
  dramaPropLoading: { type: Boolean, default: false },
})

const emit = defineEmits([
  'update:activeTab',
  'update:charKw',
  'update:charPage',
  'update:charPageSize',
  'update:sceneKw',
  'update:scenePage',
  'update:scenePageSize',
  'update:propKw',
  'update:propPage',
  'update:propPageSize',
  'char-kw-input',
  'scene-kw-input',
  'prop-kw-input',
  'load-char-list',
  'load-scene-list',
  'load-prop-list',
  'open-import',
  'preview',
  'edit-char',
  'delete-char',
  'edit-scene',
  'delete-scene',
  'edit-prop',
  'delete-prop',
  'edit-drama-char',
  'edit-drama-scene',
  'edit-drama-prop',
])

function setTab(tab) {
  emit('update:activeTab', tab)
}

function onKeywordInput(type, value) {
  emit(`update:${type}Kw`, value)
  emit(`${type}-kw-input`)
}

function onPageChange(type, value) {
  emit(`update:${type}Page`, value)
  emit(`load-${type}-list`)
}

function onPageSizeChange(type, value) {
  emit(`update:${type}PageSize`, value)
  emit(`load-${type}-list`)
}
</script>
