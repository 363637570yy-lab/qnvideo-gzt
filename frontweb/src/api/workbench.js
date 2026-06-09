import request from '@/utils/request'

export const workbenchAPI = {
  summary(dramaId) {
    return request.get(`/workbench/projects/${dramaId}/summary`)
  },
  scriptTab(dramaId) {
    return request.get(`/workbench/projects/${dramaId}/tabs/script`)
  },
  assetsTab(dramaId, params) {
    return request.get(`/workbench/projects/${dramaId}/tabs/assets`, { params: params || {} })
  },
  storyboardsTab(dramaId, params) {
    return request.get(`/workbench/projects/${dramaId}/tabs/storyboards`, { params: params || {} })
  },
  videoComposeTab(dramaId, params) {
    return request.get(`/workbench/projects/${dramaId}/tabs/video-compose`, { params: params || {} })
  },
}
