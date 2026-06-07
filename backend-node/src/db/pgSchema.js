const fs = require('fs');
const Database = require('better-sqlite3');

const tableDefs = [
  {
    name: 'dramas',
    pk: 'id',
    columns: {
      title: 'TEXT NOT NULL DEFAULT \'\'',
      description: 'TEXT',
      genre: 'TEXT',
      style: 'TEXT DEFAULT \'realistic\'',
      tags: 'TEXT',
      thumbnail: 'TEXT',
      total_episodes: 'INTEGER DEFAULT 1',
      total_duration: 'INTEGER DEFAULT 0',
      status: 'TEXT DEFAULT \'draft\'',
      metadata: 'TEXT',
      owner_user_id: 'TEXT',
      created_by_user_id: 'TEXT',
      created_at: 'TEXT',
      updated_at: 'TEXT',
      deleted_at: 'TEXT',
    },
  },
  {
    name: 'episodes',
    pk: 'id',
    columns: {
      drama_id: 'INTEGER DEFAULT 0',
      episode_number: 'INTEGER DEFAULT 0',
      title: 'TEXT DEFAULT \'\'',
      script_content: 'TEXT',
      description: 'TEXT',
      duration: 'INTEGER DEFAULT 0',
      video_url: 'TEXT',
      thumbnail: 'TEXT',
      status: 'TEXT DEFAULT \'draft\'',
      created_at: 'TEXT',
      updated_at: 'TEXT',
      deleted_at: 'TEXT',
    },
  },
  {
    name: 'storyboards',
    pk: 'id',
    columns: {
      episode_id: 'INTEGER DEFAULT 0',
      scene_id: 'INTEGER',
      storyboard_number: 'INTEGER DEFAULT 0',
      title: 'TEXT',
      description: 'TEXT',
      layout_description: 'TEXT',
      location: 'TEXT',
      time: 'TEXT',
      duration: 'DOUBLE PRECISION',
      dialogue: 'TEXT',
      narration: 'TEXT',
      action: 'TEXT',
      atmosphere: 'TEXT',
      image_prompt: 'TEXT',
      video_prompt: 'TEXT',
      characters: 'TEXT',
      shot_type: 'TEXT',
      angle: 'TEXT',
      movement: 'TEXT',
      image_url: 'TEXT',
      local_path: 'TEXT',
      main_panel_idx: 'INTEGER',
      video_url: 'TEXT',
      composed_image: 'TEXT',
      result: 'TEXT',
      emotion: 'TEXT',
      emotion_intensity: 'INTEGER',
      error_msg: 'TEXT',
      segment_index: 'INTEGER DEFAULT 0',
      segment_title: 'TEXT',
      angle_h: 'TEXT',
      angle_v: 'TEXT',
      angle_s: 'TEXT',
      lighting_style: 'TEXT',
      depth_of_field: 'TEXT',
      polished_prompt: 'TEXT',
      continuity_snapshot: 'TEXT',
      audio_local_path: 'TEXT',
      narration_audio_local_path: 'TEXT',
      creation_mode: 'TEXT DEFAULT \'classic\'',
      universal_segment_text: 'TEXT',
      first_frame_image_id: 'INTEGER',
      last_frame_image_id: 'INTEGER',
      last_frame_image_url: 'TEXT',
      last_frame_local_path: 'TEXT',
      status: 'TEXT DEFAULT \'draft\'',
      created_at: 'TEXT',
      updated_at: 'TEXT',
      deleted_at: 'TEXT',
    },
  },
  {
    name: 'characters',
    pk: 'id',
    columns: {
      drama_id: 'INTEGER DEFAULT 0',
      name: 'TEXT NOT NULL DEFAULT \'\'',
      role: 'TEXT',
      description: 'TEXT',
      personality: 'TEXT',
      appearance: 'TEXT',
      image_url: 'TEXT',
      local_path: 'TEXT',
      extra_images: 'TEXT',
      voice_style: 'TEXT',
      sort_order: 'INTEGER DEFAULT 0',
      error_msg: 'TEXT',
      identity_anchors: 'TEXT',
      style_tokens: 'TEXT',
      color_palette: 'TEXT',
      four_view_image_url: 'TEXT',
      polished_prompt: 'TEXT',
      ref_image: 'TEXT',
      stages: 'TEXT',
      seedance2_asset: 'TEXT',
      seedance2_voice_asset: 'TEXT',
      negative_prompt: 'TEXT',
      created_at: 'TEXT',
      updated_at: 'TEXT',
      deleted_at: 'TEXT',
    },
  },
  {
    name: 'episode_characters',
    compositePk: ['episode_id', 'character_id'],
    columns: {
      episode_id: 'INTEGER NOT NULL',
      character_id: 'INTEGER NOT NULL',
    },
  },
  {
    name: 'scenes',
    pk: 'id',
    columns: {
      drama_id: 'INTEGER DEFAULT 0',
      episode_id: 'INTEGER',
      location: 'TEXT',
      time: 'TEXT',
      prompt: 'TEXT',
      polished_prompt: 'TEXT',
      polished_prompt_single: 'TEXT',
      image_url: 'TEXT',
      local_path: 'TEXT',
      extra_images: 'TEXT',
      ref_image: 'TEXT',
      negative_prompt: 'TEXT',
      storyboard_count: 'INTEGER DEFAULT 0',
      error_msg: 'TEXT',
      status: 'TEXT DEFAULT \'draft\'',
      created_at: 'TEXT',
      updated_at: 'TEXT',
      deleted_at: 'TEXT',
    },
  },
  {
    name: 'props',
    pk: 'id',
    columns: {
      drama_id: 'INTEGER DEFAULT 0',
      episode_id: 'INTEGER',
      name: 'TEXT NOT NULL DEFAULT \'\'',
      type: 'TEXT',
      description: 'TEXT',
      prompt: 'TEXT',
      image_url: 'TEXT',
      local_path: 'TEXT',
      extra_images: 'TEXT',
      ref_image: 'TEXT',
      negative_prompt: 'TEXT',
      error_msg: 'TEXT',
      created_at: 'TEXT',
      updated_at: 'TEXT',
      deleted_at: 'TEXT',
    },
  },
  {
    name: 'storyboard_props',
    compositePk: ['storyboard_id', 'prop_id'],
    columns: {
      storyboard_id: 'INTEGER NOT NULL',
      prop_id: 'INTEGER NOT NULL',
    },
  },
  {
    name: 'frame_prompts',
    pk: 'id',
    columns: {
      storyboard_id: 'INTEGER DEFAULT 0',
      frame_type: 'TEXT',
      prompt: 'TEXT',
      description: 'TEXT',
      layout: 'TEXT',
      created_at: 'TEXT',
      updated_at: 'TEXT',
    },
  },
  {
    name: 'ai_service_configs',
    pk: 'id',
    columns: {
      service_type: 'TEXT NOT NULL DEFAULT \'text\'',
      provider: 'TEXT DEFAULT \'\'',
      api_protocol: 'TEXT DEFAULT \'openai_compatible\'',
      name: 'TEXT DEFAULT \'\'',
      base_url: 'TEXT DEFAULT \'\'',
      api_key: 'TEXT',
      model: 'TEXT',
      default_model: 'TEXT',
      endpoint: 'TEXT',
      query_endpoint: 'TEXT',
      priority: 'INTEGER DEFAULT 0',
      is_default: 'INTEGER DEFAULT 0',
      is_active: 'INTEGER DEFAULT 1',
      health_status: 'TEXT DEFAULT \'ok\'',
      disabled_until: 'TEXT',
      last_error: 'TEXT',
      last_error_at: 'TEXT',
      failure_count: 'INTEGER DEFAULT 0',
      auth_mode: 'TEXT',
      access_key_id: 'TEXT',
      secret_access_key: 'TEXT',
      secret_key_base64: 'INTEGER DEFAULT 0',
      sign_region: 'TEXT',
      sign_service: 'TEXT',
      session_token: 'TEXT',
      settings: 'TEXT',
      created_at: 'TEXT',
      updated_at: 'TEXT',
      deleted_at: 'TEXT',
    },
  },
  {
    name: 'async_tasks',
    textPk: 'id',
    columns: {
      type: 'TEXT NOT NULL DEFAULT \'\'',
      status: 'TEXT NOT NULL DEFAULT \'pending\'',
      progress: 'INTEGER DEFAULT 0',
      message: 'TEXT',
      resource_id: 'TEXT',
      completed_at: 'TEXT',
      error: 'TEXT',
      result: 'TEXT',
      created_at: 'TEXT',
      updated_at: 'TEXT',
      deleted_at: 'TEXT',
    },
  },
  {
    name: 'image_generations',
    pk: 'id',
    columns: {
      storyboard_id: 'INTEGER',
      drama_id: 'INTEGER',
      episode_id: 'INTEGER',
      scene_id: 'INTEGER',
      character_id: 'INTEGER',
      provider: 'TEXT',
      prompt: 'TEXT',
      negative_prompt: 'TEXT',
      model: 'TEXT',
      ai_config_id: 'INTEGER',
      frame_type: 'TEXT',
      reference_images: 'TEXT',
      use_first_frame_layout_lock: 'INTEGER',
      size: 'TEXT',
      quality: 'TEXT',
      image_url: 'TEXT',
      local_path: 'TEXT',
      width: 'INTEGER',
      height: 'INTEGER',
      status: 'TEXT',
      task_id: 'TEXT',
      completed_at: 'TEXT',
      error_msg: 'TEXT',
      created_at: 'TEXT',
      updated_at: 'TEXT',
      deleted_at: 'TEXT',
    },
  },
  {
    name: 'video_generations',
    pk: 'id',
    columns: {
      drama_id: 'INTEGER',
      storyboard_id: 'INTEGER',
      provider: 'TEXT',
      prompt: 'TEXT',
      model: 'TEXT',
      ai_config_id: 'INTEGER',
      duration: 'DOUBLE PRECISION',
      aspect_ratio: 'TEXT',
      resolution: 'TEXT',
      seed: 'INTEGER',
      camera_fixed: 'INTEGER',
      watermark: 'INTEGER',
      image_url: 'TEXT',
      first_frame_url: 'TEXT',
      last_frame_url: 'TEXT',
      reference_image_urls: 'TEXT',
      video_url: 'TEXT',
      local_path: 'TEXT',
      status: 'TEXT',
      task_id: 'TEXT',
      scene_id: 'INTEGER',
      completed_at: 'TEXT',
      error_msg: 'TEXT',
      created_at: 'TEXT',
      updated_at: 'TEXT',
      deleted_at: 'TEXT',
    },
  },
  {
    name: 'video_merges',
    pk: 'id',
    columns: {
      episode_id: 'INTEGER',
      drama_id: 'INTEGER',
      title: 'TEXT',
      provider: 'TEXT',
      model: 'TEXT',
      status: 'TEXT',
      scenes: 'TEXT',
      merge_options: 'TEXT',
      task_id: 'TEXT',
      merged_url: 'TEXT',
      duration: 'INTEGER',
      completed_at: 'TEXT',
      error_msg: 'TEXT',
      created_at: 'TEXT',
      deleted_at: 'TEXT',
    },
  },
  {
    name: 'assets',
    pk: 'id',
    columns: {
      drama_id: 'INTEGER',
      name: 'TEXT',
      type: 'TEXT',
      category: 'TEXT',
      url: 'TEXT',
      local_path: 'TEXT',
      file_size: 'INTEGER',
      mime_type: 'TEXT',
      width: 'INTEGER',
      height: 'INTEGER',
      duration: 'DOUBLE PRECISION',
      image_gen_id: 'INTEGER',
      video_gen_id: 'INTEGER',
      created_at: 'TEXT',
      updated_at: 'TEXT',
      deleted_at: 'TEXT',
    },
  },
  {
    name: 'character_libraries',
    pk: 'id',
    columns: {
      drama_id: 'INTEGER',
      name: 'TEXT NOT NULL DEFAULT \'\'',
      category: 'TEXT',
      image_url: 'TEXT',
      local_path: 'TEXT',
      description: 'TEXT',
      appearance: 'TEXT',
      tags: 'TEXT',
      source_type: 'TEXT',
      source_id: 'TEXT',
      created_by_user_id: 'TEXT',
      created_by_username: 'TEXT',
      created_by_display_name: 'TEXT',
      identity_anchors: 'TEXT',
      style_tokens: 'TEXT',
      color_palette: 'TEXT',
      four_view_image_url: 'TEXT',
      created_at: 'TEXT',
      updated_at: 'TEXT',
      deleted_at: 'TEXT',
    },
  },
  {
    name: 'scene_libraries',
    pk: 'id',
    columns: {
      drama_id: 'INTEGER',
      location: 'TEXT NOT NULL DEFAULT \'\'',
      time: 'TEXT',
      prompt: 'TEXT',
      description: 'TEXT',
      image_url: 'TEXT',
      local_path: 'TEXT',
      category: 'TEXT',
      tags: 'TEXT',
      source_type: 'TEXT',
      source_id: 'TEXT',
      created_by_user_id: 'TEXT',
      created_by_username: 'TEXT',
      created_by_display_name: 'TEXT',
      created_at: 'TEXT',
      updated_at: 'TEXT',
      deleted_at: 'TEXT',
    },
  },
  {
    name: 'prop_libraries',
    pk: 'id',
    columns: {
      drama_id: 'INTEGER',
      name: 'TEXT NOT NULL DEFAULT \'\'',
      description: 'TEXT',
      prompt: 'TEXT',
      image_url: 'TEXT',
      local_path: 'TEXT',
      category: 'TEXT',
      tags: 'TEXT',
      source_type: 'TEXT',
      source_id: 'TEXT',
      created_by_user_id: 'TEXT',
      created_by_username: 'TEXT',
      created_by_display_name: 'TEXT',
      created_at: 'TEXT',
      updated_at: 'TEXT',
      deleted_at: 'TEXT',
    },
  },
  {
    name: 'image_proxy_cache',
    pk: 'id',
    columns: {
      cache_key: 'TEXT NOT NULL UNIQUE DEFAULT \'\'',
      proxy_url: 'TEXT NOT NULL DEFAULT \'\'',
      created_at: 'TEXT NOT NULL DEFAULT \'\'',
    },
  },
  {
    name: 'ai_model_map',
    pk: 'id',
    columns: {
      key: 'TEXT NOT NULL UNIQUE DEFAULT \'\'',
      service_type: 'TEXT NOT NULL DEFAULT \'text\'',
      config_id: 'INTEGER',
      model_override: 'TEXT',
      description: 'TEXT',
      created_at: 'TEXT NOT NULL DEFAULT \'\'',
      updated_at: 'TEXT NOT NULL DEFAULT \'\'',
    },
  },
  {
    name: 'storyboard_characters',
    pk: 'id',
    unique: ['storyboard_id', 'character_id'],
    columns: {
      storyboard_id: 'INTEGER NOT NULL',
      character_id: 'INTEGER NOT NULL',
      created_at: 'TEXT NOT NULL DEFAULT \'\'',
    },
  },
  {
    name: 'global_settings',
    textPk: 'key',
    columns: {
      value: 'TEXT NOT NULL DEFAULT \'\'',
      updated_at: 'TEXT NOT NULL DEFAULT \'\'',
    },
  },
  {
    name: 'prompt_overrides',
    textPk: 'key',
    columns: {
      content: 'TEXT NOT NULL DEFAULT \'\'',
      updated_at: 'TEXT NOT NULL DEFAULT \'\'',
    },
  },
];

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function createSql(def) {
  const parts = [];
  if (def.pk) parts.push(`${quoteIdent(def.pk)} BIGSERIAL PRIMARY KEY`);
  if (def.textPk) parts.push(`${quoteIdent(def.textPk)} TEXT PRIMARY KEY`);
  for (const [name, type] of Object.entries(def.columns)) {
    parts.push(`${quoteIdent(name)} ${type}`);
  }
  if (def.compositePk) {
    parts.push(`PRIMARY KEY (${def.compositePk.map(quoteIdent).join(', ')})`);
  }
  return `CREATE TABLE IF NOT EXISTS ${quoteIdent(def.name)} (${parts.join(', ')})`;
}

