const aiConfigService = require('./aiConfigService');
const {
  resolveProjectImageSpecFromMetadata,
  resolveProjectVideoSpecFromMetadata,
} = require('./projectMediaSpec');

const RUNNING_TASK_STATUSES = ['queued', 'pending', 'processing', 'running'];
const SERVICE_TYPE_LABELS = {
  text: '文本',
  image: '图像',
  video: '视频',
  tts: '音频',
};

function parsePositiveId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseJsonColumn(value, fallback = {}) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}

function cleanUrl(url) {
  if (!url) return null;
  const s = String(url);
  return s.startsWith('data:') ? null : s;
}

function localPathToThumb(localPath, width = 320) {
  if (!localPath) return null;
  const rel = String(localPath).replace(/\\/g, '/').replace(/^\/+/, '');
  return rel ? `/static-thumb/${width}/${rel}` : null;
}

function safeGet(db, sql, ...params) {
  try {
    return db.prepare(sql).get(...params) || null;
  } catch (_) {
    return null;
  }
}

function safeAll(db, sql, ...params) {
  try {
    return db.prepare(sql).all(...params) || [];
  } catch (_) {
    return [];
  }
}

function latestFromRows(rows, field = 'updated_at') {
  return (rows || [])
    .map((row) => row?.[field])
    .filter(Boolean)
    .sort()
    .pop() || null;
}

function countSafe(db, sql, ...params) {
  const row = safeGet(db, sql, ...params);
  return Number(row?.count || row?.c || 0);
}

function tableColumns(db, table) {
  return safeAll(db, `PRAGMA table_info(${table})`).map((row) => row.name).filter(Boolean);
}

function existingColumns(db, table, candidates = []) {
  const columns = new Set(tableColumns(db, table));
  return candidates.filter((name) => columns.has(name));
}

function nonEmptyColumnExpr(alias, columns = []) {
  if (!columns.length) return '0';
  return columns
    .map((column) => `COALESCE(TRIM(${alias}.${column}), '') <> ''`)
    .join(' OR ');
}

function buildVersion(count, latest) {
  return `${Number(count || 0)}:${latest || ''}`;
}

function runningStatusSql() {
  return RUNNING_TASK_STATUSES.map(() => '?').join(',');
}

function countRunningTasks(db, dramaId, predicateSql = '', ...params) {
  const where = predicateSql ? ` AND (${predicateSql})` : '';
  return countSafe(
    db,
    `SELECT COUNT(*) AS count
     FROM async_tasks
     WHERE deleted_at IS NULL
       AND drama_id = ?
       AND status IN (${runningStatusSql()})
       ${where}`,
    dramaId,
    ...RUNNING_TASK_STATUSES,
    ...params
  );
}

function countRunningMediaRows(db, table, dramaId, predicateSql = '', ...params) {
  const where = predicateSql ? ` AND (${predicateSql})` : '';
  return countSafe(
    db,
    `SELECT COUNT(*) AS count
     FROM ${table}
     WHERE deleted_at IS NULL
       AND drama_id = ?
       AND status IN ('pending', 'processing', 'running')
       ${where}`,
    dramaId,
    ...params
  );
}

