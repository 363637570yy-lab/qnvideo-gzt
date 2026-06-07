const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

let pool = null;
let readyPromise = null;
let cachedAdmin = null;

function authEnabled() {
  return String(process.env.AUTH_ENABLED || 'true').toLowerCase() !== 'false';
}

function getJwtSecret() {
  return process.env.JWT_SECRET || process.env.AUTH_JWT_SECRET || 'qnvideo-gzt-dev-secret-change-me';
}

function getPool() {
  if (pool) return pool;
  const databaseUrl = process.env.DATABASE_URL || process.env.PG_DATABASE_URL;
  const sslFlag = String(process.env.PGSSL || process.env.PG_SSL || '').toLowerCase();
  const ssl = ['1', 'true', 'require'].includes(sslFlag) ? { rejectUnauthorized: false } : false;
  pool = databaseUrl
    ? new Pool({ connectionString: databaseUrl, ssl })
    : new Pool({
        host: process.env.PGHOST || process.env.POSTGRES_HOST || '127.0.0.1',
        port: Number(process.env.PGPORT || process.env.POSTGRES_PORT || 5432),
        database: process.env.PGDATABASE || process.env.POSTGRES_DB || 'qnvideo-gzt',
        user: process.env.PGUSER || process.env.POSTGRES_USER || 'qnvideo-gzt',
        password: process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || '',
        ssl,
      });
  return pool;
}

function hashPassword(password) {
  const iterations = 210000;
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(password), salt, iterations, 32, 'sha256').toString('hex');
  return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
}

function verifyPassword(password, encoded) {
  if (!encoded || typeof encoded !== 'string') return false;
  const [scheme, iterRaw, salt, expected] = encoded.split('$');
  if (scheme !== 'pbkdf2_sha256' || !iterRaw || !salt || !expected) return false;
  const iterations = Number(iterRaw);
  const actual = crypto.pbkdf2Sync(String(password), salt, iterations, 32, 'sha256').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

async function query(sql, params = []) {
  const result = await getPool().query(sql, params);
  return result;
}

async function ensureIdentityDb(log) {
  if (!authEnabled()) return { admin: null };
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
        display_name TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_login_at TIMESTAMPTZ
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_by UUID,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS project_owners (
        project_id INTEGER PRIMARY KEY,
        owner_user_id UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'change-me-before-first-login';
    const existing = await query('SELECT id, username, role, is_active FROM users WHERE username = $1', [adminUsername]);
    if (existing.rows.length === 0) {
      const id = crypto.randomUUID();
      await query(
        `INSERT INTO users (id, username, password_hash, role, display_name)
         VALUES ($1, $2, $3, 'admin', $4)`,
        [id, adminUsername, hashPassword(adminPassword), '管理员']
      );
      cachedAdmin = { id, username: adminUsername, role: 'admin', is_active: true };
      log?.warn?.('Default admin account created. Change password after first login.', { username: adminUsername });
    } else {
      cachedAdmin = existing.rows[0];
    }
    return { admin: cachedAdmin };
  })();
  return readyPromise;
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    display_name: row.display_name || '',
    is_active: row.is_active !== false,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_login_at: row.last_login_at,
  };
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

async function login(username, password, log) {
  await ensureIdentityDb(log);
  const result = await query('SELECT * FROM users WHERE username = $1', [String(username || '').trim()]);
  const user = result.rows[0];
  if (!user || !user.is_active || !verifyPassword(password || '', user.password_hash)) {
    return null;
  }
  await query('UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1', [user.id]);
  const safe = publicUser(user);
  return { user: safe, token: signToken(safe) };
}

async function getUserById(id, log) {
  await ensureIdentityDb(log);
  const result = await query('SELECT * FROM users WHERE id = $1', [id]);
  return publicUser(result.rows[0]);
}

async function verifyToken(token, log) {
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, getJwtSecret());
  } catch (_) {
    return null;
  }
  const user = await getUserById(payload.sub, log);
  if (!user || !user.is_active) return null;
  return user;
}

