const { spawnSync } = require('child_process');
const path = require('path');

const workerPath = path.join(__dirname, 'pgCompatWorker.js');

const tablesWithSerialId = new Set([
  'dramas',
  'episodes',
  'storyboards',
  'characters',
  'scenes',
  'props',
  'frame_prompts',
  'ai_service_configs',
  'image_generations',
  'video_generations',
  'video_merges',
  'assets',
  'character_libraries',
  'scene_libraries',
  'prop_libraries',
  'image_proxy_cache',
  'ai_model_map',
  'storyboard_characters',
]);

function normalizeParams(params) {
  if (params.length === 1 && Array.isArray(params[0])) return params[0].map((v) => v === undefined ? null : v);
  return params.map((v) => v === undefined ? null : v);
}

function replaceQuestionParams(sql) {
  let index = 1;
  let out = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === "'" && !inDouble) {
      out += ch;
      if (inSingle && next === "'") {
        out += next;
        i += 1;
      } else {
        inSingle = !inSingle;
      }
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      out += ch;
      continue;
    }
    if (ch === '?' && !inSingle && !inDouble) {
      out += `$${index}`;
      index += 1;
      continue;
    }
    out += ch;
  }
  return out;
}

function tableFromInsert(sql) {
  const m = sql.match(/^\s*INSERT\s+(?:OR\s+\w+\s+)?INTO\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/i);
  return m ? m[1] : null;
}

function transformSql(sql, mode) {
  let s = String(sql || '').trim().replace(/;+\s*$/, '');
  const rawUpper = s.toUpperCase();
  if (rawUpper === 'SELECT LAST_INSERT_ROWID() AS ID') {
    return { sql: s, special: 'lastInsertRowid' };
  }

  s = s.replace(/INSERT\s+OR\s+IGNORE\s+INTO/ig, 'INSERT INTO');
  if (/INSERT\s+OR\s+REPLACE\s+INTO\s+image_proxy_cache/i.test(s)) {
    s = s.replace(/INSERT\s+OR\s+REPLACE\s+INTO/ig, 'INSERT INTO');
    if (!/ON\s+CONFLICT/i.test(s)) {
      s += ' ON CONFLICT (cache_key) DO UPDATE SET proxy_url = EXCLUDED.proxy_url, created_at = EXCLUDED.created_at';
    }
  } else if (/INSERT\s+OR\s+REPLACE\s+INTO\s+prompt_overrides/i.test(s)) {
    s = s.replace(/INSERT\s+OR\s+REPLACE\s+INTO/ig, 'INSERT INTO');
    if (!/ON\s+CONFLICT/i.test(s)) {
      s += ' ON CONFLICT (key) DO UPDATE SET content = EXCLUDED.content, updated_at = EXCLUDED.updated_at';
    }
  } else {
    s = s.replace(/INSERT\s+OR\s+REPLACE\s+INTO/ig, 'INSERT INTO');
  }

  if (/^\s*INSERT\s+INTO/i.test(s) && /OR\s+IGNORE/i.test(rawUpper) && !/ON\s+CONFLICT/i.test(s)) {
    s += ' ON CONFLICT DO NOTHING';
  }

  s = s.replace(
    /datetime\('now',\s*'-5 minutes'\)/ig,
    "to_char(NOW() - INTERVAL '5 minutes', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')"
  );

  const table = tableFromInsert(s);
  const shouldReturnId =
    mode === 'run' &&
    table &&
    tablesWithSerialId.has(table) &&
    !/\bRETURNING\b/i.test(s);

  s = replaceQuestionParams(s);
  if (shouldReturnId) s += ' RETURNING id';
  return { sql: s, insertTable: table, returnsId: shouldReturnId };
}

function runWorker(sql, params) {
  const child = spawnSync(process.execPath, [workerPath], {
    input: JSON.stringify({ sql, params }),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: process.env,
  });
  const raw = child.stdout || '';
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch (err) {
    throw new Error(`PG worker returned invalid JSON: ${raw.slice(0, 500)}`);
  }
  if (child.status !== 0 || !payload?.ok) {
    const msg = payload?.error || child.stderr || `PG worker failed with status ${child.status}`;
    throw new Error(msg);
  }
  return payload;
}

class PgCompatStatement {
  constructor(db, sql) {
    this.db = db;
    this.originalSql = sql;
  }

  all(...params) {
    const transformed = transformSql(this.originalSql, 'all');
    if (transformed.special === 'lastInsertRowid') return [{ id: this.db.lastInsertRowid || null }];
    const result = runWorker(transformed.sql, normalizeParams(params));
    return result.rows || [];
  }

  get(...params) {
    const transformed = transformSql(this.originalSql, 'get');
    if (transformed.special === 'lastInsertRowid') return { id: this.db.lastInsertRowid || null };
    const result = runWorker(transformed.sql, normalizeParams(params));
    return (result.rows || [])[0];
  }

  run(...params) {
    const transformed = transformSql(this.originalSql, 'run');
    const result = runWorker(transformed.sql, normalizeParams(params));
    if (transformed.returnsId && result.rows?.[0]?.id != null) {
      this.db.lastInsertRowid = result.rows[0].id;
    }
    return {
      changes: result.rowCount || 0,
      lastInsertRowid: transformed.returnsId && result.rows?.[0]?.id != null
        ? result.rows[0].id
        : this.db.lastInsertRowid || null,
    };
  }
}

class PgCompatDb {
  constructor(config = {}) {
    this.config = config;
    this.kind = 'postgres';
    this.lastInsertRowid = null;
  }

  prepare(sql) {
    return new PgCompatStatement(this, sql);
  }

  exec(sql) {
    if (!String(sql || '').trim()) return;
    runWorker(sql, []);
  }

  pragma() {
    return undefined;
  }

  columnsOf(table) {
    const rows = this.prepare(
      `SELECT column_name AS name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ?`
    ).all(table);
    return rows.map((row) => row.name);
  }

  transaction(fn) {
    return (...args) => fn(...args);
  }

  close() {}
}

module.exports = { PgCompatDb, transformSql };