function taskCounts(db, dramaId) {
  const storyboardTextRunning = countRunningTasks(
    db,
    dramaId,
    "type IN ('storyboard_generation', 'frame_prompt_generation')"
  );
  const storyboardImageRunning =
    countRunningTasks(
      db,
      dramaId,
      "type = 'image_generation' AND (resource_type IS NULL OR resource_type IN ('storyboard', 'sb_image', 'sb_first_image', 'sb_last_image'))"
    ) + countRunningMediaRows(db, 'image_generations', dramaId, 'storyboard_id IS NOT NULL');
  return {
    script: countRunningTasks(db, dramaId, "type IN ('story_generation', 'script_generation')"),
    characters:
      countRunningTasks(
        db,
        dramaId,
        "type IN ('character_extraction', 'character_generation') OR (type = 'image_generation' AND (resource_type = 'character' OR resource_id LIKE 'character_%'))"
      ) + countRunningMediaRows(db, 'image_generations', dramaId, 'character_id IS NOT NULL'),
    scenes:
      countRunningTasks(
        db,
        dramaId,
        "type = 'background_extraction' OR (type = 'image_generation' AND (resource_type = 'scene' OR resource_id LIKE 'scene_%'))"
      ) + countRunningMediaRows(db, 'image_generations', dramaId, 'scene_id IS NOT NULL'),
    props:
      countRunningTasks(db, dramaId, "type IN ('prop_extraction', 'prop_image_generation')"),
    storyboardText: storyboardTextRunning,
    storyboardImages: storyboardImageRunning,
    storyboards: storyboardTextRunning + storyboardImageRunning,
    videoCompose:
      countRunningTasks(db, dramaId, "type IN ('video_generation', 'video_merge')")
      + countRunningMediaRows(db, 'video_generations', dramaId)
      + countRunningMediaRows(db, 'video_merges', dramaId),
  };
}

function summarizeRouteConfig(config, serviceType) {
  if (!config) {
    return {
      mode: 'unset',
      service_type: serviceType,
      label: '未配置',
      config_id: null,
      config_name: null,
      provider: null,
      model: null,
      health_status: 'missing',
    };
  }
  const model = Array.isArray(config.model)
    ? (config.default_model || config.model[0] || '')
    : (config.default_model || config.model || '');
  return {
    mode: 'auto',
    service_type: serviceType,
    label: `自动 · ${config.name || model || SERVICE_TYPE_LABELS[serviceType] || serviceType}`,
    config_id: config.id,
    config_name: config.name || '',
    provider: config.provider || '',
    model,
    health_status: config.health_status || 'ok',
  };
}

function generationStrategySummary(db) {
  try {
    const routes = aiConfigService.getRuntimeModelRoutes(db);
    const defaults = routes?.defaults || {};
    return {
      text: summarizeRouteConfig(defaults.text, 'text'),
      image: summarizeRouteConfig(defaults.image, 'image'),
      video: summarizeRouteConfig(defaults.video, 'video'),
      audio: summarizeRouteConfig(defaults.tts, 'tts'),
    };
  } catch (_) {
    return {
      text: summarizeRouteConfig(null, 'text'),
      image: summarizeRouteConfig(null, 'image'),
      video: summarizeRouteConfig(null, 'video'),
      audio: summarizeRouteConfig(null, 'tts'),
    };
  }
}

function pickProjectCover(db, drama) {
  const thumbnail = cleanUrl(drama.thumbnail);
  if (thumbnail) return thumbnail;
  const imageRow = safeGet(
    db,
    `SELECT local_path, image_url
     FROM image_generations
     WHERE drama_id = ? AND deleted_at IS NULL AND status = 'completed'
       AND (local_path IS NOT NULL OR image_url IS NOT NULL)
     ORDER BY selected DESC, completed_at DESC, updated_at DESC, created_at DESC, id DESC
     LIMIT 1`,
    drama.id
  );
  return localPathToThumb(imageRow?.local_path) || cleanUrl(imageRow?.image_url);
}

function projectSettingsFromDrama(drama) {
  const metadata = parseJsonColumn(drama.metadata);
  const imageSpec = resolveProjectImageSpecFromMetadata(metadata);
  const videoSpec = resolveProjectVideoSpecFromMetadata(metadata);
  const duration = Number(metadata.video_clip_duration);
  const style = drama.style || metadata.style || 'realistic';
  const imageTier = imageSpec.tier || '4K';
  const videoResolution = String(videoSpec.resolution || videoSpec.tier || '720p').toUpperCase();
  return {
    aspect_ratio: metadata.aspect_ratio || imageSpec.aspect_ratio || '16:9',
    image_spec: imageSpec,
    image_spec_label: `${imageTier} · ${imageSpec.aspect_ratio || '16:9'} · ${imageSpec.size || ''}`.trim(),
    video_spec: videoSpec,
    video_resolution: videoResolution,
    default_segment_duration: Number.isFinite(duration) && duration > 0 ? duration : 10,
    language: metadata.script_language || metadata.language || 'zh',
    style,
    style_prompt_zh: metadata.style_prompt_zh || null,
    style_prompt_en: metadata.style_prompt_en || null,
  };
}

