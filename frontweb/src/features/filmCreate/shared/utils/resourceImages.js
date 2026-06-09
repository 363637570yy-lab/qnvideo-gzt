export function resourceImageKey(type, id) {
  const prefix = type === 'character' ? 'char-' : type === 'prop' ? 'prop-' : 'scene-'
  return prefix + id
}

export function parseExtraImages(item) {
  if (!item?.extra_images) return []
  try {
    const arr = typeof item.extra_images === 'string' ? JSON.parse(item.extra_images) : item.extra_images
    return Array.isArray(arr) ? arr.filter(Boolean) : []
  } catch {
    return []
  }
}

export function localPathToUrl(path) {
  if (!path) return ''
  if (String(path).startsWith('http')) return path
  return '/static/' + String(path).replace(/^\//, '')
}
