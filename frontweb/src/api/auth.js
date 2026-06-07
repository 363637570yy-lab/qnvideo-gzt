import request from '@/utils/request'

export const authAPI = {
  login(data) {
    return request.post('/auth/login', data)
  },
  me() {
    return request.get('/auth/me')
  },
  listUsers() {
    return request.get('/auth/users')
  },
  createUser(data) {
    return request.post('/auth/users', data)
  },
  updateUser(id, data) {
    return request.put(`/auth/users/${id}`, data)
  }
}
