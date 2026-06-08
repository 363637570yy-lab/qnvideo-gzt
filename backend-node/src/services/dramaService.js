// 对应 Go application/services/drama_service.go

const storageLayout = require('./storageLayout');
const { resolveStylePreset } = require('../constants/generationStylePresets');
const seedance2AssetGuards = require('../utils/seedance2AssetGuards');

const DEFAULT_PROJECT_STYLE = 'xianxia 3d';

/**
 * 清理 image_url：如果数据库中存储的是 base64 data URL，则返回 null。
 * 图片应通过 local_path → /static/{local_path} 访问，base64 不应通过 API 透传（会严重膨胀响应体）。
 */
function sanitizeImageUrl(url) {
  if (!url) return null;
  if (String(url).startsWith('data:')) return null;
  return url;
}

function parseJsonColumn(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function defaultProjectMetadata(style = DEFAULT_PROJECT_STYLE) {
  const preset = resolveStylePreset(style) || resolveStylePreset(DEFAULT_PROJECT_STYLE);
  return {
    aspect_ratio: '16:9',
    image_spec: { mode: 'ratio', tier: '4K', ratio: 'follow_project', width: 3840, height: 2160 },
    video_spec: { mode: 'ratio', tier: '720p', ratio: 'follow_project' },
    video_clip_duration: 10,
    script_language: 'zh',
    ...(preset ? { style_prompt_zh: preset.zh, style_prompt_en: preset.en } : {}),
  };
}

function resolveProjectClipDuration(metadata, fallback = 10) {
  const meta = parseJsonColumn(metadata) || {};
  const value = Number(meta.video_clip_duration);
  return Number.isFinite(value) && value > 0 ? Math.min(120, Math.max(1, value)) : fallback;
}

function createDrama(db, log, req) {
  const now = new Date().toISOString();
  const styleValue = req.style || DEFAULT_PROJECT_STYLE;
  let meta = defaultProjectMetadata(styleValue);
  if (req.metadata) {
    try {
      const incoming =
        typeof req.metadata === 'string'
          ? JSON.parse(req.metadata)
          : { ...req.metadata };
      meta = { ...meta, ...(incoming && typeof incoming === 'object' ? incoming : {}) };
    } catch (_) {
      meta = defaultProjectMetadata(styleValue);
    }
  }
  if (!meta.style_prompt_zh && !meta.style_prompt_en) {
    const preset = resolveStylePreset(styleValue);
    if (preset) {
      meta.style_prompt_zh = preset.zh;
      meta.style_prompt_en = preset.en;
    }
  }
  if (!meta.storage_folder_label) {
    meta.storage_folder_label = storageLayout.sanitizeFolderLabel(req.title || '');
  }
  const metadataStr = Object.keys(meta).length ? JSON.stringify(meta) : null;
  const stmt = db.prepare(`
    INSERT INTO dramas (title, description, genre, style, metadata, status, owner_user_id, created_by_user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)
  `);
  const info = stmt.run(
    req.title || '',
    req.description || null,
    req.genre || null,
    styleValue,
    metadataStr,
    req.owner_user_id || null,
    req.created_by_user_id || req.owner_user_id || null,
    now,
    now
  );
  const id = info.lastInsertRowid;
  log.info('Drama created', { drama_id: id });
  return getDramaById(db, id);
}

function getDramaById(db, id) {
  const row = db.prepare('SELECT * FROM dramas WHERE id = ? AND deleted_at IS NULL').get(id);
  return row ? rowToDrama(row) : null;
}

function placeholders(items) {
  return items.map(() => '?').join(',');
}

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows || []) {
    const groupKey = row[key];
    const list = map.get(groupKey) || [];
    list.push(row);
    map.set(groupKey, list);
  }
  return map;
}

