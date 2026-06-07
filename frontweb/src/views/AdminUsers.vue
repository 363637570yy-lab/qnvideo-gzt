<template>
  <div class="users-page">
    <header class="page-header">
      <div>
        <h1>用户管理</h1>
        <p>管理员可创建账号并控制普通用户访问权限。</p>
      </div>
      <el-button @click="$router.push('/')">返回项目</el-button>
    </header>

    <section class="create-panel">
      <el-form :inline="true" :model="form">
        <el-form-item label="账号">
          <el-input v-model="form.username" placeholder="用户名" />
        </el-form-item>
        <el-form-item label="姓名">
          <el-input v-model="form.display_name" placeholder="显示名称" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" show-password placeholder="至少 6 位" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.role" style="width: 120px">
            <el-option label="普通用户" value="user" />
            <el-option label="管理员" value="admin" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="creating" @click="createUser">创建用户</el-button>
        </el-form-item>
      </el-form>
    </section>

    <el-table v-loading="loading" :data="users" class="users-table">
      <el-table-column prop="username" label="账号" min-width="140" />
      <el-table-column prop="display_name" label="显示名称" min-width="140" />
      <el-table-column label="角色" width="120">
        <template #default="{ row }">
          <el-tag :type="row.role === 'admin' ? 'danger' : 'info'">{{ row.role === 'admin' ? '管理员' : '普通用户' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="120">
        <template #default="{ row }">
          <el-switch v-model="row.is_active" :loading="row.saving" @change="toggleActive(row)" />
        </template>
      </el-table-column>
      <el-table-column prop="last_login_at" label="最后登录" min-width="180" />
    </el-table>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { authAPI } from '@/api/auth'

const users = ref([])
const loading = ref(false)
const creating = ref(false)
const form = reactive({ username: '', display_name: '', password: '', role: 'user' })

async function loadUsers() {
  loading.value = true
  try {
    users.value = await authAPI.listUsers()
  } finally {
    loading.value = false
  }
}

async function createUser() {
  creating.value = true
  try {
    await authAPI.createUser({ ...form })
    ElMessage.success('用户已创建')
    form.username = ''
    form.display_name = ''
    form.password = ''
    form.role = 'user'
    await loadUsers()
  } finally {
    creating.value = false
  }
}

async function toggleActive(row) {
  row.saving = true
  try {
    await authAPI.updateUser(row.id, { is_active: row.is_active })
    ElMessage.success('状态已更新')
  } finally {
    row.saving = false
  }
}

onMounted(loadUsers)
</script>

<style scoped>
.users-page {
  min-height: 100vh;
  background: #f5f7fb;
  padding: 24px;
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}
.page-header h1 {
  margin: 0;
  font-size: 24px;
}
.page-header p {
  margin: 6px 0 0;
  color: #64748b;
}
.create-panel,
.users-table {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
}
.users-table {
  margin-top: 16px;
}
</style>
