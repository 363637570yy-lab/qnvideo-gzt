const angleService = require('../angleService');
function normalizeStoryboardShotNumber(rawOrSb) {
  const raw = rawOrSb && typeof rawOrSb === 'object'
    ? (rawOrSb.storyboard_number ?? rawOrSb.shot_number ?? rawOrSb.number)
    : rawOrSb;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}
/** 规范为数字秒：前端左侧用 {{ shot.duration }}s，右侧用 Math.round(duration)；避免 "5s" 导致 5ss，或非数字导致 NaN */
function normalizeDuration(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  const s = String(v).trim().replace(/s$/i, '');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

const STORYBOARD_DURATION_BUCKETS = [4, 5, 8, 10, 12, 15];

function snapStoryboardDuration(sec) {
  const n = Math.max(4, Math.min(15, Math.round(Number(sec) || 8)));
  let best = STORYBOARD_DURATION_BUCKETS[0];
  for (const bucket of STORYBOARD_DURATION_BUCKETS) {
    const bestDelta = Math.abs(best - n);
    const delta = Math.abs(bucket - n);
    if (delta < bestDelta || (delta === bestDelta && bucket > best)) best = bucket;
  }
  return best;
}

/** 将 lighting_style 枚举转为中文布光提示（兜底用） */
function lightingStyleHintZh(code) {
  const m = {
    natural: '自然窗光或环境散射光',
    front: '正面柔光面部受光均匀',
    side: '侧光约45°勾勒轮廓',
    backlit: '逆光轮廓光发丝边缘发亮',
    top: '顶光压暗眼窝',
    under: '底光或脚光非常规氛围',
    soft: '软光低反差过渡柔和',
    dramatic: '戏剧高反差主辅分明',
    golden_hour: '金色时刻暖斜阳',
    blue_hour: '蓝调时刻冷环境光',
    night: '夜景人工点光源',
    neon: '霓虹混合色温',
  };
  return m[String(code || '').trim()] || '主光方向明确侧光或窗光';
}

/** 按时长与已有运镜字段拼灵境式「运镜链」（至少两步，强调摄影机在动） */
function buildCameraMotionChain(movement, shotType, durationSec) {
  const dur = Math.max(1, Number(durationSec) || 10);
  const mv = String(movement || '').trim();
  const st = String(shotType || '').trim();
  const parts = [];
  if (dur >= 12) {
    parts.push('定镜约1秒建立空间');
    if (/跟|追随|尾随/.test(mv)) parts.push('侧后方跟拍主体位移');
    else if (/摇/.test(mv)) parts.push(`${mv || '轻摇'}拓展画幅信息`);
    else parts.push('缓推轨贴近动作核心');
    parts.push('横移从前景遮挡或门框一侧滑出拓宽视野带出纵深与环境细节');
  } else if (dur >= 8) {
    parts.push('定镜');
    parts.push(mv && !/^固定|^定镜/.test(mv) ? mv : '缓推轨由远及近');
    parts.push('微横移或轻摇让背景纵深与环境细节可读');
  } else if (dur >= 5) {
    parts.push('定镜起幅');
    parts.push(mv || '缓推轨或短跟拍强化动线');
  } else {
    parts.push(mv || '短跟拍或微推');
  }
  if ((st.includes('远') || st.includes('全景')) && !parts.some((p) => /推|移|跟|摇/.test(p))) {
    parts.push('缓推轨向事件中心');
  }
  const chain = [...new Set(parts)].filter(Boolean).join('，');
  return chain || '定镜，缓推轨';
}

/** 全能分镜：模型未返回 universal_segment_text 时的灵境式高密度单行（视频时间轴 + 运镜链） */
function buildFallbackUniversalSeedanceLine(sb, d, styleHint) {
  const act = (d.action || '').replace(/\s+/g, ' ').trim().slice(0, 220);
  const res = (d.result || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const emo = (d.emotion || sb.emotion || '').replace(/\s+/g, ' ').trim().slice(0, 24);
  const atm = (sb.atmosphere || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  const shotBits = [d.shotType, d.angle].filter(Boolean).join('，').trim();
  const loc = [sb.location, sb.time].filter(Boolean).join('，').trim() || '叙事空间';
  const dur = Math.max(1, Number(d.durationSec) || normalizeDuration(sb.duration) || 10);
  const lightZh = lightingStyleHintZh(d.lightingStyle);
  const dof = d.depthOfField === 'extreme_shallow' ? '浅景深前景虚化明显' : d.depthOfField === 'shallow' ? '浅景深背景柔化' : d.depthOfField === 'deep' ? '深焦前后景均清晰' : d.depthOfField === 'medium' ? '景深适中' : '景深随景别可感';
  const shotNum = Math.max(1, Number(d.shotNumber) || 1);
  const link = shotNum <= 1 ? '开篇情绪奠基' : '延续上一镜动势与视线';
  const motionCore =
    act ||
    '在镜内时长里完成一段可感知的动作阶段变化，含走位或身体重心的转移，避免单姿势摆拍';
  const emoParen = emo ? `（${emo}）` : '（专注投入）';
  const fg = atm ? `${atm.slice(0, 42)}与主体相关的虚化层次` : '与动作相关的近景细节或桌面器物';
  const mg = act ? '主体动作与表情核心区' : '主体占据画面叙事中心';
  const bg = loc ? `${loc}的环境延展与氛围层次` : '环境纵深与空间气氛';
  const lightBlock = `[${lightZh}；结合${loc}，建议色温具象化如4500K-5600K区间择一；明暗比约2:1至3:1；${dof}]`;
  const camChain = buildCameraMotionChain(d.movement, d.shotType, dur);
  const narrDyn = `约${dur}秒内——在${loc}，@人物1${act ? `先后：${act}` : '持续推进戏内动作'}，${res ? `阶段收束为：${res}` : '动作与视线随时间有阶段推进'}；镜头以「${camChain}」配合人物动线，读出空间纵深与时间流逝`;
  const lensBlock = `运镜链：${camChain}；景别机位：${shotBits || '中景，平视'}，三分法或对角线择一（结尾动势：[${res || '视线或身体动线指向下一个节拍，动势渐收可衔接下镜'}]）`;
  const sfx = `环境层-[与${loc}一致的环境声底与远处细节] 动作层-[与动作同步的物理接触声] 情绪层-[无旋律仅以空间混响与材质细微声烘托情绪张力]`;
  const styleTail = (styleHint && String(styleHint).trim()) || '电影感叙事光色';
  const dia = (d.dialogue || '').trim().replace(/"/g, "'");
  let line = `主体：@人物1${emoParen}[朝向：依轴线面向戏中对象或画左/画右择一并保持统一] 正在 ${motionCore}（与上镜衔接：${link}） 叙事动态：${narrDyn} 空间：前景-[${fg}] 中景-[${mg}] 背景-[${bg}] 光影：${lightBlock} 镜头：${lensBlock}`;
  if (dia) line += ` 台词：第1秒 @人物1："${dia.slice(0, 120)}"`;
  line += ` 音效：${sfx} ${styleTail} [禁BGM][禁字幕]`;
  return line.replace(/\r?\n/g, ' ');
}

function extractInitialPose(action) {
  if (!action || typeof action !== 'string') return '';
  const processWords = [
    '然后', '接着', '接下来', '随后', '紧接着',
    '向下', '向上', '向前', '向后', '向左', '向右',
    '开始', '继续', '逐渐', '慢慢', '快速', '突然', '猛然',
  ];
  let result = action;
  for (const word of processWords) {
    const idx = result.indexOf(word);
    if (idx > 0) {
      result = result.slice(0, idx);
      break;
    }
  }
  return result.replace(/[，。,.]\s*$/, '').trim();
}

function generateImagePrompt(sb, style) {
  const parts = [];
  // 场景位置与时间
  if (sb.location) {
    let locationDesc = sb.location;
    if (sb.time) locationDesc += '，' + sb.time;
    parts.push(locationDesc);
  }
  // 镜头视角：优先结构化三元组（中文标签），降级到旧文本
  if (sb.angle_h && sb.angle_v && sb.angle_s) {
    parts.push(angleService.toChineseLabel(sb.angle_h, sb.angle_v, sb.angle_s));
  } else if (sb.angle || sb.shot_type) {
    const { h, v, s } = angleService.parseFromLegacyText(sb.angle || '', sb.shot_type || '');
    parts.push(angleService.toChineseLabel(h, v, s));
  }
  // 画面动作（取动作的起始状态）
  if (sb.action) {
    const initialPose = extractInitialPose(sb.action);
    if (initialPose) parts.push(initialPose);
  }
  // 情绪
  if (sb.emotion) parts.push(sb.emotion);
  // 风格（英文 prompt token，保持英文以兼容图片 AI）
  const styleText = style && String(style).trim();
  if (styleText) parts.push(styleText);
  parts.push('首帧静止画面');
  return parts.join('，');
}

function generateVideoPrompt(sb, style, videoRatio) {
  const parts = [];
  // 场景与标题
  if (sb.scene_description) {
    parts.push('场景：' + sb.scene_description);
  } else if (sb.location) {
    const scene = sb.time ? sb.location + '，' + sb.time : sb.location;
    parts.push('场景：' + scene);
  }
  if (sb.title) parts.push('镜头标题：' + sb.title);
  // 动作与对白（核心叙事）
  if (sb.action) parts.push('动作：' + sb.action);
  if (sb.dialogue) parts.push('对话：' + sb.dialogue);
  if (sb.narration) parts.push('解说旁白：' + sb.narration);
  if (sb.result) parts.push('结果：' + sb.result);
  // 镜头与运镜
  const shotType = sb.shot_type || sb.camera_shot_type;
  if (shotType) parts.push('景别：' + shotType);
  // 结构化视角：中文标签 + 英文描述（兼顾中英文视频模型）
  if (sb.angle_h && sb.angle_v && sb.angle_s) {
    const chLabel = angleService.toChineseLabel(sb.angle_h, sb.angle_v, sb.angle_s);
    const angleFragment = angleService.toPromptFragment(sb.angle_h, sb.angle_v, sb.angle_s);
    parts.push(`镜头角度：${chLabel}（${angleFragment}）`);
  } else {
    const angle = sb.angle ?? sb.camera_angle;
    if (angle) parts.push('镜头角度：' + angle);
  }
  const movement = sb.movement ?? sb.camera_movement;
  if (movement) parts.push('运镜：' + movement);
  // 氛围与情绪
  if (sb.atmosphere) parts.push('氛围：' + sb.atmosphere);
  if (sb.emotion) parts.push('情绪：' + sb.emotion);
  if (sb.emotion_intensity != null && sb.emotion_intensity !== '') {
    parts.push('情绪强度：' + String(sb.emotion_intensity));
  }
  // 声音
  if (sb.bgm_prompt) parts.push('配乐：' + sb.bgm_prompt);
  if (sb.sound_effect) parts.push('音效：' + sb.sound_effect);
  // 时长
  const durationSec = normalizeDuration(sb.duration) || 10;
  parts.push('时长：' + durationSec + '秒');
  // 风格（英文 token 保持英文以兼容视频 AI）与画面比例
  if (style) parts.push('风格：' + style);
  if (videoRatio) parts.push('=VideoRatio: ' + videoRatio);
  return parts.length ? parts.join('。') : '视频场景';
}

/**
 * 从 AI 输出的单个分镜对象计算入库字段（INSERT/UPDATE 共用）。
 * 会就地写入 sb.location / sb.time（由 scene_description 拆分）。
 */
function deriveStoryboardFieldsFromAi(sb, style, videoRatio, opts = {}) {
  const universalOmni = !!opts.universalOmni;
  const angleValFn = (x) => x.angle ?? x.camera_angle ?? null;
  const shotNumber = normalizeStoryboardShotNumber(sb);
  const title = sb.title ?? '';
  const shotType = sb.shot_type ?? '';
  const movement = sb.movement ?? sb.camera_movement ?? '';
  const angle = angleValFn(sb);
  const action = sb.action ?? '';
  const dialogue = sb.dialogue ?? '';
  const narration = sb.narration ?? '';
  const result = sb.result ?? '';
  const emotion = sb.emotion ?? '';
  const segmentIndex = sb.segment_index != null ? Number(sb.segment_index) : 0;
  const segmentTitle = sb.segment_title ?? null;
  const lightingStyle = sb.lighting_style ?? null;
  const depthOfField = sb.depth_of_field ?? null;
  const layoutDescription = sb.layout_description ?? sb.layoutDescription ?? null;
  let durationSec = normalizeDuration(sb.duration) || 8;
  const targetClip = opts.targetClipDuration != null ? Number(opts.targetClipDuration) : 0;
  if (Number.isFinite(targetClip) && targetClip > 0) {
    durationSec = Math.max(durationSec, Math.round(targetClip));
  }
  durationSec = snapStoryboardDuration(durationSec);
  sb.duration = durationSec;
  if (!sb.location && sb.scene_description) {
    const sceneDesc = String(sb.scene_description).trim();
    const sepIdx = sceneDesc.search(/[，,、]/);
    if (sepIdx > 0) {
      sb.location = sceneDesc.slice(0, sepIdx).trim();
      if (!sb.time) sb.time = sceneDesc.slice(sepIdx + 1).trim();
    } else {
      sb.location = sceneDesc;
    }
  }
  const parsedAngle = (angle || shotType)
    ? angleService.parseFromLegacyText(angle || '', shotType || '')
    : { h: null, v: null, s: null };
  const angleH = sb.angle_h ?? parsedAngle.h;
  const angleV = sb.angle_v ?? parsedAngle.v;
  const angleS = sb.angle_s ?? parsedAngle.s;
  const description = `【镜头类型】${shotType}\n【运镜】${movement}\n【动作】${action}\n【对话】${dialogue}\n【解说】${narration}\n【结果】${result}\n【情绪】${emotion}`;
  const sbWithAngles = { ...sb, angle_h: angleH, angle_v: angleV, angle_s: angleS };
  const imagePrompt = generateImagePrompt(sbWithAngles, style);
  const videoPrompt = generateVideoPrompt(sbWithAngles, style, videoRatio);
  const sceneId = sb.scene_id != null ? Number(sb.scene_id) : null;
  const charactersJson = Array.isArray(sb.characters) ? JSON.stringify(sb.characters) : (sb.characters ? JSON.stringify([].concat(sb.characters)) : '[]');
  const propIds = Array.isArray(sb.props) ? sb.props.map(Number).filter(Number.isFinite) : [];
  let universalSegmentText = '';
  if (sb.universal_segment_text != null && String(sb.universal_segment_text).trim()) {
    universalSegmentText = String(sb.universal_segment_text).trim().replace(/\r?\n/g, ' ');
  }
  if (universalOmni && !universalSegmentText) {
    universalSegmentText = buildFallbackUniversalSeedanceLine(
      sb,
      {
        shotNumber,
        durationSec,
        shotType,
        movement,
        angle,
        action,
        dialogue,
        result,
        emotion,
        lightingStyle,
        depthOfField,
      },
      style
    );
  }
  const creationMode = universalOmni ? 'universal' : 'classic';
  if (!universalOmni) universalSegmentText = null;
  return {
    shotNumber,
    title,
    shotType,
    movement,
    angle,
    action,
    dialogue,
    narration,
    result,
    emotion,
    durationSec,
    segmentIndex,
    segmentTitle,
    lightingStyle,
    depthOfField,
    description,
    imagePrompt,
    videoPrompt,
    sceneId,
    charactersJson,
    angleH,
    angleV,
    angleS,
    propIds,
    layoutDescription,
    creationMode,
    universalSegmentText,
  };
}

/** 用最终解析的分镜对象覆盖已存在的行（修正流式增量先入库时缺 narration 等字段的问题） */
module.exports = {
  normalizeDuration,
  snapStoryboardDuration,
  generateImagePrompt,
  generateVideoPrompt,
  deriveStoryboardFieldsFromAi,
};