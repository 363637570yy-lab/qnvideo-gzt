import request from '@/utils/request'

export const taskAPI = {
  get(taskId) {
    return request.get(`/tasks/${taskId}`)
  },
  listByResource(resourceId) {
    return request.get('/tasks', { params: { resource_id: String(resourceId) } })
  },
  listByResources(resourceIds) {
    const ids = (resourceIds || []).map((id) => String(id)).filter(Boolean)
    if (ids.length === 0) return Promise.resolve([])
    return request.get('/tasks', { params: { resource_ids: ids.join(',') } })
  },
}
