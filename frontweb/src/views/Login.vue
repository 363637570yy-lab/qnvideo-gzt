<template>
  <main class="login-page">
    <section class="login-panel">
      <div>
        <p class="eyebrow">芊柠AI视频工作台</p>
        <h1>登录</h1>
      </div>
      <el-form :model="form" label-position="top" @submit.prevent>
        <el-form-item label="账号">
          <el-input v-model="form.username" size="large" autocomplete="username" placeholder="admin" @keyup.enter="submit" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" size="large" type="password" autocomplete="current-password" show-password placeholder="请输入密码" @keyup.enter="submit" />
        </el-form-item>
        <el-button type="primary" size="large" class="login-btn" :loading="loading" @click="submit">登录</el-button>
      </el-form>
    </section>
  </main>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { authAPI } from '@/api/auth'
import { setAuth } from '@/utils/auth'

const router = useRouter()
const route = useRoute()
const loading = ref(false)
const form = reactive({ username: 'admin', password: '' })

async function submit() {
  if (!form.username || !form.password) {
    ElMessage.warning('请输入账号和密码')
    return
  }
  loading.value = true
  try {
    const res = await authAPI.login({ username: form.username.trim(), password: form.password })
    setAuth(res.token, res.user)
    ElMessage.success('登录成功')
    router.replace(route.query.redirect || '/')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #f5f7fb;
  padding: 24px;
}
.login-panel {
  width: min(420px, 100%);
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 32px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
}
.eyebrow {
  margin: 0 0 6px;
  color: #64748b;
  font-size: 14px;
}
h1 {
  margin: 0 0 24px;
  font-size: 28px;
}
.login-btn {
  width: 100%;
  margin-top: 8px;
}
</style>
