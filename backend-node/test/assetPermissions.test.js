const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const assetService = require('../src/services/assetService');

const log = {
  info() {},
  warn() {},
  error() {},
};

function createDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE dramas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id TEXT,
      deleted_at TEXT
    );
    CREATE TABLE assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drama_id INTEGER,
      name TEXT,
      type TEXT,
      category TEXT,
      url TEXT,
      local_path TEXT,
      file_size INTEGER,
      mime_type TEXT,
      width INTEGER,
      height INTEGER,
      duration REAL,
      image_gen_id INTEGER,
      video_gen_id INTEGER,
      created_by_user_id TEXT,
      created_by_username TEXT,
      created_by_display_name TEXT,
      created_at TEXT,
      updated_at TEXT,
      deleted_at TEXT
    );
  `);
  return db;
}

test('asset delete is allowed for creator and admin only', () => {
  const db = createDb();
  const owner = { id: 'u1', username: 'staff1', role: 'user' };
  const other = { id: 'u2', username: 'staff2', role: 'user' };
  const admin = { id: 'admin', username: 'admin', role: 'admin' };

  const ownAsset = assetService.create(db, log, {
    name: 'own',
    type: 'image',
    url: '/static/own.png',
    user: owner,
  });
  assert.equal(ownAsset.can_manage, true);
  assert.deepEqual(assetService.deleteById(db, log, ownAsset.id, other), { forbidden: true });
  assert.equal(assetService.deleteById(db, log, ownAsset.id, owner), true);

  const otherAsset = assetService.create(db, log, {
    name: 'other',
    type: 'image',
    url: '/static/other.png',
    user: other,
  });
  assert.equal(assetService.deleteById(db, log, otherAsset.id, admin), true);
});
