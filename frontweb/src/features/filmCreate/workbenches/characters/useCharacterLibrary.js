import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { characterAPI } from '@/api/characters'
import { characterLibraryAPI } from '@/api/characterLibrary'
import { dramaAPI } from '@/api/drama'

export function useCharacterLibrary(options = {}) {
  const {
    store,
    dramaId,
    currentEpisodeId,
    isAdminUser,
    canManageLibrary,
    hasAssetImage = () => false,
    loadDrama = async () => {},
  } = options

  const showCharLibrary = ref(false)
  const charLibraryList = ref([])
  const charLibraryLoading = ref(false)
  const charLibraryPage = ref(1)
  const charLibraryPageSize = ref(20)
  const charLibraryTotal = ref(0)
  const charLibraryKeyword = ref('')
  const showEditCharLibrary = ref(false)
  const editCharLibraryForm = ref(null)
  const editCharLibrarySaving = ref(false)
  const addingCharToLibraryId = ref(null)
  const addingCharToMaterialId = ref(null)
  const addingCharFromLibraryId = ref(null)
  let charLibraryKeywordTimer = null

  const charLibraryTab = ref('library')
  const dramaAllCharList = ref([])
  const dramaAllCharLoading = ref(false)
  const dramaAllCharPage = ref(1)
  const dramaAllCharPageSize = ref(20)
  const dramaAllCharTotal = ref(0)
  const dramaAllCharKeyword = ref('')
  let dramaAllCharKeywordTimer = null

  async function loadCharLibraryList() {
    charLibraryLoading.value = true
    try {
      const res = await characterLibraryAPI.list({
        drama_id: dramaId.value,
        page: charLibraryPage.value,
        page_size: charLibraryPageSize.value,
        keyword: charLibraryKeyword.value || undefined,
      })
      charLibraryList.value = res?.items ?? []
      const pagination = res?.pagination ?? {}
      charLibraryTotal.value = pagination.total ?? 0
      if (pagination.page != null) charLibraryPage.value = pagination.page
      if (pagination.page_size != null) charLibraryPageSize.value = pagination.page_size
    } catch (e) {
      charLibraryList.value = []
    } finally {
      charLibraryLoading.value = false
    }
  }

  function debouncedLoadCharLibrary() {
    if (charLibraryKeywordTimer) clearTimeout(charLibraryKeywordTimer)
    charLibraryKeywordTimer = setTimeout(() => {
      charLibraryPage.value = 1
      loadCharLibraryList()
    }, 300)
  }

  async function loadDramaAllCharList() {
    if (!dramaId.value) {
      dramaAllCharList.value = []
      dramaAllCharTotal.value = 0
      return
    }
    dramaAllCharLoading.value = true
    try {
      const res = await dramaAPI.getCharacters(dramaId.value)
      let list = Array.isArray(res) ? res : (res?.characters ?? res?.items ?? [])
      const kw = (dramaAllCharKeyword.value || '').trim().toLowerCase()
      if (kw) {
        list = list.filter((c) => {
          const name = (c.name || '').toLowerCase()
          const desc = (c.description || '').toLowerCase()
          const app = (c.appearance || '').toLowerCase()
          return name.includes(kw) || desc.includes(kw) || app.includes(kw)
        })
      }
      dramaAllCharTotal.value = list.length
      const start = (dramaAllCharPage.value - 1) * dramaAllCharPageSize.value
      dramaAllCharList.value = list.slice(start, start + dramaAllCharPageSize.value)
    } catch {
      dramaAllCharList.value = []
      dramaAllCharTotal.value = 0
    } finally {
      dramaAllCharLoading.value = false
    }
  }

  function debouncedLoadDramaAllCharList() {
    if (dramaAllCharKeywordTimer) clearTimeout(dramaAllCharKeywordTimer)
    dramaAllCharKeywordTimer = setTimeout(() => {
      dramaAllCharPage.value = 1
      loadDramaAllCharList()
    }, 300)
  }

  function onCharLibraryDialogOpen() {
    if (charLibraryTab.value === 'library') loadCharLibraryList()
    else if (charLibraryTab.value === 'drama') loadDramaAllCharList()
  }

  function onCharLibraryTabChange() {
    if (charLibraryTab.value === 'library') {
      charLibraryPage.value = 1
      loadCharLibraryList()
    } else if (charLibraryTab.value === 'drama') {
      dramaAllCharPage.value = 1
      loadDramaAllCharList()
    }
  }

  function charAddToEpisodeLoadingKey(scope, id) {
    return `${scope}-${id}`
  }

  function isCharAddToEpisodeLoading(scope, id) {
    return addingCharFromLibraryId.value === charAddToEpisodeLoadingKey(scope, id)
  }

  function canManageLibraryItem(item) {
    if (typeof canManageLibrary === 'function') return canManageLibrary(item)
    return !!(isAdminUser?.value ?? isAdminUser)
  }

  function openEditCharLibrary(item) {
    editCharLibraryForm.value = {
      id: item.id,
      name: item.name ?? '',
      category: item.category ?? '',
      description: item.description ?? '',
      tags: item.tags ?? '',
    }
    showEditCharLibrary.value = true
  }

  async function submitEditCharLibrary() {
    if (!editCharLibraryForm.value?.id) return
    editCharLibrarySaving.value = true
    try {
      await characterLibraryAPI.update(editCharLibraryForm.value.id, {
        name: editCharLibraryForm.value.name,
        category: editCharLibraryForm.value.category || null,
        description: editCharLibraryForm.value.description || null,
        tags: editCharLibraryForm.value.tags || null,
      })
      ElMessage.success('已保存')
      showEditCharLibrary.value = false
      loadCharLibraryList()
    } catch (e) {
      ElMessage.error(e.message || '保存失败')
    } finally {
      editCharLibrarySaving.value = false
    }
  }

  async function onDeleteCharLibrary(item) {
    if (!canManageLibraryItem(item)) {
      ElMessage.warning('只能删除自己创建的素材')
      return
    }
    try {
      await ElMessageBox.confirm(
        `确定删除公共角色「${(item.name || '未命名').slice(0, 20)}」吗？`,
        '删除确认',
        { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
      )
      await characterLibraryAPI.delete(item.id)
      ElMessage.success('已删除')
      loadCharLibraryList()
    } catch (e) {
      if (e === 'cancel') return
      ElMessage.error(e.message || '删除失败')
    }
  }

  async function onAddCharacterToLibrary(char) {
    if (!hasAssetImage(char)) {
      ElMessage.warning('请先为该角色生成或上传图片')
      return
    }
    addingCharToLibraryId.value = char.id
    try {
      await characterAPI.addToLibrary(char.id, {})
      ElMessage.success('已加入本剧角色库')
      if (showCharLibrary.value) loadCharLibraryList()
    } catch (e) {
      ElMessage.error(e.message || '加入失败')
    } finally {
      addingCharToLibraryId.value = null
    }
  }

  async function onAddCharacterToMaterialLibrary(char) {
    if (!hasAssetImage(char)) {
      ElMessage.warning('请先为该角色生成或上传图片')
      return
    }
    addingCharToMaterialId.value = char.id
    try {
      await characterAPI.addToMaterialLibrary(char.id)
      ElMessage.success('已加入全局素材库')
    } catch (e) {
      ElMessage.error(e.message || '加入失败')
    } finally {
      addingCharToMaterialId.value = null
    }
  }

  async function addCharToEpisode(item, scope) {
    if (!store.dramaId) return
    if (!currentEpisodeId.value) {
      ElMessage.warning('请先选择本集')
      return
    }
    const loadingKey = charAddToEpisodeLoadingKey(scope, item.id)
    addingCharFromLibraryId.value = loadingKey
    try {
      const existing = (store.characters || []).map((c) => ({
        id: c.id,
        name: c.name || '',
        role: c.role || undefined,
        appearance: c.appearance || undefined,
        personality: c.personality || undefined,
        description: c.description || undefined,
        image_url: c.image_url || undefined,
        local_path: c.local_path || undefined,
      }))
      const newCharacters = [...existing]
      const existingChar = newCharacters.find((c) => c.name === (item.name || '未命名'))
      if (existingChar) {
        existingChar.description = item.description || existingChar.description
        existingChar.appearance = item.appearance || existingChar.appearance
        existingChar.image_url = item.image_url || existingChar.image_url
        existingChar.local_path = item.local_path || existingChar.local_path
        if (item.role && !existingChar.role) existingChar.role = item.role
      } else {
        newCharacters.push({
          name: item.name || '未命名',
          role: item.role || undefined,
          description: item.description || undefined,
          appearance: item.appearance || undefined,
          personality: item.personality || undefined,
          image_url: item.image_url || undefined,
          local_path: item.local_path || undefined,
        })
      }
      await dramaAPI.saveCharacters(store.dramaId, {
        characters: newCharacters,
        episode_id: currentEpisodeId.value ?? undefined,
      })
      await loadDrama()
      ElMessage.success(`「${item.name || '角色'}」已加入本集`)
    } catch (e) {
      ElMessage.error(e.message || '加入失败')
    } finally {
      addingCharFromLibraryId.value = null
    }
  }

  function onAddCharFromLibrary(item) {
    return addCharToEpisode(item, 'library')
  }

  function onAddDramaCharToEpisode(item) {
    return addCharToEpisode(item, 'drama')
  }

  return {
    addingCharFromLibraryId,
    addingCharToLibraryId,
    addingCharToMaterialId,
    charLibraryKeyword,
    charLibraryList,
    charLibraryLoading,
    charLibraryPage,
    charLibraryPageSize,
    charLibraryTab,
    charLibraryTotal,
    debouncedLoadCharLibrary,
    debouncedLoadDramaAllCharList,
    dramaAllCharKeyword,
    dramaAllCharList,
    dramaAllCharLoading,
    dramaAllCharPage,
    dramaAllCharPageSize,
    dramaAllCharTotal,
    editCharLibraryForm,
    editCharLibrarySaving,
    isCharAddToEpisodeLoading,
    loadCharLibraryList,
    loadDramaAllCharList,
    onAddCharacterToLibrary,
    onAddCharacterToMaterialLibrary,
    onAddCharFromLibrary,
    onAddDramaCharToEpisode,
    onCharLibraryDialogOpen,
    onCharLibraryTabChange,
    onDeleteCharLibrary,
    openEditCharLibrary,
    showCharLibrary,
    showEditCharLibrary,
    submitEditCharLibrary,
  }
}