function getDrama(db, dramaId, baseUrl) {
  const drama = getDramaById(db, Number(dramaId));
  if (!drama) return null;
  // 加载 episodes、characters、scenes、props、storyboards（详情页需要完整数据，但用批量查询避免 N+1）
  const episodes = db.prepare(
    'SELECT * FROM episodes WHERE drama_id = ? AND deleted_at IS NULL ORDER BY episode_number ASC'
  ).all(drama.id);
  drama.episodes = episodes.map((e) => rowToEpisode(e));
  const { dedupeStoryboardRowsByNumber } = require('./episodeStoryboardService');

  const episodeIds = drama.episodes.map((ep) => ep.id);
  const epById = new Map(drama.episodes.map((ep) => [Number(ep.id), ep]));
  for (const ep of drama.episodes) {
    ep.storyboards = [];
    ep.characters = [];
    ep.scenes = [];
    ep.props = [];
  }

  if (episodeIds.length > 0) {
    const epPh = placeholders(episodeIds);
    const storyboardRows = db.prepare(
      `SELECT * FROM storyboards WHERE episode_id IN (${epPh}) AND deleted_at IS NULL ORDER BY episode_id ASC, storyboard_number ASC, id ASC`
    ).all(...episodeIds);
    const storyboardsByEpisode = groupBy(storyboardRows, 'episode_id');
    for (const ep of drama.episodes) {
      const storyboards = dedupeStoryboardRowsByNumber(storyboardsByEpisode.get(ep.id) || []);
      ep.storyboards = storyboards.map((s) => rowToStoryboard(s));
    }

    try {
      const sbIds = drama.episodes.flatMap((ep) => ep.storyboards.map((s) => s.id));
      if (sbIds.length > 0) {
        const spRows = db.prepare(
          `SELECT storyboard_id, prop_id FROM storyboard_props WHERE storyboard_id IN (${placeholders(sbIds)})`
        ).all(...sbIds);
        const spMap = groupBy(spRows, 'storyboard_id');
        for (const ep of drama.episodes) {
          for (const sb of ep.storyboards) {
            sb.prop_ids = (spMap.get(sb.id) || []).map((row) => row.prop_id);
          }
        }
      }
    } catch (_) {}

    try {
      const epChars = db.prepare(
        `SELECT ec.episode_id AS _episode_id, c.* FROM characters c
         INNER JOIN episode_characters ec ON c.id = ec.character_id
         WHERE ec.episode_id IN (${epPh}) AND c.deleted_at IS NULL
         ORDER BY ec.episode_id ASC, c.sort_order ASC, c.name ASC`
      ).all(...episodeIds);
      for (const row of epChars) {
        const ep = epById.get(Number(row._episode_id));
        if (ep) ep.characters.push(rowToCharacter(row));
      }
    } catch (_) {}

    try {
      const epScenes = db.prepare(
        `SELECT * FROM scenes WHERE episode_id IN (${epPh}) AND deleted_at IS NULL ORDER BY episode_id ASC, id ASC`
      ).all(...episodeIds);
      for (const row of epScenes) {
        const ep = epById.get(Number(row.episode_id));
        if (ep) ep.scenes.push(rowToScene(row));
      }
    } catch (_) {}

    try {
      const byEpisode = db.prepare(
        `SELECT * FROM props WHERE episode_id IN (${epPh}) AND deleted_at IS NULL ORDER BY episode_id ASC, id ASC`
      ).all(...episodeIds);
      const byStoryboard = db.prepare(
        `SELECT DISTINCT sb.episode_id AS _episode_id, p.* FROM props p
         INNER JOIN storyboard_props sp ON p.id = sp.prop_id
         INNER JOIN storyboards sb ON sb.id = sp.storyboard_id AND sb.episode_id IN (${epPh}) AND sb.deleted_at IS NULL
         WHERE p.deleted_at IS NULL ORDER BY _episode_id ASC, p.id ASC`
      ).all(...episodeIds);
      const seenByEpisode = new Map();
      const pushProp = (epId, propRow) => {
        const ep = epById.get(Number(epId));
        if (!ep) return;
        const seen = seenByEpisode.get(ep.id) || new Set();
        if (seen.has(Number(propRow.id))) return;
        seen.add(Number(propRow.id));
        seenByEpisode.set(ep.id, seen);
        ep.props.push(rowToProp(propRow));
      };
      for (const row of byEpisode) pushProp(row.episode_id, row);
      for (const row of byStoryboard) pushProp(row._episode_id, row);
      for (const ep of drama.episodes) ep.props.sort((a, b) => a.id - b.id);
    } catch (_) {}
  }

  for (const ep of drama.episodes) {
    ep.duration = ep.storyboards.reduce((sum, s) => sum + (s.duration || 0), 0);
    if (ep.duration > 0) ep.duration = Math.ceil(ep.duration / 60); // 转为分钟
  }
  const characters = db.prepare(
    'SELECT * FROM characters WHERE drama_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC, name ASC'
  ).all(drama.id);
  drama.characters = characters.map((c) => rowToCharacter(c));
  const scenes = db.prepare(
    'SELECT * FROM scenes WHERE drama_id = ? AND deleted_at IS NULL ORDER BY id ASC'
  ).all(drama.id);
  drama.scenes = scenes.map((s) => rowToScene(s));
  const props = db.prepare(
    'SELECT * FROM props WHERE drama_id = ? AND deleted_at IS NULL ORDER BY id ASC'
  ).all(drama.id);
  drama.props = props.map((p) => rowToProp(p));
  return drama;
}