function scriptTabSummary(db, dramaId, episodeId = null) {
  const epId = parsePositiveId(episodeId);
  const episodeWhere = epId ? ' AND id = ?' : '';
  const params = epId ? [dramaId, epId] : [dramaId];
  const row = safeGet(
    db,
    `SELECT
       COUNT(*) AS count,
       SUM(CASE WHEN COALESCE(TRIM(script_content), '') <> '' THEN 1 ELSE 0 END) AS ready_count,
       MAX(updated_at) AS latest
     FROM episodes
     WHERE drama_id = ? AND deleted_at IS NULL${episodeWhere}`,
    ...params
  ) || {};
  const count = Number(row.count || 0);
  const readyCount = Number(row.ready_count || 0);
  return {
    key: 'script',
    ready: readyCount > 0,
    count,
    ready_count: readyCount,
    running_tasks: 0,
    version: buildVersion(count, row.latest),
  };
}

function simpleProjectCountTab(db, key, table, dramaId, runningTasks, extraWhere = '') {
  const where = extraWhere ? ` AND ${extraWhere}` : '';
  const row = safeGet(
    db,
    `SELECT COUNT(*) AS count, MAX(updated_at) AS latest
     FROM ${table}
     WHERE drama_id = ? AND deleted_at IS NULL${where}`,
    dramaId
  ) || {};
  const count = Number(row.count || 0);
  return {
    key,
    ready: count > 0,
    count,
    running_tasks: Number(runningTasks || 0),
    version: buildVersion(count, row.latest),
  };
}

function assetReadyCount(db, table, dramaId) {
  const readyColumns = existingColumns(db, table, ['image_url', 'local_path']);
  const readyExpr = nonEmptyColumnExpr(table, readyColumns);
  if (readyExpr === '0') return 0;
  const row = safeGet(
    db,
    `SELECT COUNT(*) AS count
     FROM ${table}
     WHERE drama_id = ? AND deleted_at IS NULL AND (${readyExpr})`,
    dramaId
  ) || {};
  return Number(row.count || 0);
}

function storyboardsTabSummary(db, dramaId, runningTasks, episodeId = null) {
  const epId = parsePositiveId(episodeId);
  const episodeWhere = epId ? ' AND e.id = ?' : '';
  const params = epId ? [dramaId, epId] : [dramaId];
  const row = safeGet(
    db,
    `SELECT COUNT(*) AS count, MAX(s.updated_at) AS latest
     FROM storyboards s
     INNER JOIN episodes e ON e.id = s.episode_id AND e.deleted_at IS NULL
     WHERE e.drama_id = ? AND s.deleted_at IS NULL${episodeWhere}`,
    ...params
  ) || {};
  const count = Number(row.count || 0);
  return {
    key: 'storyboards',
    ready: count > 0,
    count,
    running_tasks: Number(runningTasks || 0),
    version: buildVersion(count, row.latest),
  };
}

