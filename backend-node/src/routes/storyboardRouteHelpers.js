const fs = require('fs');
const path = require('path');
const angleService = require('../services/angleService');
/** 润色接口：邻镜结构化摘要（含全能片段与其它提示词字段） */
function formatNeighborShotPolishContext(row) {
  if (!row) return '(none)';
  const chunk = (k, v) => {
    const s = v != null && String(v).trim() ? String(v).trim() : '';
    return s ? `${k}: ${s}` : null;
  };
  const bits = [
    chunk('SHOT_NUM', row.storyboard_number),
    chunk('TITLE', row.title),
    chunk('DESCRIPTION', row.description),
    chunk('ACTION', row.action),
    chunk('DIALOGUE', row.dialogue),
    chunk('NARRATION', row.narration),
    chunk('VIDEO_PROMPT', row.video_prompt),
    chunk('UNIVERSAL_SEGMENT_TEXT', row.universal_segment_text),
  ].filter(Boolean);
  return bits.length ? bits.join('\n') : '(empty)';
}

function clipClassicCtx(s, maxLen) {
  if (s == null) return '';
  const t = String(s).trim();
  if (!t) return '';
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen)}…`;
}

/**
 * 从「场景：…。配乐：…」式拼装文案中拆出带标签的分句，供润色时强制保留信息点（配乐/音效/情绪强度/画幅/完整镜头英文等）。
 */
function extractRetentionClausesFromVideoPrompts(draft, composed) {
  const seen = new Set();
  const out = [];
  const sources = [draft, composed].map((x) => (x != null ? String(x).trim() : '')).filter(Boolean);
  for (const full of sources) {
    const pieces = full
      .replace(/\r\n/g, '\n')
      .trim()
      .split(/。+/)
      .map((x) => x.trim())
      .filter(Boolean);
    for (let piece of pieces) {
      piece = piece.replace(/\s*=\s*VideoRatio\s*:/gi, '=VideoRatio:').trim();
      if (!piece) continue;
      const labeled = /^(场景|镜头标题|动作|对话|对白|结果|景别|镜头角度|运镜|氛围|情绪|情绪强度|配乐|音效|时长|风格|解说旁白)[：:]/.test(
        piece
      );
      const hasRatio = /=VideoRatio\s*:/i.test(piece);
      if (!labeled && !hasRatio) continue;
      const dedupKey = piece.slice(0, 140);
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      let c = piece;
      if (/^镜头角度/.test(c) && c.length > 920) c = `${c.slice(0, 920)}…`;
      else if (c.length > 560) c = `${c.slice(0, 560)}…`;
      if (!/[。．…]$/.test(c)) c += '。';
      out.push(c);
    }
  }
  return out;
}

/** 经典视频润色：邻镜长上下文（衔接剧情与已有视频文案） */
const MOVEMENT_LABEL_ZH = {
  static: '固定镜头',
  push: '推镜',
  pull: '拉镜',
  pan: '横摇',
  tilt: '纵摇',
  tracking: '跟镜',
  crane_up: '升镜',
  crane_dn: '降镜',
  orbit: '环绕',
  handheld: '手持',
};

const LIGHTING_LABEL_ZH = {
  natural: '自然光',
  front: '顺光',
  side: '侧光',
  backlit: '逆光',
  top: '顶光',
  under: '底光',
  soft: '柔光',
  dramatic: '戏剧光',
  golden_hour: '黄金时段',
  blue_hour: '蓝调时刻',
  night: '夜景',
  neon: '霓虹',
};

const DEPTH_LABEL_ZH = {
  extreme_shallow: '极浅景深',
  shallow: '浅景深',
  medium: '中景深',
  deep: '深景深（全焦）',
};

function movementDisplay(sbRow) {
  const raw = sbRow.movement != null ? String(sbRow.movement).trim() : '';
  if (!raw) return '';
  const zh = MOVEMENT_LABEL_ZH[raw];
  return zh ? `${zh}（${raw}）` : raw;
}

function lightingDisplay(sbRow) {
  const raw = sbRow.lighting_style != null ? String(sbRow.lighting_style).trim() : '';
  if (!raw) return '';
  const zh = LIGHTING_LABEL_ZH[raw];
  return zh ? `${zh}（${raw}）` : raw;
}

function depthDisplay(sbRow) {
  const raw = sbRow.depth_of_field != null ? String(sbRow.depth_of_field).trim() : '';
  if (!raw) return '';
  const zh = DEPTH_LABEL_ZH[raw];
  return zh ? `${zh}（${raw}）` : raw;
}

/** 结构化视角：中文标签 + 英文片语，供润色必覆盖清单 */
function angleCoverageLine(sbRow) {
  if (sbRow.angle_h && sbRow.angle_v && sbRow.angle_s) {
    try {
      const zh = angleService.toChineseLabel(sbRow.angle_h, sbRow.angle_v, sbRow.angle_s);
      const en = angleService.toPromptFragment(sbRow.angle_h, sbRow.angle_v, sbRow.angle_s);
      return `镜头角度（机位/景别）：${zh}；${en}`;
    } catch (_) {
      return sbRow.angle ? String(sbRow.angle).trim() : '';
    }
  }
  return sbRow.angle ? String(sbRow.angle).trim() : '';
}

/**
 * 凡非空字段逐条列出；模型须在同一段成稿中全部体现其语义（可改写，不可丢信息）。
 */
function buildClassicRequiredCoverageDigest(sbRow, linkedSceneText) {
  const lines = [];
  const add = (label, text) => {
    const s = text != null ? String(text).trim() : '';
    if (s) lines.push(`- ${label}：${s}`);
  };
  const sceneLocTime = [sbRow.location, sbRow.time].filter((x) => x != null && String(x).trim()).join('，');
  add('场景（地点与时间）', sceneLocTime);
  if (linkedSceneText) add('关联场景库（地点/时间/摘要）', linkedSceneText);
  add('镜头标题', sbRow.title);
  add('分镜描述', sbRow.description);
  add('人物动作', sbRow.action);
  add('人物对白', sbRow.dialogue);
  add('解说旁白', sbRow.narration);
  add('画面结果/落幅', sbRow.result);
  add('氛围', sbRow.atmosphere);
  add('情绪', sbRow.emotion);
  if (sbRow.emotion_intensity != null && sbRow.emotion_intensity !== '') {
    const ei = Number(sbRow.emotion_intensity);
    if (Number.isFinite(ei)) add('情绪强度', String(ei));
    else add('情绪强度', String(sbRow.emotion_intensity).trim());
  }
  add('景别', sbRow.shot_type);
  const ang = angleCoverageLine(sbRow);
  if (ang) add('镜头方式（视角/机位）', ang);
  add('光线/灯光风格', lightingDisplay(sbRow) || sbRow.lighting_style);
  add('景深', depthDisplay(sbRow) || sbRow.depth_of_field);
  add('运镜', movementDisplay(sbRow) || sbRow.movement);
  const dur = Number(sbRow.duration);
  const sec = Number.isFinite(dur) && dur > 0 ? Math.round(dur) : 5;
  add('时长（秒）', `${sec}`);
  if (sbRow.segment_title != null && String(sbRow.segment_title).trim()) {
    add('剧情段落', `「${String(sbRow.segment_title).trim()}」` + (sbRow.segment_index != null ? `（段序号 ${sbRow.segment_index}）` : ''));
  }
  if (!lines.length) return '(当前无非空结构化字段；请依据剧本与 AUTO_COMPOSED 润色)';
  return ['下列维度在库中均有值——成稿须**全部覆盖**其语义（允许电影化改写，禁止删事实、改秒数、改对白原意）：', ...lines].join('\n');
}

function formatClassicVideoNeighborBlock(label, row) {
  if (!row) return `${label}:\n(none)`;
  const lines = [
    row.storyboard_number != null && row.storyboard_number !== ''
      ? `SHOT_NUM: ${row.storyboard_number}`
      : null,
    row.title ? `TITLE: ${clipClassicCtx(row.title, 180)}` : null,
    row.description ? `DESCRIPTION: ${clipClassicCtx(row.description, 420)}` : null,
    row.action ? `ACTION: ${clipClassicCtx(row.action, 450)}` : null,
    row.dialogue ? `DIALOGUE: ${clipClassicCtx(row.dialogue, 320)}` : null,
    row.narration ? `NARRATION: ${clipClassicCtx(row.narration, 320)}` : null,
    row.video_prompt ? `VIDEO_PROMPT: ${clipClassicCtx(row.video_prompt, 450)}` : null,
    row.universal_segment_text
      ? `UNIVERSAL_SEGMENT_TEXT: ${clipClassicCtx(row.universal_segment_text, 260)}`
      : null,
  ].filter(Boolean);
  return `${label}:\n${lines.length ? lines.join('\n') : '(empty)'}`;
}

/**
 * 分镜主图路径：storyboards.local_path 常与图生记录不同步（图在 image_generations），按存在性解析。
 * @returns {string|null} storage 相对路径
 */
function resolveStoryboardImageLocalPath(db, storageBase, storyboardId, sbRow) {
  const normalizeRel = (rel) => (rel && String(rel).trim() ? String(rel).trim().replace(/^\//, '') : '');
  const tryRel = (rel) => {
    const r = normalizeRel(rel);
    if (!r) return null;
    const abs = path.join(storageBase, r);
    return fs.existsSync(abs) ? r : null;
  };
  const fromSb = tryRel(sbRow?.local_path);
  if (fromSb) return fromSb;
  const ig = db.prepare(
    `SELECT local_path FROM image_generations
     WHERE storyboard_id = ? AND status = 'completed' AND deleted_at IS NULL
       AND local_path IS NOT NULL AND TRIM(local_path) != ''
     ORDER BY id DESC
     LIMIT 1`
  ).get(storyboardId);
  return tryRel(ig?.local_path);
}

/** 全能片段：@图片N 与中英字、引号之间补半角空格，便于模型与接口解析 */
function normalizeUniversalSegmentAtImageSpacing(text) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(
    /@图片(\d+)(?=[\u4e00-\u9fffA-Za-z「『【（])/gu,
    '@图片$1 '
  );
}
module.exports = {
  formatNeighborShotPolishContext,
  extractRetentionClausesFromVideoPrompts,
  buildClassicRequiredCoverageDigest,
  formatClassicVideoNeighborBlock,
  resolveStoryboardImageLocalPath,
  normalizeUniversalSegmentAtImageSpacing,
};