function listDramas(db, query) {
  let sql = 'FROM dramas WHERE deleted_at IS NULL';
  const params = [];
  if (query.user && query.user.role !== 'admin') {
    sql += ' AND owner_user_id = ?';
    params.push(query.user.id);
  } else if (query.user?.role === 'admin' && query.owner_user_id) {
    sql += ' AND owner_user_id = ?';
    params.push(String(query.owner_user_id));
  }
  if (query.status) {
    sql += ' AND status = ?';
    params.push(query.status);
  }
  if (query.genre) {
    sql += ' AND genre = ?';
    params.push(query.genre);
  }
  if (query.keyword) {
    sql += ' AND (title LIKE ? OR description LIKE ?)';
    const k = '%' + query.keyword + '%';
    params.push(k, k);
  }
  const countRow = db.prepare('SELECT COUNT(*) as total ' + sql).get(...params);
  const total = countRow.total || 0;
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(query.page_size, 10) || 20));
  const offset = (page - 1) * pageSize;
  const list = db.prepare(
    'SELECT * ' + sql + ' ORDER BY updated_at DESC LIMIT ? OFFSET ?'
  ).all(...params, pageSize, offset);
  const dramas = list.map((r) => rowToDrama(r));
  const dramaIds = dramas.map((d) => d.id);
  for (const d of dramas) {
    d.episodes = [];
    d.episode_count = 0;
    d.storyboard_count = 0;
  }
  if (dramaIds.length > 0) {
    const idsPh = placeholders(dramaIds);
    const epRows = db.prepare(
      `SELECT id, drama_id, episode_number, title, NULL AS script_content, description, duration, video_url, thumbnail, status, created_at, updated_at
       FROM episodes
       WHERE drama_id IN (${idsPh}) AND deleted_at IS NULL
       ORDER BY drama_id ASC, episode_number ASC`
    ).all(...dramaIds);
    const aggRows = db.prepare(
      `SELECT e.id AS episode_id,
              COUNT(DISTINCT COALESCE(NULLIF(sb.storyboard_number, 0), sb.id)) AS storyboard_count,
              COALESCE(SUM(COALESCE(sb.duration, 0)), 0) AS storyboard_duration
       FROM episodes e
       LEFT JOIN storyboards sb ON sb.episode_id = e.id AND sb.deleted_at IS NULL
       WHERE e.drama_id IN (${idsPh}) AND e.deleted_at IS NULL
       GROUP BY e.id`
    ).all(...dramaIds);
    const aggByEpisode = new Map(aggRows.map((row) => [Number(row.episode_id), row]));
    const byDrama = groupBy(epRows, 'drama_id');
    for (const d of dramas) {
      d.episodes = (byDrama.get(d.id) || []).map((row) => {
        const ep = rowToEpisode(row);
        const agg = aggByEpisode.get(Number(ep.id));
        ep.storyboard_count = Number(agg?.storyboard_count || 0);
        ep.duration = ep.storyboard_count > 0
          ? Math.ceil(Number(agg?.storyboard_duration || 0) / 60)
          : (ep.duration || 0);
        return ep;
      });
      d.episode_count = d.episodes.length;
      d.storyboard_count = d.episodes.reduce((sum, ep) => sum + Number(ep.storyboard_count || 0), 0);
    }
  }
  return { dramas, total, page, pageSize };
}

function updateDrama(db, log, dramaId, req) {
  const drama = getDramaById(db, Number(dramaId));
  if (!drama) return null;
  const updates = [];
  const params = [];
  if (req.title != null) {
    updates.push('title = ?');
    params.push(req.title);
  }
  if (req.description != null) {
    updates.push('description = ?');
    params.push(req.description || null);
  }
  if (req.genre != null) {
    updates.push('genre = ?');
    params.push(req.genre || null);
  }
  if (req.status != null) {
    updates.push('status = ?');
    params.push(req.status);
  }
  if (updates.length === 0) return drama;
  params.push(new Date().toISOString(), dramaId);
  db.prepare(
    'UPDATE dramas SET ' + updates.join(', ') + ', updated_at = ? WHERE id = ?'
  ).run(...params);
  log.info('Drama updated', { drama_id: dramaId });
  return getDramaById(db, dramaId);
}

function generateStoryboard(db, log, episodeId, options) {
  const episodeStoryboardService = require('./episodeStoryboardService');
  const { model, style, storyboard_count, video_duration, video_clip_duration, aspect_ratio, language, include_narration, universal_omni_storyboard, ai_config_id, text_config_id, user } = options || {};
  // 转换可能为字符串的数字
  const count = storyboard_count ? Number(storyboard_count) : undefined;
  const duration = video_duration ? Number(video_duration) : undefined;
  return episodeStoryboardService.generateStoryboard(
    db,
    log,
    episodeId,
    model || undefined,
    style,
    count,
    duration,
    aspect_ratio,
    language,
    include_narration,
    universal_omni_storyboard,
    ai_config_id || text_config_id || null,
    user,
    video_clip_duration
  );
}