function storyboardProgressStats(db, dramaId, episodeId = null) {
  const sbImageColumns = existingColumns(db, 'storyboards', ['image_url', 'local_path', 'composed_image']);
  const sbVideoColumns = existingColumns(db, 'storyboards', ['video_url']);
  const imageGenColumns = existingColumns(db, 'image_generations', ['image_url', 'local_path']);
  const videoGenColumns = existingColumns(db, 'video_generations', ['video_url', 'local_path']);
  const sbImageExpr = nonEmptyColumnExpr('s', sbImageColumns);
  const sbVideoExpr = nonEmptyColumnExpr('s', sbVideoColumns);
  const imageGenReadyExpr = imageGenColumns.length
    ? `EXISTS (
         SELECT 1
         FROM image_generations ig
         WHERE ig.deleted_at IS NULL
           AND ig.storyboard_id = s.id
           AND ig.status = 'completed'
           AND (${nonEmptyColumnExpr('ig', imageGenColumns)})
       )`
    : '0';
  const videoGenReadyExpr = videoGenColumns.length
    ? `EXISTS (
         SELECT 1
         FROM video_generations vg
         WHERE vg.deleted_at IS NULL
           AND vg.storyboard_id = s.id
           AND vg.status = 'completed'
           AND (${nonEmptyColumnExpr('vg', videoGenColumns)})
       )`
    : '0';
  const epId = parsePositiveId(episodeId);
  const episodeWhere = epId ? ' AND e.id = ?' : '';
  const params = epId ? [dramaId, epId] : [dramaId];
  const row = safeGet(
    db,
    `SELECT
       COUNT(*) AS count,
       SUM(CASE WHEN (${sbImageExpr}) OR (${imageGenReadyExpr}) THEN 1 ELSE 0 END) AS image_ready_count,
       SUM(CASE WHEN (${sbVideoExpr}) OR (${videoGenReadyExpr}) THEN 1 ELSE 0 END) AS video_ready_count,
       MAX(s.updated_at) AS latest
     FROM storyboards s
     INNER JOIN episodes e ON e.id = s.episode_id AND e.deleted_at IS NULL
     WHERE e.drama_id = ? AND s.deleted_at IS NULL${episodeWhere}`,
    ...params
  ) || {};
  return {
    count: Number(row.count || 0),
    image_ready_count: Number(row.image_ready_count || 0),
    video_ready_count: Number(row.video_ready_count || 0),
    latest: row.latest || null,
  };
}

function storyboardOutlineForEpisode(db, episodeId) {
  const id = parsePositiveId(episodeId);
  if (!id) return [];
  let rows = [];
  try {
    rows = db.prepare(
      `SELECT id, episode_id, storyboard_number, title, segment_index, segment_title, updated_at
       FROM storyboards
       WHERE episode_id = ? AND deleted_at IS NULL
       ORDER BY storyboard_number ASC, id ASC`
    ).all(id) || [];
  } catch (_) {
    rows = safeAll(
      db,
      `SELECT id, episode_id, storyboard_number, title, 0 AS segment_index, '' AS segment_title, NULL AS updated_at
       FROM storyboards
       WHERE episode_id = ? AND deleted_at IS NULL
       ORDER BY storyboard_number ASC, id ASC`,
      id
    );
  }
  return rows.map((row) => ({
    id: row.id,
    episode_id: row.episode_id ?? id,
    storyboard_number: row.storyboard_number ?? 0,
    title: row.title || '',
    segment_index: row.segment_index ?? 0,
    segment_title: row.segment_title || '',
    updated_at: row.updated_at || null,
  }));
}

function videoComposeTabSummary(db, dramaId, runningTasks) {
  const row = safeGet(
    db,
    `SELECT
       (SELECT COUNT(*) FROM video_generations WHERE drama_id = ? AND deleted_at IS NULL) AS video_count,
       (SELECT COUNT(*) FROM video_merges WHERE drama_id = ? AND deleted_at IS NULL) AS merge_count,
       (SELECT MAX(updated_at) FROM video_generations WHERE drama_id = ? AND deleted_at IS NULL) AS video_latest,
       (SELECT MAX(created_at) FROM video_merges WHERE drama_id = ? AND deleted_at IS NULL) AS merge_latest`,
    dramaId,
    dramaId,
    dramaId,
    dramaId
  ) || {};
  const count = Number(row.video_count || 0) + Number(row.merge_count || 0);
  const latest = [row.video_latest, row.merge_latest].filter(Boolean).sort().pop() || null;
  return {
    key: 'videoCompose',
    ready: count > 0,
    count,
    video_count: Number(row.video_count || 0),
    merge_count: Number(row.merge_count || 0),
    running_tasks: Number(runningTasks || 0),
    version: buildVersion(count, latest),
  };
}