async function listUsers(log) {
  await ensureIdentityDb(log);
  const result = await query(
    'SELECT id, username, role, display_name, is_active, created_at, updated_at, last_login_at FROM users ORDER BY created_at ASC'
  );
  return result.rows.map(publicUser);
}

async function createUser(input, actor, log) {
  await ensureIdentityDb(log);
  const username = String(input.username || '').trim();
  const password = String(input.password || '');
  const role = input.role === 'admin' ? 'admin' : 'user';
  if (!username || username.length < 3) throw new Error('用户名至少 3 个字符');
  if (!password || password.length < 6) throw new Error('密码至少 6 个字符');
  const id = crypto.randomUUID();
  const result = await query(
    `INSERT INTO users (id, username, password_hash, role, display_name)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, username, role, display_name, is_active, created_at, updated_at, last_login_at`,
    [id, username, hashPassword(password), role, input.display_name || username]
  );
  log?.info?.('User created', { username, role, actor: actor?.username });
  return publicUser(result.rows[0]);
}

async function updateUser(id, input, actor, log) {
  await ensureIdentityDb(log);
  const fields = [];
  const values = [];
  let idx = 1;
  if (input.display_name !== undefined) {
    fields.push(`display_name = $${idx++}`);
    values.push(input.display_name || null);
  }
  if (input.role !== undefined) {
    fields.push(`role = $${idx++}`);
    values.push(input.role === 'admin' ? 'admin' : 'user');
  }
  if (input.is_active !== undefined) {
    fields.push(`is_active = $${idx++}`);
    values.push(!!input.is_active);
  }
  if (input.password) {
    if (String(input.password).length < 6) throw new Error('密码至少 6 个字符');
    fields.push(`password_hash = $${idx++}`);
    values.push(hashPassword(input.password));
  }
  if (!fields.length) return getUserById(id, log);
  values.push(id);
  const result = await query(
    `UPDATE users SET ${fields.join(', ')}, updated_at = NOW()
     WHERE id = $${idx}
     RETURNING id, username, role, display_name, is_active, created_at, updated_at, last_login_at`,
    values
  );
  log?.info?.('User updated', { id, actor: actor?.username });
  return publicUser(result.rows[0]);
}

function assignUnownedDramasToAdmin(sqliteDb, log, adminId) {
  if (!sqliteDb || !adminId) return;
  try {
    sqliteDb.prepare(
      `UPDATE dramas
       SET owner_user_id = COALESCE(owner_user_id, ?),
           created_by_user_id = COALESCE(created_by_user_id, ?)
       WHERE deleted_at IS NULL AND (owner_user_id IS NULL OR owner_user_id = '')`
    ).run(adminId, adminId);
    log?.info?.('Unowned dramas assigned to admin', { admin_id: adminId });
  } catch (err) {
    log?.warn?.('Failed to assign unowned dramas', { error: err.message });
  }
}

function setDramaOwner(sqliteDb, dramaId, userId) {
  if (!sqliteDb || !dramaId || !userId) return;
  sqliteDb.prepare(
    `UPDATE dramas
     SET owner_user_id = COALESCE(owner_user_id, ?),
         created_by_user_id = COALESCE(created_by_user_id, ?)
     WHERE id = ?`
  ).run(userId, userId, Number(dramaId));
  query(
    `INSERT INTO project_owners (project_id, owner_user_id)
     VALUES ($1, $2)
     ON CONFLICT (project_id) DO UPDATE SET owner_user_id = EXCLUDED.owner_user_id, updated_at = NOW()`,
    [Number(dramaId), userId]
  ).catch(() => {});
}

module.exports = {
  authEnabled,
  ensureIdentityDb,
  login,
  verifyToken,
  getUserById,
  listUsers,
  createUser,
  updateUser,
  assignUnownedDramasToAdmin,
  setDramaOwner,
};
