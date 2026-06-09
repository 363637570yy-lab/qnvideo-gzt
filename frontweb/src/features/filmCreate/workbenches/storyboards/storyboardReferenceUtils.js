export function angleToPromptFragment(h, v, s) {
  const hDesc = {
    front: 'shooting from the front',
    front_left: 'shooting from front-left at 45-degree angle',
    left: 'shooting from the left side, profile view',
    back_left: 'shooting from back-left at 135-degree angle',
    back: "shooting from behind, character's back to camera",
    back_right: 'shooting from back-right at 135-degree angle',
    right: 'shooting from the right side, profile view',
    front_right: 'shooting from front-right at 45-degree angle',
  }
  const vDesc = {
    worm: "extreme low-angle worm's eye view, camera near ground pointing sharply upward, strong upward perspective distortion, background shows sky/ceiling",
    low: 'low-angle upward shot, camera below eye-line, slight upward tilt, empowering perspective',
    eye_level: 'eye-level shot, neutral perspective, natural horizontal framing',
    high: "high-angle bird's eye view, camera above looking down, background shows floor/ground with downward perspective distortion",
  }
  const sDesc = {
    close_up: 'close-up shot (face/bust framing), subject fills most of frame, shallow depth of field, background softly blurred',
    medium: 'medium shot (waist-up to full body), character and immediate surroundings visible, moderate depth of field',
    wide: 'wide shot (full body with environment), subject small relative to scene, deep depth of field, environment context prominent',
  }
  const hLabel = {
    front: '正面',
    front_left: '前左',
    left: '左侧',
    back_left: '后左',
    back: '背面',
    back_right: '后右',
    right: '右侧',
    front_right: '前右',
  }
  const vLabel = { worm: '虫眼仰', low: '仰拍', eye_level: '平视', high: '俯拍' }
  const sLabel = { close_up: '特写', medium: '中景', wide: '远景' }
  const fragment = [sDesc[s] || sDesc.medium, vDesc[v] || vDesc.eye_level, hDesc[h] || hDesc.front].join(', ')
  const label = `${sLabel[s] || '中景'}·${vLabel[v] || '平视'}·${hLabel[h] || '正面'}`
  return { fragment, label }
}

export function imageReferenceUrlForApi(item, assetImageUrl) {
  return assetImageUrl?.(item) || ''
}

export function collectStoryboardAssetReferenceImages(storyboardId, options = {}) {
  const {
    assetImageUrl = () => '',
    getSbSelectedScene = () => null,
    getSbSelectedCharacters = () => [],
    getSbSelectedProps = () => [],
  } = options
  const refs = []
  const add = (url) => {
    if (url && !refs.includes(url)) refs.push(url)
  }
  const addItem = (item) => add(imageReferenceUrlForApi(item, assetImageUrl))

  addItem(getSbSelectedScene(storyboardId))
  getSbSelectedCharacters(storyboardId).forEach(addItem)
  getSbSelectedProps(storyboardId).forEach(addItem)
  return refs.filter(Boolean)
}
