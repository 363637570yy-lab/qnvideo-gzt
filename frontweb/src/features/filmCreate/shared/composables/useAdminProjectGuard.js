import { computed, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { getCurrentUser, isAdmin } from '@/utils/auth'

export function useAdminProjectGuard({ store }) {
  const currentUser = ref(getCurrentUser())
  const isAdminUser = ref(isAdmin())

  const projectOwnerLabel = computed(() => {
    const owner = store.drama?.owner_user || store.drama?.created_by_user || {}
    return owner.display_name || owner.username || store.drama?.owner_user_id || '未知用户'
  })

  const isAdminViewingOtherProject = computed(() => {
    const ownerId = store.drama?.owner_user_id
    const userId = currentUser.value?.id
    return !!(isAdminUser.value && ownerId && userId && String(ownerId) !== String(userId))
  })

  async function confirmAdminProjectOperation(action = '继续操作') {
    if (!isAdminViewingOtherProject.value) return true
    try {
      await ElMessageBox.confirm(
        `你正在操作「${projectOwnerLabel.value}」的项目。确认要${action}吗？`,
        '管理员操作确认',
        { type: 'warning', confirmButtonText: '确认操作', cancelButtonText: '取消' }
      )
      return true
    } catch {
      return false
    }
  }

  function canManageLibrary(item) {
    return !!item?.can_manage || isAdminUser.value || (!!item?.created_by_user_id && String(item.created_by_user_id) === String(currentUser.value?.id))
  }

  return {
    canManageLibrary,
    confirmAdminProjectOperation,
    currentUser,
    isAdminUser,
    isAdminViewingOtherProject,
    projectOwnerLabel,
  }
}
