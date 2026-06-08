const VALID_TYPES = new Set(['character', 'scene', 'prop', 'storyboard']);

const DEFAULT_PRESETS = [
  {
    preset_type: 'character',
    preset_key: 'character_main_card',
    name: '角色主图抽卡',
    description: '用于快速抽取角色主视觉候选图，先看角色气质、脸型、服饰和整体风格。',
    mode: 'character_four_view',
    sort_order: 10,
    is_default: 0,
    prompt_template: 'Prioritize a strong character design hero presence, clear face, full outfit readability, coherent identity, production-ready anime/video character reference.',
    negative_prompt_template: 'low quality, inconsistent face, different outfits across panels, extra characters, watermark, text',
    options: { output_role: 'candidate', candidate_count: 4 },
  },
  {
    preset_type: 'character',
    preset_key: 'character_four_view',
    name: '角色三/四视图',
    description: '用于人物长期一致性，默认主规范：正面、侧面、背面与补充角度保持同一角色。',
    mode: 'character_four_view',
    sort_order: 20,
    is_default: 1,
    prompt_template: 'Use strict production character turnaround discipline: front view, side/profile view, back view, and three-quarter/detail reference must keep identical identity, body proportions, costume, palette, hairstyle, and material details.',
    negative_prompt_template: 'identity drift, outfit mismatch, different ages, different hairstyles, text labels, watermark, extra people',
    options: { output_role: 'primary_reference', candidate_count: 1 },
  },
  {
    preset_type: 'character',
    preset_key: 'character_design_sheet',
    name: '角色设定页',
    description: '适合沉淀角色信息：全身、半身、脸部、服装/道具细节同页表达。',
    mode: 'character_four_view',
    sort_order: 30,
    is_default: 0,
    prompt_template: 'Make the result feel like a professional character design sheet: full body, upper body, face close-up, costume/material details, same identity across every view.',
    negative_prompt_template: 'comic panel story scene, unrelated poses, inconsistent costume, unreadable face, watermark, text',
    options: { output_role: 'reference_sheet', candidate_count: 1 },
  },
  {
    preset_type: 'character',
    preset_key: 'character_expression_sheet',
    name: '表情表',
    description: '用于角色表演参考，强调同一身份下的多种情绪表情。',
    mode: 'character_four_view',
    sort_order: 40,
    is_default: 0,
    prompt_template: 'Focus on an expression sheet: same character identity with neutral, happy, angry, sad, shocked, determined expressions; preserve face structure, hairstyle, costume cues.',
    negative_prompt_template: 'different people, over-stylized stickers, text labels, watermark, costume changes',
    options: { output_role: 'auxiliary_reference', candidate_count: 1 },
  },
  {
    preset_type: 'character',
    preset_key: 'character_pose_pack',
    name: '姿态动作包',
    description: '用于动作戏和分镜参考，强调站立、奔跑、转身、战斗等姿态。',
    mode: 'character_four_view',
    sort_order: 50,
    is_default: 0,
    prompt_template: 'Focus on action pose reference: neutral standing, walking/running, turning, combat or dramatic gesture; same body proportions and costume in all poses.',
    negative_prompt_template: 'identity drift, broken anatomy, costume changes, extra characters, text, watermark',
    options: { output_role: 'auxiliary_reference', candidate_count: 1 },
  },
  {
    preset_type: 'character',
    preset_key: 'character_state_variants',
    name: '剧情状态变体',
    description: '用于角色换装、受伤、战斗损耗、年龄阶段等剧情状态。',
    mode: 'character_four_view',
    sort_order: 60,
    is_default: 0,
    prompt_template: 'Create controlled story-state variants of the same character: clean/default, action-worn, injured or tired, alternate outfit if specified; identity must remain unmistakable.',
    negative_prompt_template: 'new character, identity drift, random costume, gore, text, watermark',
    options: { output_role: 'state_reference', candidate_count: 1 },
  },
  {
    preset_type: 'scene',
    preset_key: 'scene_main_card',
    name: '场景主图抽卡',
    description: '快速生成统一完整场景主视觉，用于判断空间气质和美术方向。',
    mode: 'scene_single',
    sort_order: 10,
    is_default: 1,
    prompt_template: 'Single complete establishing scene image, unified space, cinematic composition, no split panels, clear architectural layout, lighting, atmosphere, and key environmental details.',
    negative_prompt_template: 'split screen, grid layout, people, character silhouettes, text, watermark',
    options: { output_role: 'primary_reference', candidate_count: 4 },
  },
  {
    preset_type: 'scene',
    preset_key: 'scene_multi_angle',
    name: '多角度场景图',
    description: '用于空间一致性：同一地点多机位展示空间边界、活动区和关键细节。',
    mode: 'scene_four_view',
    sort_order: 20,
    is_default: 0,
    prompt_template: 'Use a professional multi-angle environment reference layout: wide establishing view, activity zone, signature detail, alternate camera angle; all panels must be the same place and same time/lighting.',
    negative_prompt_template: 'different locations, people, text labels, watermark, inconsistent lighting',
    options: { output_role: 'multi_angle_reference', candidate_count: 1 },
  },
  {
    preset_type: 'scene',
    preset_key: 'scene_top_down',
    name: '俯视/空间布局图',
    description: '用于导演调度、人物站位和镜头路线参考。',
    mode: 'scene_single',
    sort_order: 30,
    is_default: 0,
    prompt_template: 'Top-down or elevated floor-plan-like environment reference, readable spatial layout, entrances, exits, furniture positions, key objects, camera planning clarity, still visually cinematic.',
    negative_prompt_template: 'people crowd, unreadable layout, messy perspective, text labels, watermark',
    options: { output_role: 'layout_reference', candidate_count: 1 },
  },
  {
    preset_type: 'scene',
    preset_key: 'scene_atmosphere_variants',
    name: '时间氛围变体',
    description: '用于同一空间的昼夜、雨雪、火光、黄昏等氛围测试。',
    mode: 'scene_single',
    sort_order: 40,
    is_default: 0,
    prompt_template: 'Keep the same location but emphasize lighting/time/weather variants when specified: day, night, dusk, rain, fog, firelight; preserve spatial identity.',
    negative_prompt_template: 'different architecture, people, text, watermark, inconsistent scale',
    options: { output_role: 'atmosphere_reference', candidate_count: 4 },
  },
  {
    preset_type: 'scene',
    preset_key: 'scene_camera_route',
    name: '机位/镜头路线参考',
    description: '用于分镜前置规划，明确空间、机位、运动路径和视线方向。',
    mode: 'scene_single',
    sort_order: 50,
    is_default: 0,
    prompt_template: 'Environment reference for camera planning: clear foreground/midground/background, visible movement path, strong directional composition, readable camera route through the space.',
    negative_prompt_template: 'flat composition, people, text arrows, labels, watermark, confusing layout',
    options: { output_role: 'camera_reference', candidate_count: 1 },
  },
  {
    preset_type: 'scene',
    preset_key: 'scene_detail_pack',
    name: '空间细节特写',
    description: '用于入口、出口、关键区域、标志物、材质和道具摆放细节。',
    mode: 'scene_single',
    sort_order: 60,
    is_default: 0,
    prompt_template: 'Focus on a signature environmental detail close-up while preserving the scene identity: entrance, key prop area, wall material, signage-free landmark, texture and lighting detail.',
    negative_prompt_template: 'people, hands, random objects, text, logo, watermark',
    options: { output_role: 'detail_reference', candidate_count: 2 },
  },
  {
    preset_type: 'prop',
    preset_key: 'prop_main_card',
    name: '道具主图抽卡',
    description: '快速抽取道具主图候选，默认纯背景、单主体。',
    mode: 'prop_single',
    sort_order: 10,
    is_default: 0,
    prompt_template: 'Single prop product-style hero image, one object only, clean seamless solid-color studio background, readable silhouette, material, scale, wear, and craftsmanship.',
    negative_prompt_template: 'hands, people, table, floor, environment, extra objects, text, watermark',
    options: { output_role: 'candidate', candidate_count: 4 },
  },
  {
    preset_type: 'prop',
    preset_key: 'prop_four_view',
    name: '道具四视图',
    description: '用于道具长期复用：正面、侧面、背面、顶视图或结构视角，默认规范。',
    mode: 'prop_single',
    sort_order: 20,
    is_default: 1,
    prompt_template: 'Create a prop turnaround reference sheet in one image: front view, side view, back view, top or structural view; the same object, same scale, same material, clean seamless solid-color background.',
    negative_prompt_template: 'different objects, extra props, hands, people, environment, text labels, watermark',
    options: { output_role: 'primary_reference', candidate_count: 1 },
  },
  {
    preset_type: 'prop',
    preset_key: 'prop_material_detail',
    name: '材质细节图',
    description: '强调材质、磨损、纹理、工艺、发光或机械结构细节。',
    mode: 'prop_single',
    sort_order: 30,
    is_default: 0,
    prompt_template: 'Close-up material detail reference of the same prop: texture, wear, seams, engravings, glow, scratches, craft details; no environment, no hand.',
    negative_prompt_template: 'full scene, hands, person, extra objects, unreadable material, text, watermark',
    options: { output_role: 'detail_reference', candidate_count: 2 },
  },
  {
    preset_type: 'prop',
    preset_key: 'prop_scale_reference',
    name: '尺寸比例参考',
    description: '用于把道具体量和真实尺度说清楚，减少分镜里道具比例失控。',
    mode: 'prop_single',
    sort_order: 40,
    is_default: 0,
    prompt_template: 'Emphasize believable physical scale and proportions of the prop, product-reference clarity, readable thickness, edges, handles or wearable parts when present; no scene context.',
    negative_prompt_template: 'giant scale ambiguity, environment, hands, people, extra objects, text, watermark',
    options: { output_role: 'scale_reference', candidate_count: 1 },
  },
  {
    preset_type: 'prop',
    preset_key: 'prop_story_state',
    name: '使用/剧情状态图',
    description: '用于破损、带血迹、能量激活、封存、使用后等剧情状态。',
    mode: 'prop_single',
    sort_order: 50,
    is_default: 0,
    prompt_template: 'Same prop in a story-state variant when specified: pristine, activated, damaged, worn, sealed, evidence-like; preserve identity and material consistency.',
    negative_prompt_template: 'new object, people, hands, environment, excessive gore, text, watermark',
    options: { output_role: 'state_reference', candidate_count: 2 },
  },
  {
    preset_type: 'prop',
    preset_key: 'prop_exploded_structure',
    name: '拆解/结构图',
    description: '用于机械、法器、载具部件等复杂道具的结构理解。',
    mode: 'prop_single',
    sort_order: 60,
    is_default: 0,
    prompt_template: 'Exploded or structural prop reference, readable construction and parts relationship, same material language, clean background, no annotation text unless explicitly requested.',
    negative_prompt_template: 'random parts, text labels, people, environment, watermark',
    options: { output_role: 'structure_reference', candidate_count: 1 },
  },
  {
    preset_type: 'storyboard',
    preset_key: 'storyboard_keyframe_sequence',
    name: '连贯关键帧组',
    description: '用于分镜图生成默认规范：按时间线生成 2/4/6/9/12 张关键帧。',
    mode: 'storyboard_keyframes',
    sort_order: 10,
    is_default: 1,
    prompt_template: 'Maintain continuity across keyframes: same scene, same characters, same props, readable action progression, cinematic shot design.',
    negative_prompt_template: 'identity drift, scene drift, costume changes, split panels when not requested, text, watermark',
    options: { output_role: 'keyframe_sequence' },
  },
  {
    preset_type: 'storyboard',
    preset_key: 'storyboard_first_last',
    name: '首尾帧',
    description: '用于视频首尾状态明确的镜头，强调动作开始和结束状态。',
    mode: 'storyboard_first_last',
    sort_order: 20,
    is_default: 0,
    prompt_template: 'First and last frame should clearly define start state and end state, same spatial layout, controlled movement direction, no continuity contradictions.',
    negative_prompt_template: 'layout mismatch, identity drift, inconsistent props, text, watermark',
    options: { output_role: 'first_last_pair' },
  },
  {
    preset_type: 'storyboard',
    preset_key: 'storyboard_motion_guide',
    name: '运动线稿',
    description: '用于复杂动作、追逐、打斗、镜头移动的运动方向参考。',
    mode: 'storyboard_aux_motion',
    sort_order: 30,
    is_default: 0,
    prompt_template: 'Motion guide reference: clear action direction, body movement arc, camera movement intent, readable staging and timing.',
    negative_prompt_template: 'unclear motion, chaotic pose, text, watermark',
    options: { output_role: 'auxiliary_reference' },
  },
  {
    preset_type: 'storyboard',
    preset_key: 'storyboard_composition',
    name: '构图稿',
    description: '用于画面构图、前中后景、主体位置和镜头情绪。',
    mode: 'storyboard_aux_composition',
    sort_order: 40,
    is_default: 0,
    prompt_template: 'Composition reference: foreground, midground, background, subject placement, camera angle, lighting direction, emotional framing.',
    negative_prompt_template: 'flat framing, cluttered composition, text, watermark',
    options: { output_role: 'auxiliary_reference' },
  },
  {
    preset_type: 'storyboard',
    preset_key: 'storyboard_pose_reference',
    name: '姿态参考',
    description: '用于角色动作、表演、站位和互动姿态。',
    mode: 'storyboard_aux_pose',
    sort_order: 50,
    is_default: 0,
    prompt_template: 'Pose reference for the storyboard: expressive body language, clear silhouette, believable weight, interaction with props or other characters when present.',
    negative_prompt_template: 'broken anatomy, unreadable pose, identity drift, text, watermark',
    options: { output_role: 'auxiliary_reference' },
  },
  {
    preset_type: 'storyboard',
    preset_key: 'storyboard_camera_path',
    name: '镜头路径/机位图',
    description: '用于镜头运动、机位切换和空间调度参考。',
    mode: 'storyboard_aux_camera',
    sort_order: 60,
    is_default: 0,
    prompt_template: 'Camera path reference: clear spatial route, camera height, direction, lens feel, start and end framing, staging consistency.',
    negative_prompt_template: 'confusing space, text labels, watermark, layout mismatch',
    options: { output_role: 'auxiliary_reference' },
  },
];

