import axios from 'axios'
import { ElMessage } from 'element-plus'
import { clearAuth, getToken } from './auth'
import { normalizeAiFriendlyMessage } from './aiFriendlyErrors'

const request = axios.create({
  baseURL: '/api/v1',
  timeout: 600000,
  headers: { 'Content-Type': 'application/json' }
})

let lastErrorToast = { key: '', at: 0 }

function shouldShowErrorToast(key) {
  const now = Date.now()
  if (lastErrorToast.key === key && now - lastErrorToast.at < 2500) return false
  lastErrorToast = { key, at: now }
  return true
}

request.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

request.interceptors.response.use(
  (response) => {
    // blob 类型直接返回原始数据，不做 JSON 解包
    if (response.config?.responseType === 'blob') {
      return response.data
    }
    const res = response.data
    if (res.success !== false) {
      return res.data !== undefined ? res.data : res
    }
    return Promise.reject(new Error(res.error?.message || '请求失败'))
  },
  (error) => {
    if (error.response?.status === 401) {
      clearAuth()
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    // 提取后端实际错误信息（优先 API 返回的 message，而非 axios 通用 "status code 500"）
    const backendMsg = error.response?.data?.error?.message
    let msg = normalizeAiFriendlyMessage(backendMsg || error.message || '网络错误')
    if (error.response?.status === 403 && msg.includes('只能访问自己账号下的视频项目')) {
      msg = '当前登录账号不是该项目所有人，也不是管理员；请切换账号或从项目列表重新进入'
    }
    const toastKey = `${error.response?.status || 'NET'}:${msg}`
    if (shouldShowErrorToast(toastKey)) ElMessage.error(msg)
    // 将真实错误信息写回 message，使组件 catch 块可直接用 e.message 获取可读内容
    error.message = msg
    return Promise.reject(error)
  }
)

export default request
