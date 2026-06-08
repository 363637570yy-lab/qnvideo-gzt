const TOKEN_KEY = 'qnvideo_auth_token'
const USER_KEY = 'qnvideo_auth_user'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setAuth(token, user) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function setCurrentUser(user) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null')
  } catch (_) {
    return null
  }
}

export function isAdmin() {
  return getCurrentUser()?.role === 'admin'
}
