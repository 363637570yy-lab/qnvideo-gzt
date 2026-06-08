const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const taskService = require('../src/services/taskService');

function createDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE async_tasks (
      id TEXT PRIMARY KEY,
      type TEXT,
      status TEXT,
      progress INTEGER,
      message TEXT,
      drama_id INTEGER,
      episode_id INTEGER,
      resource_type TEXT,
      resource_id TEXT,
      owner_user_id TEXT,
      operator_user_id TEXT,
      created_at TEXT,
      updated_at TEXT,
      completed_at TEXT,
      error TEXT,
      result TEXT,
      deleted_at TEXT
    );
    CREATE TABLE dramas (
      id INTEGER PRIMARY KEY,
      owner_user_id TEXT,
      deleted_at TEXT
    );
    CREATE TABLE episodes (
      id INTEGER PRIMARY KEY,
      drama_id INTEGER,
      deleted_at TEXT
    );
    CREATE TABLE props (
      id INTEGER PRIMARY KEY,
      drama_id INTEGER,
      episode_id INTEGER,
      deleted_at TEXT
    );
    CREATE TABLE scenes (
      id INTEGER PRIMARY KEY,
      drama_id INTEGER,
      deleted_at TEXT
    );
    CREATE TABLE characters (
      id INTEGER PRIMARY KEY,
      drama_id INTEGER,
      deleted_at TEXT
    );
    CREATE TABLE storyboards (
      id INTEGER PRIMARY KEY,
      episode_id INTEGER,
      deleted_at TEXT
    );
    CREATE TABLE storyboard_props (
      storyboard_id INTEGER,
      prop_id INTEGER
    );
    CREATE TABLE image_generations (
      id INTEGER PRIMARY KEY,
      drama_id INTEGER,
      storyboard_id INTEGER,
      task_id TEXT,
      deleted_at TEXT
    );
    CREATE TABLE video_generations (
      id INTEGER PRIMARY KEY,
      drama_id INTEGER,
      storyboard_id INTEGER,
      task_id TEXT,
      deleted_at TEXT
    );
    CREATE TABLE video_merges (
      id INTEGER PRIMARY KEY,
      drama_id INTEGER,
      task_id TEXT,
      deleted_at TEXT
    );
  `);
  return db;
}

function insertTask(db, id, type, resourceId) {
  db.prepare(
    `INSERT INTO async_tasks (id, type, status, progress, message, resource_id, created_at, updated_at)
     VALUES (?, ?, 'processing', 10, '', ?, '2026-06-08T00:00:00Z', '2026-06-08T00:00:00Z')`
  ).run(id, type, String(resourceId));
}

test('resource task listing filters by task type, drama and episode', () => {
  const db = createDb();
  db.prepare('INSERT INTO dramas (id, owner_user_id) VALUES (?, ?)').run(9, 'u1');
  db.prepare('INSERT INTO episodes (id, drama_id) VALUES (?, ?)').run(27, 9);
  db.prepare('INSERT INTO props (id, drama_id, episode_id) VALUES (?, ?, ?)').run(12, 9, 27);
  db.prepare('INSERT INTO scenes (id, drama_id) VALUES (?, ?)').run(12, 9);
  insertTask(db, 'prop-task', 'prop_image_generation', 12);
  insertTask(db, 'scene-task', 'image_generation', 12);
  db.prepare('INSERT INTO image_generations (id, drama_id, task_id) VALUES (?, ?, ?)').run(1, 9, 'scene-task');

  const tasks = taskService.getTasksByResources(db, ['12'], {
    drama_id: 9,
    episode_id: 27,
    type: 'prop_image_generation',
    user: { id: 'admin', role: 'admin' },
  });

  assert.deepEqual(tasks.map((t) => t.id), ['prop-task']);
});

test('ordinary users only see tasks from their own projects', () => {
  const db = createDb();
  db.prepare('INSERT INTO dramas (id, owner_user_id) VALUES (?, ?), (?, ?)').run(9, 'u1', 10, 'u2');
  db.prepare('INSERT INTO episodes (id, drama_id) VALUES (?, ?), (?, ?)').run(27, 9, 28, 10);
  insertTask(db, 'own-storyboard', 'storyboard_generation', 27);
  insertTask(db, 'other-storyboard', 'storyboard_generation', 28);

  const userTasks = taskService.getTasksByResources(db, ['27', '28'], {
    types: 'storyboard_generation',
    user: { id: 'u1', role: 'user' },
  });
  const adminTasks = taskService.getTasksByResources(db, ['27', '28'], {
    types: 'storyboard_generation',
    user: { id: 'admin', role: 'admin' },
  });

  assert.deepEqual(userTasks.map((t) => t.id), ['own-storyboard']);
  assert.deepEqual(adminTasks.map((t) => t.id).sort(), ['other-storyboard', 'own-storyboard']);
});

test('created tasks store explicit project ownership and operator context', () => {
  const db = createDb();
  db.prepare('INSERT INTO dramas (id, owner_user_id) VALUES (?, ?)').run(9, 'owner-1');
  db.prepare('INSERT INTO episodes (id, drama_id) VALUES (?, ?)').run(27, 9);

  const task = taskService.createTask(db, { info() {} }, 'storyboard_generation', 27, {
    episode_id: 27,
    user: { id: 'admin-1', role: 'admin' },
  });

  assert.equal(task.drama_id, 9);
  assert.equal(task.episode_id, 27);
  assert.equal(task.owner_user_id, 'owner-1');
  assert.equal(task.operator_user_id, 'admin-1');
  assert.equal(taskService.canUserSeeTask(db, task, { id: 'owner-1', role: 'user' }), true);
});

test('scene image tasks resolve scene id without treating it as a drama id', () => {
  const db = createDb();
  db.prepare('INSERT INTO dramas (id, owner_user_id) VALUES (?, ?), (?, ?)').run(12, 'u-wrong', 99, 'u-right');
  db.prepare('INSERT INTO scenes (id, drama_id) VALUES (?, ?)').run(12, 99);

  const task = taskService.createTask(db, { info() {} }, 'image_generation', 12, {
    resource_type: 'scene',
    user: { id: 'operator-1', role: 'admin' },
  });

  assert.equal(task.drama_id, 99);
  assert.equal(task.owner_user_id, 'u-right');
  assert.equal(taskService.canUserSeeTask(db, task, { id: 'u-right', role: 'user' }), true);
  assert.equal(taskService.canUserSeeTask(db, task, { id: 'u-wrong', role: 'user' }), false);
});

test('character extraction tasks resolve project ownership from episode id', () => {
  const db = createDb();
  db.prepare('INSERT INTO dramas (id, owner_user_id) VALUES (?, ?)').run(21, 'writer-1');
  db.prepare('INSERT INTO episodes (id, drama_id) VALUES (?, ?)').run(77, 21);

  const task = taskService.createTask(db, { info() {} }, 'character_extraction', 77, {
    episode_id: 77,
    user: { id: 'admin-1', role: 'admin' },
  });

  assert.equal(task.drama_id, 21);
  assert.equal(task.episode_id, 77);
  assert.equal(task.owner_user_id, 'writer-1');
  assert.equal(task.operator_user_id, 'admin-1');
  assert.equal(taskService.canUserSeeTask(db, task, { id: 'writer-1', role: 'user' }), true);
  assert.equal(taskService.canUserSeeTask(db, task, { id: 'writer-2', role: 'user' }), false);
});

test('projectless tasks are visible only to their operator', () => {
  const db = createDb();

  const task = taskService.createTask(db, { info() {} }, 'image_generation', '', {
    user: { id: 'operator-1', role: 'user' },
  });

  assert.equal(task.drama_id, null);
  assert.equal(task.owner_user_id, null);
  assert.equal(task.operator_user_id, 'operator-1');
  assert.equal(taskService.canUserSeeTask(db, task, { id: 'operator-1', role: 'user' }), true);
  assert.equal(taskService.canUserSeeTask(db, task, { id: 'operator-2', role: 'user' }), false);
});

test('linked generation rows take precedence over ambiguous numeric resource ids', () => {
  const db = createDb();
  db.prepare('INSERT INTO dramas (id, owner_user_id) VALUES (?, ?), (?, ?)').run(1, 'u2', 99, 'u1');
  insertTask(db, 'video-task', 'video_generation', 1);
  db.prepare('INSERT INTO video_generations (id, drama_id, task_id) VALUES (?, ?, ?)').run(7, 99, 'video-task');

  const task = taskService.getTask(db, 'video-task');

  assert.equal(taskService.canUserSeeTask(db, task, { id: 'u1', role: 'user' }), true);
  assert.equal(taskService.canUserSeeTask(db, task, { id: 'u2', role: 'user' }), false);
});
