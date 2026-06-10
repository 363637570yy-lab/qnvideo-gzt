const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const workbenchService = require('../src/services/workbenchService');

function createDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE dramas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      description TEXT,
      style TEXT,
      thumbnail TEXT,
      total_episodes INTEGER,
      total_duration INTEGER,
      status TEXT,
      metadata TEXT,
      owner_user_id TEXT,
      created_at TEXT,
      updated_at TEXT,
      deleted_at TEXT
    );
    CREATE TABLE episodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drama_id INTEGER,
      episode_number INTEGER,
      title TEXT,
      script_content TEXT,
      updated_at TEXT,
      deleted_at TEXT
    );
    CREATE TABLE characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drama_id INTEGER,
      name TEXT,
      local_path TEXT,
      updated_at TEXT,
      deleted_at TEXT
    );
    CREATE TABLE scenes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drama_id INTEGER,
      location TEXT,
      local_path TEXT,
      updated_at TEXT,
      deleted_at TEXT
    );
    CREATE TABLE props (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drama_id INTEGER,
      name TEXT,
      local_path TEXT,
      updated_at TEXT,
      deleted_at TEXT
    );
    CREATE TABLE storyboards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      episode_id INTEGER,
      storyboard_number INTEGER,
      title TEXT,
      segment_index INTEGER,
      segment_title TEXT,
      duration INTEGER,
      image_url TEXT,
      local_path TEXT,
      video_url TEXT,
      updated_at TEXT,
      created_at TEXT,
      deleted_at TEXT
    );
    CREATE TABLE image_generations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drama_id INTEGER,
      storyboard_id INTEGER,
      scene_id INTEGER,
      character_id INTEGER,
      status TEXT,
      selected INTEGER,
      image_url TEXT,
      local_path TEXT,
      completed_at TEXT,
      created_at TEXT,
      updated_at TEXT,
      deleted_at TEXT
    );
    CREATE TABLE video_generations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drama_id INTEGER,
      storyboard_id INTEGER,
      provider TEXT,
      prompt TEXT,
      model TEXT,
      ai_config_id INTEGER,
      image_gen_id INTEGER,
      image_url TEXT,
      video_url TEXT,
      local_path TEXT,
      status TEXT,
      task_id TEXT,
      error_msg TEXT,
      created_at TEXT,
      updated_at TEXT,
      completed_at TEXT,
      deleted_at TEXT
    );
    CREATE TABLE video_merges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drama_id INTEGER,
      episode_id INTEGER,
      title TEXT,
      provider TEXT,
      model TEXT,
      status TEXT,
      merged_url TEXT,
      duration INTEGER,
      task_id TEXT,
      error_msg TEXT,
      created_at TEXT,
      updated_at TEXT,
      completed_at TEXT,
      deleted_at TEXT
    );
    CREATE TABLE async_tasks (
      id TEXT PRIMARY KEY,
      type TEXT,
      status TEXT,
      drama_id INTEGER,
      episode_id INTEGER,
      resource_type TEXT,
      resource_id TEXT,
      deleted_at TEXT
    );
    CREATE TABLE ai_service_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_type TEXT,
      provider TEXT,
      api_protocol TEXT,
      name TEXT,
      base_url TEXT,
      api_key TEXT,
      model TEXT,
      default_model TEXT,
      endpoint TEXT,
      query_endpoint TEXT,
      route_order INTEGER,
      retry_count INTEGER,
      cooldown_seconds INTEGER,
      request_timeout_ms INTEGER,
      is_active INTEGER,
      health_status TEXT,
      disabled_until TEXT,
      last_error TEXT,
      last_error_at TEXT,
      failure_count INTEGER,
      capabilities_json TEXT,
      settings TEXT,
      created_at TEXT,
      updated_at TEXT,
      deleted_at TEXT
    );
  `);
  const metadata = {
    aspect_ratio: '9:16',
    image_spec: { mode: 'ratio', tier: '2K', ratio: 'follow_project' },
    video_spec: { mode: 'ratio', tier: '720p', ratio: 'follow_project' },
    video_clip_duration: 15,
    script_language: 'zh',
  };
  db.prepare(
    `INSERT INTO dramas
      (id, title, description, style, total_episodes, total_duration, status, metadata, owner_user_id, created_at, updated_at)
     VALUES
      (1, 'Demo', 'desc', 'sci-fi', 1, 60, 'draft', ?, 'u1', '2026-06-09T00:00:00.000Z', '2026-06-09T01:00:00.000Z')`
  ).run(JSON.stringify(metadata));
  db.prepare('INSERT INTO episodes (id, drama_id, episode_number, title, script_content, updated_at) VALUES (10, 1, 1, ?, ?, ?)').run('第一集', '正文', '2026-06-09T01:10:00.000Z');
  db.prepare('INSERT INTO characters (id, drama_id, name, updated_at) VALUES (20, 1, ?, ?)').run('主角', '2026-06-09T01:20:00.000Z');
  db.prepare('INSERT INTO scenes (id, drama_id, location, updated_at) VALUES (30, 1, ?, ?)').run('街道', '2026-06-09T01:30:00.000Z');
  db.prepare('INSERT INTO props (id, drama_id, name, updated_at) VALUES (40, 1, ?, ?)').run('钥匙', '2026-06-09T01:40:00.000Z');
  db.prepare('INSERT INTO storyboards (id, episode_id, storyboard_number, title, segment_index, segment_title, duration, updated_at, created_at) VALUES (50, 10, 1, ?, 0, ?, 15, ?, ?)').run('开场', '序章', '2026-06-09T01:50:00.000Z', '2026-06-09T01:45:00.000Z');
  db.prepare('UPDATE storyboards SET image_url = ?, local_path = ? WHERE id = 50').run('data:image/png;base64,AAA', 'storyboards/sb50.png');
  db.prepare('INSERT INTO video_generations (id, drama_id, storyboard_id, provider, model, video_url, status, created_at, updated_at, completed_at) VALUES (60, 1, 50, ?, ?, ?, ?, ?, ?, ?)').run('mock', 'video-test', 'videos/sb50.mp4', 'completed', '2026-06-09T02:00:00.000Z', '2026-06-09T02:05:00.000Z', '2026-06-09T02:05:00.000Z');
  db.prepare('INSERT INTO video_merges (id, drama_id, episode_id, title, provider, status, merged_url, duration, created_at, updated_at, completed_at) VALUES (70, 1, 10, ?, ?, ?, ?, 15, ?, ?, ?)').run('第一集合成', 'ffmpeg', 'completed', 'videos/merged.mp4', '2026-06-09T02:10:00.000Z', '2026-06-09T02:15:00.000Z', '2026-06-09T02:15:00.000Z');
  db.prepare('INSERT INTO async_tasks (id, type, status, drama_id, resource_type, resource_id) VALUES (?, ?, ?, ?, ?, ?)').run('task-1', 'image_generation', 'processing', 1, 'character', 'character_20');
  db.prepare('INSERT INTO ai_service_configs (id, service_type, provider, name, model, default_model, route_order, is_active, health_status, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?)').run('text', 'openai', 'OpenAI 文本', JSON.stringify(['gpt-test']), 'gpt-test', 'ok', '2026-06-09T00:00:00.000Z', '2026-06-09T00:00:00.000Z');
  return db;
}

test('workbench summary returns lightweight counts and project settings', () => {
  const db = createDb();
  const summary = workbenchService.getWorkbenchSummary(db, 1);
  assert.equal(summary.project.title, 'Demo');
  assert.equal(summary.settings.aspect_ratio, '9:16');
  assert.equal(summary.settings.default_segment_duration, 15);
  assert.equal(summary.tabs.script.ready, true);
  assert.equal(summary.tabs.characters.count, 1);
  assert.equal(summary.tabs.characters.running_tasks, 1);
  assert.equal(summary.tabs.storyboards.count, 1);
  assert.equal(summary.generation_strategy.text.config_name, 'OpenAI 文本');
  const progressByKey = Object.fromEntries(summary.progress_steps.map((step) => [step.key, step]));
  assert.equal(progressByKey.script.status, 'done');
  assert.equal(progressByKey.chars.status, 'generating');
  assert.equal(progressByKey.props.status, 'partial');
  assert.equal(progressByKey.scenes.status, 'partial');
  assert.equal(progressByKey.sb.status, 'done');
  assert.equal(progressByKey.sbimg.status, 'done');
  assert.equal(progressByKey.video.status, 'done');
  assert.equal(progressByKey.sbimg.ready_count, 1);
  assert.equal(progressByKey.video.ready_count, 1);
  assert.equal(summary.storyboard_outline.length, 1);
  assert.equal(summary.storyboard_outline[0].id, 50);
  assert.equal(summary.storyboard_outline[0].title, '开场');
  assert.equal(summary.storyboard_outline[0].segment_index, 0);
  assert.equal(summary.storyboard_outline[0].segment_title, '序章');
  assert.equal(Object.hasOwn(summary.storyboard_outline[0], 'image_url'), false);
  assert.equal(Object.hasOwn(summary.storyboard_outline[0], 'video_url'), false);
  assert.equal(Object.hasOwn(summary.project, 'episodes'), false);
  assert.equal(Object.hasOwn(summary, 'storyboards'), false);

  db.prepare('INSERT INTO episodes (id, drama_id, episode_number, title, script_content, updated_at) VALUES (11, 1, 2, ?, ?, ?)').run('第二集', '', '2026-06-09T03:00:00.000Z');
  db.prepare('INSERT INTO storyboards (id, episode_id, storyboard_number, title, segment_index, segment_title, duration, updated_at, created_at) VALUES (51, 11, 1, ?, 0, ?, 15, ?, ?)').run('第二集开场', '第二序章', '2026-06-09T03:10:00.000Z', '2026-06-09T03:05:00.000Z');
  const scoped = workbenchService.getWorkbenchSummary(db, 1, { episode_id: 10 });
  const scopedProgressByKey = Object.fromEntries(scoped.progress_steps.map((step) => [step.key, step]));
  assert.equal(scoped.progress_scope.type, 'episode');
  assert.equal(scoped.progress_scope.episode_id, 10);
  assert.equal(scopedProgressByKey.script.count, 1);
  assert.equal(scopedProgressByKey.sb.count, 1);
  assert.equal(scopedProgressByKey.sbimg.status, 'done');
  assert.equal(scopedProgressByKey.video.status, 'done');
  assert.equal(scoped.storyboard_outline.length, 1);
  assert.equal(scoped.storyboard_outline[0].id, 50);
});

test('workbench summary returns null for missing project', () => {
  const db = createDb();
  assert.equal(workbenchService.getWorkbenchSummary(db, 999), null);
});

test('workbench summary ignores stale episode id and falls back to project scope', () => {
  const db = createDb();
  const summary = workbenchService.getWorkbenchSummary(db, 1, { episode_id: 999 });
  assert.equal(summary.project.id, 1);
  assert.equal(summary.progress_scope.type, 'project');
  assert.equal(summary.progress_scope.episode_id, null);
  assert.equal(summary.tabs.script.count, 1);
  assert.equal(summary.storyboard_outline.length, 1);
  assert.equal(summary.storyboard_outline[0].id, 50);

  assert.throws(
    () => workbenchService.getStoryboardsTab(db, 1, { episode_id: 999 }),
    /剧集不存在或不属于当前项目/
  );
});

test('workbench tab view models return script and asset data on demand', () => {
  const db = createDb();
  const script = workbenchService.getScriptTab(db, 1);
  assert.equal(script.episodes.length, 1);
  assert.equal(script.episodes[0].script_content, '正文');
  assert.equal(script.summary.ready, true);

  const characters = workbenchService.getAssetTab(db, 1, { type: 'character' });
  assert.equal(characters.items.length, 1);
  assert.equal(characters.items[0].name, '主角');
  assert.equal(characters.summary.count, 1);
});

test('workbench storyboard and video compose tabs return current episode data on demand', () => {
  const db = createDb();
  const storyboards = workbenchService.getStoryboardsTab(db, 1, { episode_id: 10 });
  assert.equal(storyboards.episode.id, 10);
  assert.equal(storyboards.storyboards.length, 1);
  assert.equal(storyboards.storyboards[0].title, '开场');
  assert.equal(storyboards.storyboards[0].image_url, null);
  assert.equal(storyboards.storyboards[0].thumbnail_url, '/static-thumb/320/storyboards/sb50.png');
  assert.equal(Object.hasOwn(storyboards.storyboards[0], 'images'), false);
  assert.equal(Object.hasOwn(storyboards.storyboards[0], 'videos'), false);

  const videoCompose = workbenchService.getVideoComposeTab(db, 1, { episode_id: 10 });
  assert.equal(videoCompose.episode.video_url, null);
  assert.equal(videoCompose.videos.length, 1);
  assert.equal(videoCompose.merges.length, 1);
  assert.equal(videoCompose.latest_merge.merged_url, 'videos/merged.mp4');
  assert.equal(videoCompose.summary.ready, true);
});