function progressStatus(total, ready, running = 0) {
  const totalCount = Number(total || 0);
  const readyCount = Number(ready || 0);
  const runningCount = Number(running || 0);
  if (runningCount > 0) return 'generating';
  if (totalCount <= 0) return 'pending';
  if (readyCount >= totalCount) return 'done';
  return 'partial';
}

function buildProgressStep(key, total, ready, running = 0) {
  const totalCount = Number(total || 0);
  const readyCount = Number(ready || 0);
  const runningCount = Number(running || 0);
  return {
    key,
    status: progressStatus(totalCount, readyCount, runningCount),
    count: totalCount,
    total_count: totalCount,
    ready_count: readyCount,
    running_tasks: runningCount,
  };
}

function buildProgressSteps(db, dramaId, tabs, running, episodeId = null) {
  const script = tabs.script || {};
  const storyboardStats = storyboardProgressStats(db, dramaId, episodeId);
  const charactersReady = assetReadyCount(db, 'characters', dramaId);
  const propsReady = assetReadyCount(db, 'props', dramaId);
  const scenesReady = assetReadyCount(db, 'scenes', dramaId);
  return [
    buildProgressStep('script', script.count, script.ready_count, running.script),
    buildProgressStep('chars', tabs.characters?.count, charactersReady, running.characters),
    buildProgressStep('props', tabs.props?.count, propsReady, running.props),
    buildProgressStep('scenes', tabs.scenes?.count, scenesReady, running.scenes),
    buildProgressStep('sb', storyboardStats.count, storyboardStats.count, running.storyboardText),
    buildProgressStep('sbimg', storyboardStats.count, storyboardStats.image_ready_count, running.storyboardImages),
    buildProgressStep('video', storyboardStats.count, storyboardStats.video_ready_count, running.videoCompose),
  ];
}

function getWorkbenchSummary(db, dramaId, options = {}) {
  const id = parsePositiveId(dramaId);
  if (!id) return null;
  const episodeId = parsePositiveId(options.episode_id);
  const drama = safeGet(
    db,
    `SELECT id, title, description, style, thumbnail, total_episodes, total_duration, status, metadata, owner_user_id, updated_at, created_at
     FROM dramas
     WHERE id = ? AND deleted_at IS NULL`,
    id
  );
  if (!drama) return null;

  const running = taskCounts(db, id);
  const outlineEpisode = resolveWorkbenchEpisode(db, id, episodeId);
  const tabs = {
    script: scriptTabSummary(db, id, episodeId),
    characters: simpleProjectCountTab(db, 'characters', 'characters', id, running.characters),
    scenes: simpleProjectCountTab(db, 'scenes', 'scenes', id, running.scenes),
    props: simpleProjectCountTab(db, 'props', 'props', id, running.props),
    storyboards: storyboardsTabSummary(db, id, running.storyboards, episodeId),
    videoCompose: videoComposeTabSummary(db, id, running.videoCompose),
  };
  return {
    project: {
      id: drama.id,
      title: drama.title || '',
      description: drama.description || null,
      status: drama.status || 'draft',
      cover_url: pickProjectCover(db, drama),
      total_episodes: drama.total_episodes ?? 1,
      total_duration: drama.total_duration ?? 0,
      owner_user_id: drama.owner_user_id || null,
      updated_at: drama.updated_at || drama.created_at || null,
    },
    settings: projectSettingsFromDrama(drama),
    generation_strategy: generationStrategySummary(db),
    tabs,
    storyboard_outline: storyboardOutlineForEpisode(db, outlineEpisode?.id),
    progress_scope: episodeId ? { type: 'episode', episode_id: episodeId } : { type: 'project', episode_id: null },
    progress_steps: buildProgressSteps(db, id, tabs, running, episodeId),
  };
}

