const fs = require('fs');
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

function readPayload() {
  const raw = fs.readFileSync(0, 'utf8');
  return raw ? JSON.parse(raw) : {};
}

function buildPoolConfig() {
  const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  const ssl = /^true$/i.test(String(process.env.PGSSL || ''));
  if (databaseUrl) {
    return { connectionString: databaseUrl, ssl: ssl ? { rejectUnauthorized: false } : undefined };
  }
  return {
    host: process.env.PGHOST || process.env.POSTGRES_HOST || '127.0.0.1',
    port: Number(process.env.PGPORT || process.env.POSTGRES_PORT || 5432),
    database: process.env.PGDATABASE || process.env.POSTGRES_DB || 'qnvideo_gzt',
    user: process.env.PGUSER || process.env.POSTGRES_USER || 'qnvideo_gzt',
    password: process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || '',
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
  };
}

(async () => {
  const payload = readPayload();
  const pool = new Pool(buildPoolConfig());
  try {
    const result = await pool.query(payload.sql, payload.params || []);
    process.stdout.write(JSON.stringify({
      ok: true,
      rows: result.rows || [],
      rowCount: result.rowCount || 0,
    }));
  } finally {
    await pool.end();
  }
})().catch((err) => {
  process.stdout.write(JSON.stringify({
    ok: false,
    error: err.message,
    detail: err.detail,
    code: err.code,
  }));
  process.exit(1);
});
