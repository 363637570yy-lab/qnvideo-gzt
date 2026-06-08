import request from '@/utils/request'

export const imagesAPI = {
  list(params) {
    return request.get('/images', { params: params || {} })
  },
  create(data) {
    return request.post('/images', data)
  },
  upload(data) {
    return request.post('/images/upload', data)
  },
  update(id, data) {
    return request.put(`/images/${id}`, data)
  },
  delete(id) {
    return request.delete(`/images/${id}`)
  }
}
