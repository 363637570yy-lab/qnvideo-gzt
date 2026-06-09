const SCENE_KEY_DEFINITIONS = [
  { key: 'story_generation', label: '故事生成', service_type: 'text', description: '根据梗概、类型和风格扩展故事正文' },
  { key: 'novel_import', label: '小说导入改写', service_type: 'text', description: '小说章节摘要、改编和结构化导入' },
  { key: 'role_extraction', label: '角色提取', service_type: 'text', description: '从剧本提取角色信息' },
  { key: 'identity_anchors', label: '角色视觉锚点', service_type: 'text', description: '为角色生成稳定视觉锚点' },
  { key: 'scene_extraction', label: '场景提取', service_type: 'text', description: '从剧本提取场景背景' },
  { key: 'prop_extraction', label: '道具提取', service_type: 'text', description: '从剧本提取关键道具' },
  { key: 'storyboard_extraction', label: '分镜生成', service_type: 'text', description: '从分集剧本生成分镜列表' },
  { key: 'storyboard_frame_prompt', label: '帧提示词生成', service_type: 'text', description: '生成首帧、关键帧、尾帧或分镜板提示词' },
  { key: 'storyboard_layout', label: '分镜布局重写', service_type: 'text', description: '重生成分镜空间布局描述' },
  { key: 'image_polish', label: '分镜图提示词润色', service_type: 'text', description: '润色分镜图、首尾帧和参考图提示词' },
  { key: 'role_image_polish', label: '角色图提示词润色', service_type: 'text', description: '生成或优化角色图片提示词' },
  { key: 'scene_image_polish', label: '场景图提示词润色', service_type: 'text', description: '生成或优化场景图片提示词' },
  { key: 'prop_image_polish', label: '道具图提示词润色', service_type: 'text', description: '生成或优化道具图片提示词' },
  { key: 'vision_character_extract', label: '图片识别角色', service_type: 'text', description: '从角色参考图反推外貌描述' },
  { key: 'vision_scene_extract', label: '图片识别场景', service_type: 'text', description: '从场景参考图反推场景描述' },
  { key: 'vision_prop_extract', label: '图片识别道具', service_type: 'text', description: '从道具参考图反推道具描述' },
  { key: 'character_image', label: '角色图片生成', service_type: 'image', description: '生成角色三视图、单图或工作流图片' },
  { key: 'scene_image', label: '场景图片生成', service_type: 'image', description: '生成场景四视图、单图或俯视图等图片' },
  { key: 'prop_image', label: '道具图片生成', service_type: 'image', description: '生成道具图片或道具多视图' },
  { key: 'storyboard_image', label: '分镜图片生成', service_type: 'image', description: '生成分镜图、首帧、尾帧和关键帧' },
  { key: 'narration_tts', label: '旁白/对白 TTS', service_type: 'tts', description: '分镜旁白、对白和整片音频合成' },
  { key: 'storyboard_video', label: '分镜视频生成', service_type: 'video', description: '图生视频、文生视频、首尾帧视频' },
];

function getSceneKeyDefinitions() {
  return SCENE_KEY_DEFINITIONS.map((item) => ({ ...item }));
}

function getSceneKeyDefinition(key) {
  return SCENE_KEY_DEFINITIONS.find((item) => item.key === key) || null;
}

function resolveImageSceneKey(opts = {}) {
  if (opts.scene_key || opts.sceneKey) return opts.scene_key || opts.sceneKey;
  if (opts.storyboard_id || opts.frame_prompt_id || opts.image_type === 'storyboard') return 'storyboard_image';
  if (opts.character_id) return 'character_image';
  if (opts.scene_id) return 'scene_image';
  if (opts.prop_id) return 'prop_image';
  return 'storyboard_image';
}

function resolveTtsSceneKey(opts = {}) {
  return opts.scene_key || opts.sceneKey || 'narration_tts';
}

function resolveVideoSceneKey(opts = {}) {
  return opts.scene_key || opts.sceneKey || 'storyboard_video';
}

function resolveFramePromptSceneKey() {
  return 'storyboard_frame_prompt';
}

module.exports = {
  SCENE_KEY_DEFINITIONS,
  getSceneKeyDefinitions,
  getSceneKeyDefinition,
  resolveImageSceneKey,
  resolveTtsSceneKey,
  resolveVideoSceneKey,
  resolveFramePromptSceneKey,
};
