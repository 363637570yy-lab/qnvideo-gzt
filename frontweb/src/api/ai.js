import request from '@/utils/request'

export const aiAPI = {
  list(serviceType) {
    return request.get('/ai-configs', { params: serviceType ? { service_type: serviceType } : {} })
  },
  active(serviceType) {
    return request.get('/runtime/ai-configs/active', { params: serviceType ? { service_type: serviceType } : {} })
  },
  runtimeList(serviceType) {
    return request.get('/runtime/ai-configs', { params: serviceType ? { service_type: serviceType } : {} })
  },
  runtimeRoutes() {
    return request.get('/runtime/model-routes')
  },
  routingPolicies() {
    return request.get('/ai-configs/routing-policies')
  },
  updateRoutingPolicy(serviceType, body) {
    return request.put(`/ai-configs/routing-policies/${serviceType}`, body)
  },
  get(id) {
    return request.get(`/ai-configs/${id}`)
  },
  create(body) {
    return request.post('/ai-configs', body)
  },
  update(id, body) {
    return request.put(`/ai-configs/${id}`, body)
  },
  reorder(ids) {
    return request.put('/ai-configs/reorder', { ids })
  },
  delete(id) {
    return request.delete(`/ai-configs/${id}`)
  },
  testConnection(body) {
    return request.post('/ai-configs/test', body)
  },
  /** 即梦2角色认证：GET /api/business/v1/assets（body: base_url, api_key, limit?, cursor?） */
  listJimeng2MaterialAssets(body) {
    return request.post('/ai-configs/jimeng2-list-assets', body)
  },
  /** ModelArk 私有资产库：action + payload，见 AI 配置页 SD2 资产管理 */
  modelArkAsset(body) {
    return request.post('/ai-configs/model-ark-asset', body)
  },
  getVendorLock() {
    return request.get('/ai-configs/vendor-lock')
  },
  bulkUpdateKey(apiKey) {
    return request.put('/ai-configs/bulk-update-key', { api_key: apiKey })
  }
}
