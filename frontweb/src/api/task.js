import request from '@/utils/request'

export const taskAPI = {
  get(taskId) {
    return request.get(`/tasks/${taskId}`)
  },
  cancel(taskId, message = '任务已停止') {
    return request.post(`/tasks/${taskId}/cancel`, { message })
  },
  delete(taskId) {
    return request.delete(`/tasks/${taskId}`)
  },
  listByResource(resourceId, params = {}) {
    return request.get('/tasks', { params: { ...params, resource_id: String(resourceId) } })
  },
  listByResources(resourceIds, params = {}) {
    const ids = (resourceIds || []).map((id) => String(id)).filter(Boolean)
    if (ids.length === 0) return Promise.resolve([])
    return request.get('/tasks', { params: { ...params, resource_ids: ids.join(',') } })
  },
}
