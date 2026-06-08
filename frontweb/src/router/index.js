import { createRouter, createWebHistory } from 'vue-router'
import { authAPI } from '@/api/auth'
import { clearAuth, getCurrentUser, getToken, setCurrentUser } from '@/utils/auth'
import { useGenerationTaskStore } from '@/stores/generationTaskStore'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/Login.vue'),
      meta: { title: '登录', public: true }
    },
    {
      path: '/',
      name: 'list',
      component: () => import('@/views/FilmList.vue'),
      meta: { title: '项目列表' }
    },
    {
      path: '/drama/:id',
      name: 'drama-detail',
      component: () => import('@/views/DramaDetail.vue'),
      meta: { title: '剧集管理' }
    },
    {
      path: '/film/:id',
      name: 'film',
      component: () => import('@/views/FilmCreate.vue'),
      meta: { title: 'AI 视频生成' }
    },
    {
      path: '/ai-config',
      name: 'ai-config',
      component: () => import('@/views/AiConfig.vue'),
      meta: { title: 'AI 配置', admin: true }
    },
    {
      path: '/admin/users',
      name: 'admin-users',
      component: () => import('@/views/AdminUsers.vue'),
      meta: { title: '用户管理', admin: true }
    },
    {
      path: '/free-create',
      name: 'free-create',
      component: () => import('@/views/FreeCreate.vue'),
      meta: { title: '自由创作' }
    },
    {
      path: '/media-library',
      name: 'media-library',
      component: () => import('@/views/MediaLibrary.vue'),
      meta: { title: '媒体素材库' }
    }
  ]
})

let userRefreshPromise = null

async function refreshCurrentUser() {
  if (!userRefreshPromise) {
    userRefreshPromise = authAPI.me()
      .then((res) => {
        const user = res?.user || res
        if (user) setCurrentUser(user)
        return user
      })
      .finally(() => {
        userRefreshPromise = null
      })
  }
  return userRefreshPromise
}

router.beforeEach(async (to) => {
  const token = getToken()
  let user = getCurrentUser()
  if (!to.meta.public && !token) {
    useGenerationTaskStore().clearSessionTasks('未登录')
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (!to.meta.public && token) {
    const beforeUserId = user?.id || ''
    try {
      user = await refreshCurrentUser()
      const nextUserId = user?.id || ''
      if (beforeUserId && nextUserId && beforeUserId !== nextUserId) {
        useGenerationTaskStore().clearSessionTasks('账号已切换')
      }
    } catch (_) {
      useGenerationTaskStore().clearSessionTasks('登录状态失效')
      clearAuth()
      return { name: 'login', query: { redirect: to.fullPath } }
    }
  }
  if (to.meta.admin && user?.role !== 'admin') {
    return { name: 'list' }
  }
  if (to.meta.title) {
    document.title = `${to.meta.title} - 芊柠AI视频工作台`
  }
  return true
})

export default router