function safeJsonParse(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch (_) {
    return fallback;
  }
}

function normalizeType(type) {
  const value = String(type || '').trim();
  if (!VALID_TYPES.has(value)) throw new Error('无效的工作流类型');
  return value;
}

function tableExists(db) {
  try {
    db.prepare('SELECT 1 FROM workflow_presets LIMIT 1').get();
    return true;
  } catch (_) {
    return false;
  }
}

function ensureTable(db) {
  if (tableExists(db)) return;
  db.exec(`CREATE TABLE IF NOT EXISTS workflow_presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    preset_type TEXT NOT NULL,
    preset_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    description TEXT,
    mode TEXT NOT NULL DEFAULT 'default',
    prompt_template TEXT,
    negative_prompt_template TEXT,
    options_json TEXT,
    is_active INTEGER DEFAULT 1,
    is_default INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_by_user_id TEXT,
    updated_by_user_id TEXT,
    created_at TEXT,
    updated_at TEXT,
    deleted_at TEXT
  )`);
}

function toRow(item) {
  const options = item.options_json !== undefined ? safeJsonParse(item.options_json, {}) : (item.options || {});
  return {
    id: item.id,
    preset_type: item.preset_type,
    preset_key: item.preset_key,
    name: item.name || '',
    description: item.description || '',
    mode: item.mode || 'default',
    prompt_template: item.prompt_template || '',
    negative_prompt_template: item.negative_prompt_template || '',
    options,
    is_active: Number(item.is_active) === 1,
    is_default: Number(item.is_default) === 1,
    sort_order: Number(item.sort_order) || 0,
    created_at: item.created_at || null,
    updated_at: item.updated_at || null,
  };
}

