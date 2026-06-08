<template>
  <div class="account-menu">
    <el-dropdown trigger="click" @command="handleCommand">
      <el-button class="account-menu-button">
        <el-icon><User /></el-icon>
        <span class="account-menu-name">{{ userLabel }}</span>
        <el-icon class="account-menu-arrow"><ArrowDown /></el-icon>
      </el-button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="password">修改密码</el-dropdown-item>
          <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <el-dialog v-model="passwordVisible" title="修改密码" width="420px" destroy-on-close>
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="当前密码">
          <el-input v-model="passwordForm.old_password" type="password" show-password autocomplete="current-password" />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="passwordForm.new_password" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <el-form-item label="确认新密码">
          <el-input v-model="passwordForm.confirm_password" type="password" show-password autocomplete="new-password" @keyup.enter="submitPassword" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="passwordVisible = false">取消</el-button>
        <el-button type="primary" :loading="passwordSaving" @click="submitPassword">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowDown, User } from '@element-plus/icons-vue'
import { authAPI } from '@/api/auth'
import { clearAuth, getCurrentUser } from '@/utils/auth'
import { useGenerationTaskStore } from '@/stores/generationTaskStore'

const props = defineProps({
  user: {
    type: Object,
    default: null,
  },
})

const router = useRouter()
const genStore = useGenerationTaskStore()
const passwordVisible = ref(false)
const passwordSaving = ref(false)
const passwordForm = reactive({
  old_password: '',
  new_password: '',
  confirm_password: '',
})

const currentUser = computed(() => props.user || getCurrentUser() || {})
const userLabel = computed(() => currentUser.value.display_name || currentUser.value.username || '账号')

function resetPasswordForm() {
  passwordForm.old_password = ''
  passwordForm.new_password = ''
  passwordForm.confirm_password = ''
}

function logout() {
  genStore.clearSessionTasks('退出登录')
  clearAuth()
  router.push('/login')
}

function handleCommand(command) {
  if (command === 'password') {
    resetPasswordForm()
    passwordVisible.value = true
  } else if (command === 'logout') {
    logout()
  }
}

async function submitPassword() {
  if (!passwordForm.old_password) {
    ElMessage.warning('请输入当前密码')
    return
  }
  if (!passwordForm.new_password || passwordForm.new_password.length < 6) {
    ElMessage.warning('新密码至少 6 位')
    return
  }
  if (passwordForm.new_password !== passwordForm.confirm_password) {
    ElMessage.warning('两次输入的新密码不一致')
    return
  }
  passwordSaving.value = true
  try {
    await authAPI.changePassword({
      old_password: passwordForm.old_password,
      new_password: passwordForm.new_password,
    })
    ElMessage.success('密码已修改')
    passwordVisible.value = false
    resetPasswordForm()
  } finally {
    passwordSaving.value = false
  }
}
</script>

<style scoped>
.account-menu {
  display: inline-flex;
  align-items: center;
}
.account-menu-button {
  max-width: 168px;
  --el-button-bg-color: rgba(99, 102, 241, 0.08);
  --el-button-border-color: rgba(99, 102, 241, 0.24);
  --el-button-text-color: #a5b4fc;
  --el-button-hover-bg-color: rgba(99, 102, 241, 0.16);
  --el-button-hover-border-color: rgba(99, 102, 241, 0.38);
  --el-button-hover-text-color: #c4b5fd;
}
.account-menu-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.account-menu-arrow {
  margin-left: 2px;
}
html.light .account-menu-button {
  --el-button-bg-color: rgba(99, 102, 241, 0.06);
  --el-button-border-color: rgba(99, 102, 241, 0.2);
  --el-button-text-color: #4f46e5;
  --el-button-hover-bg-color: rgba(99, 102, 241, 0.12);
  --el-button-hover-border-color: rgba(99, 102, 241, 0.35);
  --el-button-hover-text-color: #4338ca;
}
</style>
