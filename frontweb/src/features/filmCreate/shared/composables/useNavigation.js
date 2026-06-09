import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue'

const NAV_AUTO_COLLAPSE_WIDTH = 960
const DEFAULT_ANCHOR_TAB_MAP = {
  'anchor-script': 'script',
  'anchor-characters': 'characters',
  'anchor-scenes': 'scenes',
  'anchor-props': 'props',
  'anchor-storyboard': 'storyboards',
  'anchor-video': 'videoCompose',
}

/**
 * 左侧导航折叠/展开逻辑
 */
export function useNavigation(options = {}) {
  const {
    filmWorkbenchTab,
    anchorTabMap = DEFAULT_ANCHOR_TAB_MAP,
  } = options
  const navCollapsed = ref(false)
  const storyboardMenuExpanded = ref(false)
  let _navAutoCollapsed = false

  function _syncNavCollapse() {
    const narrow = window.innerWidth < NAV_AUTO_COLLAPSE_WIDTH
    if (narrow && !_navAutoCollapsed && !navCollapsed.value) {
      _navAutoCollapsed = true
      navCollapsed.value = true
    } else if (!narrow && _navAutoCollapsed) {
      _navAutoCollapsed = false
      navCollapsed.value = false
    }
  }

  function toggleNav() {
    navCollapsed.value = !navCollapsed.value
    _navAutoCollapsed = false
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function scrollToAnchor(id) {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function switchWorkbenchTabForAnchor(anchor) {
    const tab = anchorTabMap[anchor]
    if (tab && filmWorkbenchTab?.value != null) filmWorkbenchTab.value = tab
  }

  async function goWorkbenchAnchor(stepOrAnchor) {
    const anchor = typeof stepOrAnchor === 'string' ? stepOrAnchor : stepOrAnchor?.anchor
    if (!anchor) return
    switchWorkbenchTabForAnchor(anchor)
    await nextTick()
    scrollToAnchor(anchor)
  }

  async function goStoryboardAnchor(sbId) {
    if (filmWorkbenchTab?.value != null) filmWorkbenchTab.value = 'storyboards'
    await nextTick()
    scrollToAnchor('sb-' + sbId)
  }

  onMounted(() => {
    _syncNavCollapse()
    window.addEventListener('resize', _syncNavCollapse)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', _syncNavCollapse)
  })

  return {
    anchorTabMap,
    goStoryboardAnchor,
    goWorkbenchAnchor,
    navCollapsed,
    storyboardMenuExpanded,
    switchWorkbenchTabForAnchor,
    toggleNav,
    scrollToTop,
    scrollToAnchor,
  }
}