function ensurePgSchema(db) {
  for (const def of tableDefs) {
    db.exec(createSql(def));
    for (const [name, type] of Object.entries(def.columns)) {
      const alterType = type.replace(/\s+UNIQUE\b/ig, '');
      db.exec(`ALTER TABLE ${quoteIdent(def.name)} ADD COLUMN IF NOT EXISTS ${quoteIdent(name)} ${alterType}`);
    }
    if (def.unique?.length) {
      const idx = `${def.name}_${def.unique.join('_')}_uniq`;
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ${quoteIdent(idx)} ON ${quoteIdent(def.name)} (${def.unique.map(quoteIdent).join(', ')})`);
    }
    for (const [name, type] of Object.entries(def.columns)) {
      if (/\bUNIQUE\b/i.test(type)) {
        const idx = `${def.name}_${name}_uniq`;
        db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ${quoteIdent(idx)} ON ${quoteIdent(def.name)} (${quoteIdent(name)})`);
      }
    }
  }
}

function sqliteTableExists(sqliteDb, table) {
  return !!sqliteDb
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table);
}

function pgBusinessRows(db) {
  const checks = ['dramas', 'ai_service_configs', 'character_libraries', 'scene_libraries', 'prop_libraries'];
  return checks.reduce((sum, table) => {
    try {
      const row = db.prepare(`SELECT COUNT(*) AS total FROM ${quoteIdent(table)}`).get();
      return sum + Number(row?.total || 0);
    } catch (_) {
      return sum;
    }
  }, 0);
}

