const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const dramaService = require('../src/services/dramaService');

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
      title TEXT,
      description TEXT,
      genre TEXT,
      style TEXT,
      total_episodes INTEGER,
      total_duration INTEGER,
      status TEXT,
      thumbnail TEXT,
      tags TEXT,
      metadata TEXT,
      owner_user_id TEXT,
      created_by_user_id TEXT,
      created_at TEXT,
      updated_at TEXT,
      deleted_at TEXT
    );
  `);
  db.prepare(`
    INSERT INTO dramas
      (id, title, description, genre, style, tags, metadata, created_at, updated_at)
    VALUES
      (1, 'Test drama', 'summary', 'drama', 'realistic', ?, ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
  `).run(JSON.stringify(['tag-a']), JSON.stringify({ aspect_ratio: '16:9' }));
  return db;
}

test('saveOutline metadata patch preserves existing tags when tags are omitted', () => {
  const db = createDb();
  const ok = dramaService.saveOutline(db, log, 1, {
    metadata: {
      ai_route_config_ids: { text: '1', image: '' },
      video_clip_duration: 8,
    },
  });
  assert.equal(ok, true);

  const row = db.prepare('SELECT tags, metadata FROM dramas WHERE id = 1').get();
  assert.equal(row.tags, JSON.stringify(['tag-a']));

  const metadata = JSON.parse(row.metadata);
  assert.equal(metadata.aspect_ratio, '16:9');
  assert.equal(metadata.video_clip_duration, 8);
  assert.deepEqual(metadata.ai_route_config_ids, { text: '1', image: '' });
});
