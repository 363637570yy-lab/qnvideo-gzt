const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const generationQueueService = require('../src/services/generationQueueService');
const taskService = require('../src/services/taskService');

function createDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE global_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT
    );
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
  `);
  return db;
}

test('queued cancellation runs cleanup without starting the generation runner', async () => {
  const db = createDb();
  const task = taskService.createTask(db, { info() {} }, 'image_generation', '1');
  let runnerStarted = false;
  let cleaned = false;

  generationQueueService.enqueue(db, { error() {} }, {
    generationType: 'image',
    taskId: task.id,
    runner: () => {
      runnerStarted = true;
    },
    onCancel: () => {
      cleaned = true;
    },
  });
  taskService.cancelTask(db, task.id);

  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(runnerStarted, false);
  assert.equal(cleaned, true);
});