function projectForWorkbench(db, dramaId) {
  const id = parsePositiveId(dramaId);
  if (!id) return null;
  const drama = safeGet(
    db,
    `SELECT *
     FROM dramas
     WHERE id = ? AND deleted_at IS NULL`,
    id
  );
  if (!drama) return null;
  return {
    id: drama.id,
    title: drama.title || '',
    description: drama.description || '',
    genre: drama.genre || '',
    style: drama.style || 'realistic',
    thumbnail: cleanUrl(drama.thumbnail),
    total_episodes: drama.total_episodes ?? 1,
    total_duration: drama.total_duration ?? 0,
    status: drama.status || 'draft',
    metadata: parseJsonColumn(drama.metadata),
    owner_user_id: drama.owner_user_id || null,
    created_at: drama.created_at || null,
    updated_at: drama.updated_at || null,
  };
}

function getScriptTab(db, dramaId) {
  const project = projectForWorkbench(db, dramaId);
  if (!project) return null;
  const episodes = safeAll(
    db,
    `SELECT *
     FROM episodes
     WHERE drama_id = ? AND deleted_at IS NULL
     ORDER BY episode_number ASC, id ASC`,
    project.id
  ).map((row) => ({
    id: row.id,
    drama_id: row.drama_id,
    episode_number: row.episode_number ?? 0,
    title: row.title || '',
    script_content: row.script_content || '',
    description: row.description || null,
    duration: row.duration ?? 0,
    video_url: row.video_url || null,
    thumbnail: cleanUrl(row.thumbnail),
    status: row.status || 'draft',
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  }));
  const readyCount = episodes.filter((ep) => String(ep.script_content || '').trim()).length;
  return {
    project,
    summary: {
      count: episodes.length,
      ready_count: readyCount,
      ready: readyCount > 0,
      version: buildVersion(episodes.length, episodes.map((ep) => ep.updated_at).filter(Boolean).sort().pop()),
    },
    episodes,
  };
}

function assetColumnsForType(type) {
  return '*';
}