function deleteDrama(db, log, dramaId) {
  const result = db.prepare('UPDATE dramas SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL').run(
    new Date().toISOString(),
    Number(dramaId)
  );
  if (result.changes === 0) return false;
  log.info('Drama deleted', { drama_id: dramaId });
  return true;
}

function getDramaStats(db, user) {
  let where = 'WHERE deleted_at IS NULL';
  const params = [];
  if (user && user.role !== 'admin') {
    where += ' AND owner_user_id = ?';
    params.push(user.id);
  }
  const total = db.prepare(`SELECT COUNT(*) as c FROM dramas ${where}`).get(...params).c;
  const byStatus = db.prepare(
    `SELECT status, COUNT(*) as count FROM dramas ${where} GROUP BY status`
  ).all(...params);
  return { total, by_status: byStatus };
}

function rowToDrama(r) {
  let metadata = r.metadata;
  if (typeof metadata === 'string') {
    try {
      metadata = JSON.parse(metadata);
    } catch (e) {
      metadata = {};
    }
  }
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    genre: r.genre,
    style: r.style || 'realistic',
    total_episodes: r.total_episodes ?? 1,
    total_duration: r.total_duration ?? 0,
    status: r.status || 'draft',
    thumbnail: r.thumbnail,
    tags: r.tags,
    owner_user_id: r.owner_user_id || null,
    created_by_user_id: r.created_by_user_id || null,
    metadata: metadata || {},
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function rowToEpisode(r) {
  return {
    id: r.id,
    drama_id: r.drama_id,
    episode_number: r.episode_number,
    title: r.title,
    script_content: r.script_content,
    description: r.description,
    duration: r.duration ?? 0,
    status: r.status || 'draft',
    video_url: r.video_url,
    thumbnail: r.thumbnail,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function parseStoryboardCharacters(charactersStr) {
  if (!charactersStr || typeof charactersStr !== 'string') return [];
  try {
    const parsed = JSON.parse(charactersStr);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((c) => (typeof c === 'object' && c != null && c.id != null ? Number(c.id) : Number(c))).filter((n) => Number.isFinite(n));
  } catch (_) {
    return [];
  }
}

function rowToStoryboard(r) {
  return {
    id: r.id,
    episode_id: r.episode_id,
    scene_id: r.scene_id,
    storyboard_number: r.storyboard_number,
    title: r.title,
    description: r.description,
    location: r.location,
    time: r.time,
    duration: r.duration ?? 0,
    dialogue: r.dialogue,
    narration: r.narration ?? null,
    action: r.action,
    result: r.result ?? null,
    atmosphere: r.atmosphere,
    image_prompt: r.image_prompt,
    polished_prompt: r.polished_prompt ?? null,
    continuity_snapshot: r.continuity_snapshot ?? null,
    video_prompt: r.video_prompt,
      shot_type: r.shot_type ?? null,
      angle: r.angle ?? null,
      angle_h: r.angle_h ?? null,
      angle_v: r.angle_v ?? null,
      angle_s: r.angle_s ?? null,
      movement: r.movement ?? null,
      lighting_style: r.lighting_style ?? null,
      depth_of_field: r.depth_of_field ?? null,
      segment_index: r.segment_index ?? 0,
      segment_title: r.segment_title ?? null,
      creation_mode: r.creation_mode === 'universal' ? 'universal' : 'classic',
      universal_segment_text: r.universal_segment_text ?? null,
      characters: parseStoryboardCharacters(r.characters),
      composed_image: r.composed_image,
      image_url: sanitizeImageUrl(r.image_url),
      local_path: r.local_path ?? null,
      main_panel_idx: r.main_panel_idx != null ? Number(r.main_panel_idx) : null,
      video_url: r.video_url,
      audio_local_path: r.audio_local_path ?? null,
      narration_audio_local_path: r.narration_audio_local_path ?? null,
      status: r.status || 'pending',
      error_msg: r.error_msg,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
}

function rowToCharacter(r) {
  return {
    id: r.id,
    drama_id: r.drama_id,
    name: r.name,
    role: r.role,
    description: r.description,
    appearance: r.appearance,
    personality: r.personality,
    voice_style: r.voice_style,
    image_url: sanitizeImageUrl(r.image_url),
    local_path: r.local_path,
    extra_images: r.extra_images || null,
    ref_image: r.ref_image || null,
    reference_images: r.reference_images,
    seed_value: r.seed_value,
    sort_order: r.sort_order ?? 0,
    error_msg: r.error_msg,
    polished_prompt: r.polished_prompt || null,
    negative_prompt: r.negative_prompt || null,
    four_view_image_url: r.four_view_image_url || null,
    seedance2_asset: parseJsonColumn(r.seedance2_asset),
    seedance2_voice_asset: parseJsonColumn(r.seedance2_voice_asset),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function rowToScene(r) {
  return {
    id: r.id,
    drama_id: r.drama_id,
    location: r.location,
    time: r.time,
    prompt: r.prompt,
    polished_prompt: r.polished_prompt || null,
    negative_prompt: r.negative_prompt || null,
    storyboard_count: r.storyboard_count ?? 1,
    image_url: sanitizeImageUrl(r.image_url),
    local_path: r.local_path,
    extra_images: r.extra_images || null,
    ref_image: r.ref_image || null,
    status: r.status || 'pending',
    error_msg: r.error_msg,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function rowToProp(r) {
  return {
    id: r.id,
    drama_id: r.drama_id,
    name: r.name,
    type: r.type,
    description: r.description,
    prompt: r.prompt,
    image_url: sanitizeImageUrl(r.image_url),
    local_path: r.local_path,
    extra_images: r.extra_images || null,
    ref_image: r.ref_image || null,
    negative_prompt: r.negative_prompt || null,
    error_msg: r.error_msg,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function saveOutline(db, log, dramaId, req) {
  const drama = getDramaById(db, Number(dramaId));
  if (!drama) return false;
  const now = new Date().toISOString();
  const hasTags = Object.prototype.hasOwnProperty.call(req, 'tags');
  const tagsStr = hasTags ? (Array.isArray(req.tags) ? JSON.stringify(req.tags) : null) : drama.tags;
  // Merge new metadata with existing metadata
  let existingMetadata = {};
  if (drama.metadata) {
    try {
      existingMetadata = typeof drama.metadata === 'string' ? JSON.parse(drama.metadata) : drama.metadata;
    } catch (e) {
      existingMetadata = {};
    }
  }
  let newMetadata = {};
  if (req.metadata) {
    try {
      newMetadata = typeof req.metadata === 'string' ? JSON.parse(req.metadata) : req.metadata;
    } catch (e) {
      newMetadata = {};
    }
  }
  const mergedMetadata = { ...existingMetadata, ...newMetadata };

  // 与 mergeCfgStyleWithDrama 一致：提示词优先读 metadata.style_prompt_*。仅改 dramas.style 而不带画风长文案时，
  // 若仍保留旧的 metadata 画风，会出现「列表/首页 badge 已是新 style，角色提示词却仍用旧画风」。
  if (req.style !== undefined) {
    const styleVal = String(req.style || '').trim();
    const hasExplicitStylePrompt =
      req.metadata &&
      typeof req.metadata === 'object' &&
      !Array.isArray(req.metadata) &&
      ('style_prompt_zh' in req.metadata || 'style_prompt_en' in req.metadata);
    if (!hasExplicitStylePrompt && styleVal) {
      const preset = resolveStylePreset(styleVal);
      if (preset) {
        mergedMetadata.style_prompt_zh = preset.zh;
        mergedMetadata.style_prompt_en = preset.en;
      }
    }
  }

  const metadataStr = JSON.stringify(mergedMetadata);
  
  db.prepare(
    `UPDATE dramas SET title = ?, description = ?, genre = ?, tags = ?, style = ?, metadata = ?, updated_at = ? WHERE id = ?`
  ).run(
    req.title || drama.title, 
    req.summary ?? drama.description, 
    req.genre !== undefined ? req.genre : drama.genre, 
    tagsStr, 
    req.style !== undefined ? req.style : drama.style, 
    metadataStr, 
    now, 
    dramaId
  );
  log.info('Outline saved', { drama_id: dramaId, style: req.style, genre: req.genre, metadata: mergedMetadata });
  return true;
}

function getCharacters(db, dramaId, episodeId) {
  const did = Number(dramaId);
  const drama = getDramaById(db, did);
  if (!drama) return null;
  let rows;
  if (episodeId) {
    const exists = db.prepare('SELECT 1 FROM episodes WHERE id = ? AND drama_id = ?').get(episodeId, did);
    if (!exists) return null;
    rows = db.prepare(
      `SELECT c.* FROM characters c
       INNER JOIN episode_characters ec ON ec.character_id = c.id
       WHERE ec.episode_id = ? AND c.deleted_at IS NULL ORDER BY c.sort_order ASC, c.name ASC`
    ).all(episodeId);
  } else {
    rows = db.prepare(
      'SELECT * FROM characters WHERE drama_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC, name ASC'
    ).all(did);
  }
  const characters = rows.map((r) => rowToCharacter(r));
  for (const c of characters) {
    const img = db.prepare(
      'SELECT status, error_msg FROM image_generations WHERE character_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(c.id);
    if (img && ['pending', 'processing', 'failed'].includes(img.status)) {
      c.image_generation_status = img.status;
      if (img.error_msg) c.image_generation_error = img.error_msg;
    }
  }
  return characters;
}

function saveCharacters(db, log, dramaId, req) {
  const did = Number(dramaId);
  const drama = getDramaById(db, did);
  if (!drama) return false;
  if (req.episode_id) {
    const ep = db.prepare('SELECT 1 FROM episodes WHERE id = ? AND drama_id = ?').get(req.episode_id, did);
    if (!ep) return false;
  }
  const characterIds = [];
  const chars = req.characters || [];
  for (const char of chars) {
    if (char.id) {
      const ex = db.prepare('SELECT id FROM characters WHERE id = ? AND drama_id = ?').get(char.id, did);
      if (ex) {
        characterIds.push(ex.id);
        // 只更新文本字段；image_url / local_path 仅在调用方显式传入时才覆盖，防止漏传字段清空已有图片
        const imgFields = [];
        const imgParams = [];
        if ('image_url' in char) { imgFields.push('image_url = ?'); imgParams.push(char.image_url ?? null); }
        if ('local_path' in char) { imgFields.push('local_path = ?'); imgParams.push(char.local_path ?? null); }
        if (imgFields.length > 0) {
          const prevC = db
            .prepare('SELECT id, local_path, image_url, seedance2_asset FROM characters WHERE id = ? AND deleted_at IS NULL')
            .get(char.id);
          if (prevC) {
            seedance2AssetGuards.markStaleOnCharacterMainImageDrift(db, log, prevC, {
              image_url: 'image_url' in char ? char.image_url : prevC.image_url,
              local_path: 'local_path' in char ? char.local_path : prevC.local_path,
            });
          }
        }
        const imgSql = imgFields.length > 0 ? ', ' + imgFields.join(', ') : '';
        let setCore = 'name = ?, role = ?, description = ?, personality = ?, appearance = ?';
        const coreParams = [char.name, char.role ?? null, char.description ?? null, char.personality ?? null, char.appearance ?? null];
        if ('negative_prompt' in char) {
          setCore += ', negative_prompt = ?';
          coreParams.push(char.negative_prompt ?? null);
        }
        db.prepare(
          `UPDATE characters SET ${setCore}${imgSql}, updated_at = ? WHERE id = ?`
        ).run(...coreParams, ...imgParams, new Date().toISOString(), char.id);
        continue;
      }
    }
    const byName = db.prepare('SELECT id FROM characters WHERE drama_id = ? AND name = ?').get(did, char.name);
    if (byName) {
      characterIds.push(byName.id);
      // 如果通过名字找到已存在的角色（包含软删除的），也要更新它的信息并复活
      const imgFieldsN = [];
      const imgParamsN = [];
      if ('image_url' in char) { imgFieldsN.push('image_url = ?'); imgParamsN.push(char.image_url ?? null); }
      if ('local_path' in char) { imgFieldsN.push('local_path = ?'); imgParamsN.push(char.local_path ?? null); }
      if (imgFieldsN.length > 0) {
        const prevN = db
          .prepare('SELECT id, local_path, image_url, seedance2_asset FROM characters WHERE id = ?')
          .get(byName.id);
        if (prevN) {
          seedance2AssetGuards.markStaleOnCharacterMainImageDrift(db, log, prevN, {
            image_url: 'image_url' in char ? char.image_url : prevN.image_url,
            local_path: 'local_path' in char ? char.local_path : prevN.local_path,
          });
        }
      }
      const imgSqlN = imgFieldsN.length > 0 ? ', ' + imgFieldsN.join(', ') : '';
      let setCoreN = 'role = ?, description = ?, personality = ?, appearance = ?';
      const coreParamsN = [char.role ?? null, char.description ?? null, char.personality ?? null, char.appearance ?? null];
      if ('negative_prompt' in char) {
        setCoreN += ', negative_prompt = ?';
        coreParamsN.push(char.negative_prompt ?? null);
      }
      db.prepare(
        `UPDATE characters SET ${setCoreN}${imgSqlN}, updated_at = ?, deleted_at = NULL WHERE id = ?`
      ).run(...coreParamsN, ...imgParamsN, new Date().toISOString(), byName.id);
      continue;
    }
    const now = new Date().toISOString();
    const info = db.prepare(
      `INSERT INTO characters (drama_id, name, role, description, personality, appearance, image_url, local_path, negative_prompt, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
    ).run(did, char.name, char.role ?? null, char.description ?? null, char.personality ?? null, char.appearance ?? null, char.image_url ?? null, char.local_path ?? null, char.negative_prompt ?? null, now, now);
    characterIds.push(info.lastInsertRowid);
  }
  if (req.episode_id && characterIds.length > 0) {
    db.prepare('DELETE FROM episode_characters WHERE episode_id = ?').run(req.episode_id);
    const ins = db.prepare('INSERT OR IGNORE INTO episode_characters (episode_id, character_id) VALUES (?, ?)');
    for (const cid of characterIds) ins.run(req.episode_id, cid);
  }
  db.prepare('UPDATE dramas SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), did);
  log.info('Characters saved', { drama_id: dramaId, count: chars.length });
  return true;
}

function saveEpisodes(db, log, dramaId, req) {
  const did = Number(dramaId);
  const drama = getDramaById(db, did);
  if (!drama) return false;
  const episodes = req.episodes || [];
  const now = new Date().toISOString();

  // 按 episode_number upsert：保留已有分集的 id，避免关联数据（角色/场景/道具/分镜）孤岛化
  const keptNumbers = new Set();
  for (const ep of episodes) {
    const num = ep.episode_number ?? 0;
    keptNumbers.add(num);
    // 查找已有的（包含软删除的，以防重新激活）
    const existing = db.prepare(
      'SELECT id FROM episodes WHERE drama_id = ? AND episode_number = ? ORDER BY deleted_at IS NOT NULL ASC, id ASC LIMIT 1'
    ).get(did, num);
    if (existing) {
      // 更新已有分集，保留 id
      db.prepare(
        `UPDATE episodes SET title = ?, script_content = ?, description = ?, duration = ?, deleted_at = NULL, updated_at = ? WHERE id = ?`
      ).run(ep.title || '', ep.script_content ?? null, ep.description ?? null, ep.duration ?? 0, now, existing.id);
    } else {
      // 新增
      db.prepare(
        `INSERT INTO episodes (drama_id, episode_number, title, script_content, description, duration, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)`
      ).run(did, num, ep.title || '', ep.script_content ?? null, ep.description ?? null, ep.duration ?? 0, now, now);
    }
  }

  // 软删除本次未提交的分集（如用户删掉了某一集）
  const liveEpisodes = db.prepare(
    'SELECT id, episode_number FROM episodes WHERE drama_id = ? AND deleted_at IS NULL'
  ).all(did);
  for (const row of liveEpisodes) {
    if (!keptNumbers.has(row.episode_number)) {
      db.prepare('UPDATE episodes SET deleted_at = ? WHERE id = ?').run(now, row.id);
    }
  }

  db.prepare('UPDATE dramas SET updated_at = ? WHERE id = ?').run(now, did);
  log.info('Episodes saved', { drama_id: dramaId, count: episodes.length });
  return true;
}

function saveProgress(db, log, dramaId, req) {
  const drama = getDramaById(db, Number(dramaId));
  if (!drama) return false;
  // getDramaById 已通过 rowToDrama 把 metadata 解析为对象，不能对 object 再 JSON.parse，否则进 catch 得到 {} 会整表覆盖掉画风等字段
  const meta = storageLayout.parseMetadata(drama.metadata);
  meta.current_step = req.current_step;
  if (req.step_data) meta.step_data = req.step_data;
  const now = new Date().toISOString();
  db.prepare('UPDATE dramas SET metadata = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(meta), now, dramaId);
  log.info('Progress saved', { drama_id: dramaId, step: req.current_step });
  return true;
}

/**
 * 取某分镜的视频地址：优先使用用户手动选定的 storyboard.video_url，否则取最新完成的 video_generations 记录
 */
function getVideoUrlForStoryboard(db, storyboardId, baseUrl) {
  // 1. 获取 storyboard 表中的视频信息（代表用户选定或上次同步的结果）
  const sb = db.prepare('SELECT video_url, local_path, updated_at FROM storyboards WHERE id = ? AND deleted_at IS NULL').get(storyboardId);
  
  // 2. 获取 video_generations 表中最新完成的记录
  const vg = db.prepare(
    "SELECT video_url, local_path, completed_at, updated_at, created_at FROM video_generations WHERE storyboard_id = ? AND status = 'completed' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1"
  ).get(storyboardId);

  // 辅助函数：构造完整 URL，优先使用本地路径（避免远程URL过期导致无法合并）
  const buildUrl = (videoUrl, localPath) => {
    if (localPath && String(localPath).trim() && baseUrl) {
      const base = (baseUrl || '').replace(/\/$/, '');
      const p = String(localPath).replace(/^\//, '');
      return p ? base + '/' + p : null;
    }
    if (videoUrl && String(videoUrl).trim()) return videoUrl;
    return null;
  };

  const sbUrl = sb ? buildUrl(sb.video_url, sb.local_path) : null;
  const vgUrl = vg ? buildUrl(vg.video_url, vg.local_path) : null;

  // 策略：比较时间，取最新的
  // 如果只有其中一个有 URL，直接用那个
  if (sbUrl && !vgUrl) return sbUrl;
  if (!sbUrl && vgUrl) return vgUrl;
  if (!sbUrl && !vgUrl) return null;

  // 都有 URL，比较时间
  // sb 使用 updated_at
  // vg 使用 completed_at > updated_at > created_at
  const sbTime = sb.updated_at || '1970-01-01';
  const vgTime = vg.completed_at || vg.updated_at || vg.created_at || '1970-01-01';

  // 如果生成记录的时间比分镜更新时间还晚（说明是重新生成的，且可能没回写），则优先用生成记录
  if (vgTime > sbTime) {
    return vgUrl;
  }
  
  // 否则依然以 storyboard 为准（可能是用户手动修改过，或者已经回写过）
  return sbUrl;
}

function finalizeEpisode(db, log, episodeId, baseUrl, body = {}) {
  const ep = db.prepare('SELECT id, drama_id, episode_number FROM episodes WHERE id = ? AND deleted_at IS NULL').get(episodeId);
  if (!ep) return null;
  const drama = db.prepare('SELECT title, metadata FROM dramas WHERE id = ? AND deleted_at IS NULL').get(ep.drama_id);
  const projectClipDuration = resolveProjectClipDuration(drama?.metadata);
  const storyboards = db.prepare(
    'SELECT id, storyboard_number, duration FROM storyboards WHERE episode_id = ? AND deleted_at IS NULL ORDER BY storyboard_number ASC'
  ).all(episodeId);
  const videoMergeService = require('./videoMergeService');
  const scenes = [];
  for (let i = 0; i < storyboards.length; i++) {
    const sb = storyboards[i];
    const videoUrl = getVideoUrlForStoryboard(db, sb.id, baseUrl);
    if (!videoUrl) {
      log.warn('Finalize skip storyboard (no video)', { storyboard_id: sb.id, storyboard_number: sb.storyboard_number });
      continue;
    }
    scenes.push({
      scene_id: sb.id,
      video_url: videoUrl,
      duration: Number(sb.duration) || projectClipDuration,
      order: i,
    });
  }
  if (scenes.length === 0) {
    log.warn('Finalize no scenes with video', { episode_id: episodeId });
    return { message: '本集没有可合成的视频片段', merge_id: null, episode_id: episodeId, scenes_count: 0, task_id: null };
  }
  const title = drama && drama.title ? `${drama.title} - 第${ep.episode_number ?? episodeId}集` : null;
  const mergeReq = {
    episode_id: episodeId,
    drama_id: ep.drama_id,
    title,
    scenes,
    provider: 'ffmpeg',
    user: body?.user,
    merge_options: {
      burn_narration_subtitles: !!(body && body.burn_narration_subtitles),
      burn_dialogue_audio: !!(body && body.burn_dialogue_audio),
      watermark_text: (body && body.watermark_text != null)
        ? String(body.watermark_text).trim().slice(0, 200)
        : '',
    },
  };
  const created = videoMergeService.create(db, log, mergeReq);
  const mergeId = created.merge_id || created.id;
  db.prepare('UPDATE episodes SET status = ? WHERE id = ?').run('processing', episodeId);
  setImmediate(() => {
    videoMergeService.processVideoMerge(db, log, mergeId, baseUrl);
  });
  return {
    message: '视频合成任务已创建，正在后台处理',
    merge_id: mergeId,
    episode_id: episodeId,
    scenes_count: scenes.length,
    task_id: created.task_id,
  };
}

function downloadEpisodeVideo(db, episodeId) {
  const ep = db.prepare('SELECT id, title, episode_number, video_url FROM episodes WHERE id = ? AND deleted_at IS NULL').get(episodeId);
  if (!ep) return null;
  if (!ep.video_url) return { error: '该剧集还没有生成视频' };
  return { video_url: ep.video_url, title: ep.title, episode_number: ep.episode_number };
}

module.exports = {
  createDrama,
  getDrama,
  getDramaById,
  listDramas,
  updateDrama,
  deleteDrama,
  getDramaStats,
  saveOutline,
  getCharacters,
  saveCharacters,
  saveEpisodes,
  saveProgress,
  finalizeEpisode,
  downloadEpisodeVideo,
  generateStoryboard,
};
