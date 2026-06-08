import request from '@/utils/request'

export const workflowPresetAPI = {
  list(params = {}) {
    return request.get('/workflow-presets', { params })
  },
  get(id) {
    return request.get(`/workflow-presets/${id}`)
  },
  create(data) {
    return request.post('/workflow-presets', data)
  },
  update(id, data) {
    return request.put(`/workflow-presets/${id}`, data)
  },
  setDefault(id) {
    return request.put(`/workflow-presets/${id}/default`, {})
  },
  delete(id) {
    return request.delete(`/workflow-presets/${id}`)
  },
}
