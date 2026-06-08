<template>
  <el-dialog
    v-model="visible"
    title="工作流规范配置"
    width="86%"
    destroy-on-close
    class="workflow-preset-dialog"
    @open="load"
  >
    <div class="workflow-toolbar">
      <el-tabs v-model="activeType" class="workflow-tabs" @tab-change="onTypeChange">
        <el-tab-pane
          v-for="type in presetTypes"
          :key="type.key"
          :label="type.label"
          :name="type.key"
        />
      </el-tabs>
      <el-button type="primary" size="small" @click="openCreate">
        <el-icon><Plus /></el-icon>
        新建规范
      </el-button>
    </div>

    <el-table :data="currentItems" v-loading="loading" border stripe height="520">
      <el-table-column label="默认" width="72" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.is_default" type="success" size="small">默认</el-tag>
          <el-button v-else link type="primary" size="small" @click="setDefault(row)">设默认</el-button>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="规范名称" min-width="150" show-overflow-tooltip />
      <el-table-column prop="mode" label="模式" min-width="140" show-overflow-tooltip />
      <el-table-column prop="description" label="用途" min-width="260" show-overflow-tooltip />
      <el-table-column label="启用" width="86" align="center">
        <template #default="{ row }">
          <el-switch
            :model-value="row.is_active"
            :disabled="row.is_default"
            @change="(value) => toggleActive(row, value)"
          />
        </template>
      </el-table-column>
      <el-table-column label="排序" width="84" align="center">
        <template #default="{ row }">{{ row.sort_order }}</template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" size="small" :disabled="row.is_default" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="showEditor"
      :title="form.id ? '编辑规范' : '新建规范'"
      width="720px"
      append-to-body
      destroy-on-close
    >
      <el-form label-width="96px" :model="form">
        <el-form-item label="类型">
          <el-select v-model="form.preset_type" style="width: 100%" :disabled="!!form.id">
            <el-option v-for="type in presetTypes" :key="type.key" :label="type.label" :value="type.key" />
          </el-select>
        </el-form-item>
        <el-form-item label="名称">
          <el-input v-model="form.name" maxlength="80" show-word-limit />
        </el-form-item>
        <el-form-item label="模式">
          <el-input v-model="form.mode" maxlength="80" />
        </el-form-item>
        <el-form-item label="用途">
          <el-input v-model="form.description" type="textarea" :rows="2" maxlength="300" show-word-limit />
        </el-form-item>
        <el-form-item label="专业提示词">
          <el-input v-model="form.prompt_template" type="textarea" :rows="6" />
        </el-form-item>
        <el-form-item label="负面词">
          <el-input v-model="form.negative_prompt_template" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="参数 JSON">
          <el-input v-model="optionsText" type="textarea" :rows="5" spellcheck="false" />
        </el-form-item>
        <el-form-item label="状态">
          <el-checkbox v-model="form.is_active">启用</el-checkbox>
          <el-checkbox v-model="form.is_default">设为默认</el-checkbox>
          <el-input-number v-model="form.sort_order" :min="0" :step="10" size="small" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditor = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { workflowPresetAPI } from '@/api/workflowPresets'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'changed'])

const presetTypes = [
  { key: 'character', label: '人物生成规范' },
  { key: 'scene', label: '场景生成规范' },
  { key: 'prop', label: '道具生成规范' },
  { key: 'storyboard', label: '分镜生成规范' },
]

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const activeType = ref('character')
const loading = ref(false)
const saving = ref(false)
const items = ref([])
const showEditor = ref(false)
const optionsText = ref('{}')
const form = reactive({
  id: null,
  preset_type: 'character',
  name: '',
  description: '',
  mode: '',
  prompt_template: '',
  negative_prompt_template: '',
  options: {},
  is_active: true,
  is_default: false,
  sort_order: 0,
})

const currentItems = computed(() => items.value.filter((item) => item.preset_type === activeType.value))

watch(showEditor, (open) => {
  if (!open) optionsText.value = '{}'
})

async function load() {
  loading.value = true
  try {
    const res = await workflowPresetAPI.list()
    items.value = res?.items || []
  } catch (err) {
    ElMessage.error(err.message || '加载工作流规范失败')
  } finally {
    loading.value = false
  }
}

function onTypeChange() {
  if (!items.value.length) load()
}

function resetForm(type = activeType.value) {
  Object.assign(form, {
    id: null,
    preset_type: type,
    name: '',
    description: '',
    mode: `${type}_custom`,
    prompt_template: '',
    negative_prompt_template: '',
    options: {},
    is_active: true,
    is_default: false,
    sort_order: ((currentItems.value.at(-1)?.sort_order || 0) + 10),
  })
  optionsText.value = '{}'
}

function openCreate() {
  resetForm()
  showEditor.value = true
}

function openEdit(row) {
  Object.assign(form, {
    id: row.id,
    preset_type: row.preset_type,
    name: row.name || '',
    description: row.description || '',
    mode: row.mode || '',
    prompt_template: row.prompt_template || '',
    negative_prompt_template: row.negative_prompt_template || '',
    options: row.options || {},
    is_active: !!row.is_active,
    is_default: !!row.is_default,
    sort_order: row.sort_order || 0,
  })
  optionsText.value = JSON.stringify(row.options || {}, null, 2)
  showEditor.value = true
}

function buildPayload() {
  let options = {}
  try {
    options = optionsText.value?.trim() ? JSON.parse(optionsText.value) : {}
  } catch (_) {
    throw new Error('参数 JSON 格式不正确')
  }
  return {
    preset_type: form.preset_type,
    name: form.name,
    description: form.description,
    mode: form.mode,
    prompt_template: form.prompt_template,
    negative_prompt_template: form.negative_prompt_template,
    options,
    is_active: form.is_active,
    is_default: form.is_default,
    sort_order: form.sort_order,
  }
}

async function save() {
  saving.value = true
  try {
    const payload = buildPayload()
    if (form.id) await workflowPresetAPI.update(form.id, payload)
    else await workflowPresetAPI.create(payload)
    ElMessage.success('已保存')
    showEditor.value = false
    await load()
    emit('changed')
  } catch (err) {
    ElMessage.error(err.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function toggleActive(row, value) {
  try {
    await workflowPresetAPI.update(row.id, { ...row, is_active: value })
    await load()
    emit('changed')
  } catch (err) {
    ElMessage.error(err.message || '保存失败')
  }
}

async function setDefault(row) {
  try {
    await workflowPresetAPI.setDefault(row.id)
    await load()
    emit('changed')
    ElMessage.success('默认规范已更新')
  } catch (err) {
    ElMessage.error(err.message || '设置失败')
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确定删除「${row.name}」吗？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    await workflowPresetAPI.delete(row.id)
    await load()
    emit('changed')
    ElMessage.success('已删除')
  } catch (err) {
    if (err === 'cancel') return
    ElMessage.error(err.message || '删除失败')
  }
}
</script>

<style scoped>
.workflow-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}
.workflow-tabs {
  flex: 1;
  min-width: 0;
}
.workflow-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}
</style>
