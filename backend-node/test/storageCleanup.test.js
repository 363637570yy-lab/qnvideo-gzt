const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const fs = require('fs');
const os = require('os');
const path = require('path');

const cleanup = require('../src/services/storageCleanupService');

const log = {
  info() {},
  warn() {},
  error() {},
};

function createDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE async_tasks (
      id TEXT PRIMARY KEY,
      type TEXT,
      status TEXT,
      progress INTEGER,
      message TEXT,
      resource_id TEXT,
      created_at TEXT,
      updated_at TEXT,
      completed_at TEXT,
      error TEXT,
      result TEXT,
      deleted_at TEXT
    );
    CREATE TABLE image_generations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      storyboard_id INTEGER,
      drama_id INTEGER,
      scene_id INTEGER,
      character_id INTEGER,
      image_url TEXT,
      local_path TEXT,
      reference_images TEXT,
      status TEXT,
      task_id TEXT,
      deleted_at TEXT
    );
    CREATE TABLE video_generations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drama_id INTEGER,
      storyboard_id INTEGER,
      image_url TEXT,
      first_frame_url TEXT,
      last_frame_url TEXT,
      reference_image_urls TEXT,
      video_url TEXT,
      local_path TEXT,
      status TEXT,
      task_id TEXT,
      deleted_at TEXT
    );
    CREATE TABLE video_merges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      episode_id INTEGER,
      merged_url TEXT,
      scenes TEXT,
      status TEXT,
      task_id TEXT,
      deleted_at TEXT
    );
    CREATE TABLE assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT,
      local_path TEXT,
      deleted_at TEXT
    );
    CREATE TABLE character_libraries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_url TEXT,
      local_path TEXT,
      source_type TEXT,
      source_id TEXT,
      deleted_at TEXT
    );
    CREATE TABLE scene_libraries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_url TEXT,
      local_path TEXT,
      source_type TEXT,
      source_id TEXT,
      deleted_at TEXT
    );
    CREATE TABLE prop_libraries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_url TEXT,
      local_path TEXT,
      source_type TEXT,
      source_id TEXT,
      deleted_at TEXT
    );
    CREATE TABLE characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_url TEXT,
      local_path TEXT,
      four_view_image_url TEXT,
      extra_images TEXT,
      ref_image TEXT,
      seedance2_asset TEXT,
      seedance2_voice_asset TEXT,
      deleted_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE scenes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_url TEXT,
      local_path TEXT,
      extra_images TEXT,
      ref_image TEXT,
      deleted_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE props (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_url TEXT,
      local_path TEXT,
      extra_images TEXT,
      ref_image TEXT,
      deleted_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE storyboards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_url TEXT,
      local_path TEXT,
      first_frame_image_id INTEGER,
      last_frame_image_id INTEGER,
      last_frame_image_url TEXT,
      last_frame_local_path TEXT,
      video_url TEXT,
      audio_local_path TEXT,
      narration_audio_local_path TEXT,
      deleted_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE episodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_url TEXT,
      thumbnail TEXT,
      deleted_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE episode_characters (episode_id INTEGER, character_id INTEGER);
    CREATE TABLE storyboard_props (storyboard_id INTEGER, prop_id INTEGER);
  `);
  return db;
}

function tempStorage() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'qnvideo-cleanup-'));
}

function writeFile(root, rel) {
  const abs = path.join(root, rel.replace(/\//g, path.sep));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, 'x');
  return abs;
}

test('image generation delete clears entity field and removes unreferenced file', () => {
  const db = createDb();
  const root = tempStorage();
  const rel = 'projects/0001/images/one.png';
  const abs = writeFile(root, rel);
  db.prepare('INSERT INTO characters (id, image_url, local_path) VALUES (1, ?, ?)').run('/static/' + rel, rel);
  db.prepare('INSERT INTO image_generations (id, character_id, image_url, local_path, status) VALUES (10, 1, ?, ?, ?)').run('/static/' + rel, rel, 'completed');

  const summary = cleanup.deleteImageGenerationById(db, log, 10, { storageRoot: root });

  assert.equal(fs.existsSync(abs), false);
  assert.ok(summary.files_deleted.some((x) => x.path === rel));
  assert.ok(db.prepare('SELECT deleted_at FROM image_generations WHERE id = 10').get().deleted_at);
  assert.equal(db.prepare('SELECT image_url FROM characters WHERE id = 1').get().image_url, null);
});

test('image generation delete keeps file when active asset library references it', () => {
  const db = createDb();
  const root = tempStorage();
  const rel = 'projects/0001/images/kept.png';
  const abs = writeFile(root, rel);
  db.prepare('INSERT INTO image_generations (id, image_url, local_path, status) VALUES (11, ?, ?, ?)').run('/static/' + rel, rel, 'completed');
  db.prepare('INSERT INTO assets (url, local_path) VALUES (?, ?)').run('/static/' + rel, rel);

  const summary = cleanup.deleteImageGenerationById(db, log, 11, { storageRoot: root });

  assert.equal(fs.existsSync(abs), true);
  assert.ok(summary.files_kept.some((x) => x.path === rel && x.reason === 'referenced'));
});

test('task delete soft-deletes linked generation records and cleans files', () => {
  const db = createDb();
  const root = tempStorage();
  const rel = 'projects/0001/videos/clip.mp4';
  const abs = writeFile(root, rel);
  db.prepare('INSERT INTO async_tasks (id, type, status) VALUES (?, ?, ?)').run('task-1', 'video_generation', 'completed');
  db.prepare('INSERT INTO storyboards (id, video_url, local_path) VALUES (1, ?, ?)').run('/static/' + rel, rel);
  db.prepare('INSERT INTO video_generations (id, storyboard_id, video_url, local_path, status, task_id) VALUES (20, 1, ?, ?, ?, ?)').run('/static/' + rel, rel, 'completed', 'task-1');

  const summary = cleanup.deleteTaskAndArtifacts(db, log, 'task-1', { storageRoot: root });

  assert.equal(fs.existsSync(abs), false);
  assert.ok(db.prepare('SELECT deleted_at FROM async_tasks WHERE id = ?').get('task-1').deleted_at);
  assert.ok(db.prepare('SELECT deleted_at FROM video_generations WHERE id = 20').get().deleted_at);
  assert.equal(db.prepare('SELECT video_url FROM storyboards WHERE id = 1').get().video_url, null);
  assert.ok(summary.db_deleted.includes('async_tasks:task-1'));
});
