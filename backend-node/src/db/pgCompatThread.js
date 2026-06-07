const fs = require('fs');
const { parentPort } = require('worker_threads');
const { Pool, types } = require('pg');

types.setTypeParser(20, (v) => {
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : v;
});
types.setTypeParser(21, (v) => Number(v));
types.setTypeParser(23, (v) => Number(v));
types.setTypeParser(700, (v) => Number(v));
types.setTypeParser(701, (v) => Number(v));
types.setTypeParser(1700, (v) => Number(v));

function buildPoolConfig() {
  const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  const ssl = /^true$/i.test(String(process.env.PGSSL || ''));
  const common = {
    max: Number(process.env.PG_COMPAT_POOL_MAX || 8),
    idleTimeoutMillis: Number(process.env.PG_COMPAT_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.PG_COMPAT_CONNECT_TIMEOUT_MS || 5000),
    query_timeout: Number(process.env.PG_COMPAT_QUERY_TIMEOUT_MS || 15000),
  };
  if (databaseUrl) {
    return {
      ...common,
      connectionString: databaseUrl,
      ssl: ssl ? { rejectUnauthorized: false } : undefined,
    };
  }
  return {
    ...common,
    host: process.env.PGHOST || process.env.POSTGRES_HOST || '127.0.0.1',
    port: Number(process.env.PGPORT || process.env.POSTGRES_PORT || 5432),
    database: process.env.PGDATABASE || process.env.POSTGRES_DB || 'qnvideo_gzt',
    user: process.env.PGUSER || process.env.POSTGRES_USER || 'qnvideo_gzt',
    password: process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || '',
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
  };
}

const pool = new Pool(buildPoolConfig());

async function runQuery(message) {
  const { sql, params, resultPath, signal } = message;
  try {
    const result = await pool.query(sql, params || []);
    fs.writeFileSync(
      resultPath,
      JSON.stringify({
        ok: true,
        rows: result.rows || [],
        rowCount: result.rowCount || 0,
      })
    );
  } catch (err) {
    fs.writeFileSync(
      resultPath,
      JSON.stringify({
        ok: false,
        error: err.message,
        detail: err.detail,
        code: err.code,
      })
    );
  } finally {
    Atomics.store(signal, 0, 1);
    Atomics.notify(signal, 0, 1);
  }
}

parentPort.on('message', (message) => {
  runQuery(message);
});

process.once('beforeExit', async () => {
  try {
    await pool.end();
  } catch (_) {}
});
