import { createRouter, createWebHistory } from 'vue-router'

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

router.beforeEach((to) => {
  const token = localStorage.getItem('qnvideo_auth_token')
  let user = null
  try { user = JSON.parse(localStorage.getItem('qnvideo_auth_user') || 'null') } catch (_) {}
  if (!to.meta.public && !token) {
    return { name: 'login', query: { redirect: to.fullPath } }
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