function seedDefaults(db, log) {
  ensureTable(db);
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO workflow_presets (
      preset_type, preset_key, name, description, mode, prompt_template,
      negative_prompt_template, options_json, is_active, is_default,
      sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const updateMissing = db.prepare(
    `UPDATE workflow_presets
     SET name = COALESCE(NULLIF(name, ''), ?),
         description = COALESCE(description, ?),
         mode = COALESCE(NULLIF(mode, ''), ?),
         prompt_template = COALESCE(prompt_template, ?),
         negative_prompt_template = COALESCE(negative_prompt_template, ?),
         options_json = COALESCE(options_json, ?),
         sort_order = CASE WHEN sort_order IS NULL OR sort_order = 0 THEN ? ELSE sort_order END,
         updated_at = COALESCE(updated_at, ?)
     WHERE preset_key = ?`
  );
  for (const preset of DEFAULT_PRESETS) {
    const existing = db.prepare('SELECT id FROM workflow_presets WHERE preset_key = ?').get(preset.preset_key);
    const optionsJson = JSON.stringify(preset.options || {});
    if (!existing) {
      insert.run(
        preset.preset_type,
        preset.preset_key,
        preset.name,
        preset.description,
        preset.mode,
        preset.prompt_template,
        preset.negative_prompt_template,
        optionsJson,
        1,
        preset.is_default ? 1 : 0,
        preset.sort_order,
        now,
        now
      );
    } else {
      updateMissing.run(
        preset.name,
        preset.description,
        preset.mode,
        preset.prompt_template,
        preset.negative_prompt_template,
        optionsJson,
        preset.sort_order,
        now,
        preset.preset_key
      );
    }
  }
  try {
    for (const type of VALID_TYPES) ensureOneDefault(db, type);
  } catch (err) {
    log?.warn?.('workflow preset default seed warning', { error: err.message });
  }
}

function ensureOneDefault(db, type) {
  const t = normalizeType(type);
  const existing = db.prepare(
    `SELECT id FROM workflow_presets
     WHERE preset_type = ? AND deleted_at IS NULL AND is_active = 1 AND is_default = 1
     ORDER BY sort_order ASC, id ASC LIMIT 1`
  ).get(t);
  if (existing) return existing.id;
  const first = db.prepare(
    `SELECT id FROM workflow_presets
     WHERE preset_type = ? AND deleted_at IS NULL AND is_active = 1
     ORDER BY sort_order ASC, id ASC LIMIT 1`
  ).get(t);
  if (!first) return null;
  db.prepare('UPDATE workflow_presets SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE preset_type = ? AND deleted_at IS NULL')
    .run(first.id, t);
  return first.id;
}

function listPresets(db, filters = {}) {
  seedDefaults(db);
  const where = ['deleted_at IS NULL'];
  const params = [];
  if (filters.type) {
    where.push('preset_type = ?');
    params.push(normalizeType(filters.type));
  }
  if (filters.activeOnly) where.push('is_active = 1');
  const rows = db.prepare(
    `SELECT * FROM workflow_presets WHERE ${where.join(' AND ')}
     ORDER BY preset_type ASC, sort_order ASC, id ASC`
  ).all(...params);
  return rows.map(toRow);
}

function getPresetById(db, id) {
  seedDefaults(db);
  const row = db.prepare('SELECT * FROM workflow_presets WHERE id = ? AND deleted_at IS NULL').get(Number(id));
  return row ? toRow(row) : null;
}

function getDefaultPreset(db, type) {
  seedDefaults(db);
  const t = normalizeType(type);
  ensureOneDefault(db, t);
  const row = db.prepare(
    `SELECT * FROM workflow_presets
     WHERE preset_type = ? AND deleted_at IS NULL AND is_active = 1 AND is_default = 1
     ORDER BY sort_order ASC, id ASC LIMIT 1`
  ).get(t);
  return row ? toRow(row) : null;
}

function resolvePreset(db, type, id) {
  seedDefaults(db);
  const t = normalizeType(type);
  if (id != null && String(id).trim() !== '') {
    const row = db.prepare(
      'SELECT * FROM workflow_presets WHERE id = ? AND preset_type = ? AND deleted_at IS NULL AND is_active = 1'
    ).get(Number(id), t);
    if (row) return toRow(row);
  }
  return getDefaultPreset(db, t);
}

function normalizePayload(payload = {}, existing = null) {
  const presetType = normalizeType(payload.preset_type || existing?.preset_type);
  const name = String(payload.name ?? existing?.name ?? '').trim();
  if (!name) throw new Error('规范名称必填');
  const presetKey = String(payload.preset_key || existing?.preset_key || `${presetType}_${Date.now()}`).trim();
  const options = payload.options !== undefined ? payload.options : (payload.options_json !== undefined ? safeJsonParse(payload.options_json, {}) : existing?.options || {});
  return {
    preset_type: presetType,
    preset_key: presetKey,
    name,
    description: payload.description ?? existing?.description ?? '',
    mode: String(payload.mode || existing?.mode || 'default').trim() || 'default',
    prompt_template: payload.prompt_template ?? existing?.prompt_template ?? '',
    negative_prompt_template: payload.negative_prompt_template ?? existing?.negative_prompt_template ?? '',
    options_json: JSON.stringify(options || {}),
    is_active: payload.is_active === undefined ? (existing ? (existing.is_active ? 1 : 0) : 1) : (payload.is_active ? 1 : 0),
    is_default: payload.is_default === undefined ? (existing ? (existing.is_default ? 1 : 0) : 0) : (payload.is_default ? 1 : 0),
    sort_order: Number(payload.sort_order ?? existing?.sort_order ?? 0) || 0,
  };
}

function createPreset(db, payload, user = null) {
  seedDefaults(db);
  const data = normalizePayload(payload);
  const now = new Date().toISOString();
  const info = db.prepare(
    `INSERT INTO workflow_presets (
      preset_type, preset_key, name, description, mode, prompt_template,
      negative_prompt_template, options_json, is_active, is_default, sort_order,
      created_by_user_id, updated_by_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    data.preset_type,
    data.preset_key,
    data.name,
    data.description,
    data.mode,
    data.prompt_template,
    data.negative_prompt_template,
    data.options_json,
    data.is_active,
    data.is_default,
    data.sort_order,
    user?.id || null,
    user?.id || null,
    now,
    now
  );
  if (data.is_default) setDefaultPreset(db, info.lastInsertRowid, user);
  return getPresetById(db, info.lastInsertRowid);
}

function updatePreset(db, id, payload, user = null) {
  seedDefaults(db);
  const existing = getPresetById(db, id);
  if (!existing) return null;
  const data = normalizePayload(payload, existing);
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE workflow_presets
     SET preset_type = ?, preset_key = ?, name = ?, description = ?, mode = ?,
         prompt_template = ?, negative_prompt_template = ?, options_json = ?,
         is_active = ?, is_default = ?, sort_order = ?, updated_by_user_id = ?, updated_at = ?
     WHERE id = ? AND deleted_at IS NULL`
  ).run(
    data.preset_type,
    data.preset_key,
    data.name,
    data.description,
    data.mode,
    data.prompt_template,
    data.negative_prompt_template,
    data.options_json,
    data.is_active,
    data.is_default,
    data.sort_order,
    user?.id || null,
    now,
    Number(id)
  );
  if (data.is_default) setDefaultPreset(db, id, user);
  else ensureOneDefault(db, data.preset_type);
  return getPresetById(db, id);
}

function setDefaultPreset(db, id, user = null) {
  seedDefaults(db);
  const row = db.prepare('SELECT id, preset_type FROM workflow_presets WHERE id = ? AND deleted_at IS NULL').get(Number(id));
  if (!row) return null;
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE workflow_presets
     SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END,
         is_active = CASE WHEN id = ? THEN 1 ELSE is_active END,
         updated_by_user_id = CASE WHEN id = ? THEN ? ELSE updated_by_user_id END,
         updated_at = CASE WHEN id = ? THEN ? ELSE updated_at END
     WHERE preset_type = ? AND deleted_at IS NULL`
  ).run(Number(id), Number(id), Number(id), user?.id || null, Number(id), now, row.preset_type);
  return getPresetById(db, id);
}

function deletePreset(db, id) {
  seedDefaults(db);
  const row = getPresetById(db, id);
  if (!row) return false;
  db.prepare('UPDATE workflow_presets SET deleted_at = ?, is_default = 0 WHERE id = ?')
    .run(new Date().toISOString(), Number(id));
  ensureOneDefault(db, row.preset_type);
  return true;
}

function mergePrompt(basePrompt, preset) {
  const base = String(basePrompt || '').trim();
  const extra = String(preset?.prompt_template || '').trim();
  if (!extra) return base;
  return `${base}\n\n[Workflow preset: ${preset.name}]\n${extra}`;
}

function mergeNegative(baseNegative, preset) {
  const base = String(baseNegative || '').trim();
  const extra = String(preset?.negative_prompt_template || '').trim();
  if (!base) return extra;
  if (!extra) return base;
  return `${base}, ${extra}`;
}

module.exports = {
  DEFAULT_PRESETS,
  VALID_TYPES,
  seedDefaults,
  listPresets,
  getPresetById,
  getDefaultPreset,
  resolvePreset,
  createPreset,
  updatePreset,
  setDefaultPreset,
  deletePreset,
  mergePrompt,
  mergeNegative,
};