function sourceColumns(sqliteDb, table) {
  return sqliteDb.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all().map((r) => r.name);
}

function importTable(db, sqliteDb, def) {
  if (!sqliteTableExists(sqliteDb, def.name)) return 0;
  const allowed = new Set([
    ...(def.pk ? [def.pk] : []),
    ...(def.textPk ? [def.textPk] : []),
    ...(def.compositePk || []),
    ...Object.keys(def.columns),
  ]);
  const cols = sourceColumns(sqliteDb, def.name).filter((name) => allowed.has(name));
  if (!cols.length) return 0;
  const rows = sqliteDb.prepare(`SELECT ${cols.map(quoteIdent).join(', ')} FROM ${quoteIdent(def.name)}`).all();
  if (!rows.length) return 0;
  const placeholders = cols.map(() => '?').join(', ');
  const sql = `INSERT INTO ${quoteIdent(def.name)} (${cols.map(quoteIdent).join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
  const stmt = db.prepare(sql);
  for (const row of rows) {
    stmt.run(...cols.map((col) => row[col]));
  }
  return rows.length;
}

function resetSequences(db) {
  for (const def of tableDefs.filter((x) => x.pk)) {
    db.exec(
      `SELECT setval(pg_get_serial_sequence('${def.name}', '${def.pk}'), ` +
      `GREATEST((SELECT COALESCE(MAX(${quoteIdent(def.pk)}), 1) FROM ${quoteIdent(def.name)}), 1), true)`
    );
  }
}

function migrateSqliteToPgIfNeeded(db, sqlitePath, log) {
  if (String(process.env.PG_MIGRATE_SQLITE_ON_START || 'true').toLowerCase() === 'false') return;
  if (!sqlitePath || !fs.existsSync(sqlitePath)) return;
  const existing = pgBusinessRows(db);
  if (existing > 0) {
    log?.info?.('PG business tables already contain data; SQLite import skipped', { rows: existing });
    return;
  }
  const sqliteDb = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  let imported = 0;
  try {
    for (const def of tableDefs) imported += importTable(db, sqliteDb, def);
    resetSequences(db);
    log?.info?.('SQLite business data imported into PostgreSQL', { imported, source: sqlitePath });
  } finally {
    sqliteDb.close();
  }
}

module.exports = {
  tableDefs,
  ensurePgSchema,
  migrateSqliteToPgIfNeeded,
};