function normalizeAssetRow(type, row) {
  const base = {
    id: row.id,
    drama_id: row.drama_id,
    image_url: cleanUrl(row.image_url),
    local_path: row.local_path || null,
    thumbnail_url: localPathToThumb(row.local_path, 320),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
  if (type === 'character') {
    return {
      ...base,
      name: row.name || '',
      role: row.role || null,
      description: row.description || null,
      personality: row.personality || null,
      appearance: row.appearance || null,
      voice_style: row.voice_style || null,
      sort_order: row.sort_order ?? 0,
    };
  }
  if (type === 'scene') {
    return {
      ...base,
      episode_id: row.episode_id || null,
      location: row.location || '',
      time: row.time || null,
      prompt: row.prompt || null,
      storyboard_count: row.storyboard_count ?? 0,
      status: row.status || 'draft',
    };
  }
  return {
    ...base,
    name: row.name || '',
    type: row.type || null,
    description: row.description || null,
    prompt: row.prompt || null,
  };
}

function getAssetTab(db, dramaId, options = {}) {
  const project = projectForWorkbench(db, dramaId);
  if (!project) return null;
  const type = String(options.type || '').trim();
  if (!['character', 'scene', 'prop'].includes(type)) {
    const err = new Error('资产类型必须为 character/scene/prop');
    err.statusCode = 400;
    throw err;
  }
  const columns = assetColumnsForType(type);
  const table = type === 'character' ? 'characters' : type === 'scene' ? 'scenes' : 'props';
  const orderBy = 'id ASC';
  const rows = safeAll(
    db,
    `SELECT ${columns}
     FROM ${table}
     WHERE drama_id = ? AND deleted_at IS NULL
     ORDER BY ${orderBy}`,
    project.id
  );
  return {
    project,
    type,
    episode_id: parsePositiveId(options.episode_id),
    summary: {
      count: rows.length,
      ready: rows.length > 0,
      version: buildVersion(rows.length, rows.map((row) => row.updated_at).filter(Boolean).sort().pop()),
    },
    items: rows.map((row) => normalizeAssetRow(type, row)),
  };
}

function resolveWorkbenchEpisode(db, dramaId, episodeId) {
  const id = parsePositiveId(dramaId);
  if (!id) return null;
  const epId = parsePositiveId(episodeId);
  const row = epId
    ? safeGet(
      db,
      `SELECT *
       FROM episodes
       WHERE id = ? AND drama_id = ? AND deleted_at IS NULL`,
      epId,
      id
    )
    : safeGet(
      db,
      `SELECT *
       FROM episodes
       WHERE drama_id = ? AND deleted_at IS NULL
       ORDER BY episode_number ASC, id ASC
       LIMIT 1`,
      id
    );
  if (epId && !row) {
    const err = new Error('剧集不存在或不属于当前项目');
    err.statusCode = 404;
    throw err;
  }
  if (!row) return null;
  return {
    id: row.id,
    drama_id: row.drama_id,
    episode_number: row.episode_number ?? 0,
    title: row.title || '',
    script_content: row.script_content || '',
    description: row.description || null,
    duration: row.duration ?? 0,
    video_url: row.video_url || null,
    thumbnail: cleanUrl(row.thumbnail),
    status: row.status || 'draft',
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function normalizeVideoGenerationRow(row) {
  return {
    id: row.id,
    storyboard_id: row.storyboard_id ?? null,
    drama_id: row.drama_id ?? null,
    provider: row.provider || null,
    prompt: row.prompt || '',
    model: row.model || null,
    ai_config_id: row.ai_config_id || null,
    image_gen_id: row.image_gen_id || null,
    image_url: cleanUrl(row.image_url),
    video_url: cleanUrl(row.video_url),
    local_path: row.local_path || null,
    status: row.status || 'pending',
    task_id: row.task_id || null,
    error_msg: row.error_msg || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    completed_at: row.completed_at || null,
  };
}

function normalizeVideoMergeRow(row) {
  return {
    id: row.id,
    episode_id: row.episode_id ?? null,
    drama_id: row.drama_id ?? null,
    title: row.title || null,
    provider: row.provider || null,
    model: row.model || null,
    status: row.status || 'pending',
    merged_url: cleanUrl(row.merged_url),
    duration: row.duration ?? null,
    task_id: row.task_id || null,
    error_msg: row.error_msg || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    completed_at: row.completed_at || null,
  };
}

function normalizeStoryboardRow(row) {
  return {
    id: row.id,
    episode_id: row.episode_id ?? null,
    scene_id: row.scene_id ?? null,
    storyboard_number: row.storyboard_number ?? 0,
    title: row.title || '',
    description: row.description || '',
    layout_description: row.layout_description || '',
    location: row.location || '',
    time: row.time || '',
    duration: row.duration ?? null,
    dialogue: row.dialogue || '',
    narration: row.narration || '',
    action: row.action || '',
    atmosphere: row.atmosphere || '',
    image_prompt: row.image_prompt || '',
    polished_prompt: row.polished_prompt || '',
    video_prompt: row.video_prompt || '',
    characters: row.characters || '',
    shot_type: row.shot_type || '',
    angle: row.angle || '',
    angle_h: row.angle_h || '',
    angle_v: row.angle_v || '',
    angle_s: row.angle_s || '',
    movement: row.movement || '',
    lighting_style: row.lighting_style || '',
    depth_of_field: row.depth_of_field || '',
    image_url: cleanUrl(row.image_url),
    local_path: row.local_path || null,
    thumbnail_url: localPathToThumb(row.local_path, 320),
    main_panel_idx: row.main_panel_idx ?? null,
    video_url: cleanUrl(row.video_url),
    composed_image: cleanUrl(row.composed_image),
    result: row.result || '',
    emotion: row.emotion || '',
    emotion_intensity: row.emotion_intensity ?? null,
    error_msg: row.error_msg || null,
    segment_index: row.segment_index ?? 0,
    segment_title: row.segment_title || '',
    continuity_snapshot: row.continuity_snapshot || null,
    audio_local_path: row.audio_local_path || null,
    narration_audio_local_path: row.narration_audio_local_path || null,
    creation_mode: row.creation_mode || 'classic',
    universal_segment_text: row.universal_segment_text || '',
    first_frame_image_id: row.first_frame_image_id ?? null,
    last_frame_image_id: row.last_frame_image_id ?? null,
    last_frame_image_url: cleanUrl(row.last_frame_image_url),
    last_frame_local_path: row.last_frame_local_path || null,
    status: row.status || 'draft',
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function storyboardsForEpisode(db, episodeId) {
  return safeAll(
    db,
    `SELECT *
     FROM storyboards
     WHERE episode_id = ? AND deleted_at IS NULL
     ORDER BY storyboard_number ASC, id ASC`,
    episodeId
  ).map(normalizeStoryboardRow);
}

function videoGenerationsForStoryboards(db, dramaId, storyboardIds) {
  const ids = (storyboardIds || []).map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  return safeAll(
    db,
    `SELECT *
     FROM video_generations
     WHERE drama_id = ?
       AND deleted_at IS NULL
       AND storyboard_id IN (${placeholders})
     ORDER BY created_at DESC, id DESC`,
    dramaId,
    ...ids
  ).map(normalizeVideoGenerationRow);
}

function videoMergesForEpisode(db, dramaId, episodeId) {
  const rows = safeAll(
    db,
    `SELECT *
     FROM video_merges
     WHERE drama_id = ?
       AND episode_id = ?
       AND deleted_at IS NULL
     ORDER BY created_at DESC, id DESC`,
    dramaId,
    episodeId
  );
  if (rows.length > 0) return rows.map(normalizeVideoMergeRow);
  return safeAll(
    db,
    `SELECT *
     FROM video_merges
     WHERE drama_id = ?
       AND deleted_at IS NULL
     ORDER BY created_at DESC, id DESC`,
    dramaId
  )
    .filter((row) => Number(row.episode_id) === Number(episodeId))
    .map(normalizeVideoMergeRow);
}

function getStoryboardsTab(db, dramaId, options = {}) {
  const project = projectForWorkbench(db, dramaId);
  if (!project) return null;
  const episode = resolveWorkbenchEpisode(db, project.id, options.episode_id);
  const storyboards = episode ? storyboardsForEpisode(db, episode.id) : [];
  return {
    project,
    episode,
    summary: {
      count: storyboards.length,
      ready: storyboards.length > 0,
      version: buildVersion(storyboards.length, latestFromRows(storyboards)),
    },
    storyboards,
  };
}

function getVideoComposeTab(db, dramaId, options = {}) {
  const project = projectForWorkbench(db, dramaId);
  if (!project) return null;
  const episode = resolveWorkbenchEpisode(db, project.id, options.episode_id);
  const storyboards = episode ? storyboardsForEpisode(db, episode.id) : [];
  const storyboardIds = storyboards.map((sb) => sb.id);
  const videos = episode ? videoGenerationsForStoryboards(db, project.id, storyboardIds) : [];
  const merges = episode ? videoMergesForEpisode(db, project.id, episode.id) : [];
  const latestMerge = merges.find((item) => item.status === 'completed' && item.merged_url) || merges[0] || null;
  return {
    project,
    episode,
    summary: {
      storyboard_count: storyboards.length,
      video_count: videos.length,
      merge_count: merges.length,
      ready: !!(episode?.video_url || latestMerge?.merged_url),
      version: buildVersion(
        videos.length + merges.length,
        [latestFromRows(videos), latestFromRows(merges, 'created_at')].filter(Boolean).sort().pop()
      ),
    },
    storyboards,
    videos,
    merges,
    latest_merge: latestMerge,
  };
}

module.exports = {
  getWorkbenchSummary,
  getScriptTab,
  getAssetTab,
  getStoryboardsTab,
  getVideoComposeTab,
  _test: {
    parseJsonColumn,
    projectSettingsFromDrama,
    summarizeRouteConfig,
  },
};
