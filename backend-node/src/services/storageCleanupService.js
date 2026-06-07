const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../config');

const MEDIA_REF_SPECS = [
  { table: 'assets', columns: ['url', 'local_path'] },
  { table: 'character_libraries', columns: ['image_url', 'local_path'] },
  { table: 'scene_libraries', columns: ['image_url', 'local_path'] },
  { table: 'prop_libraries', columns: ['image_url', 'local_path'] },
  { table: 'characters', columns: ['image_url', 'local_path', 'four_view_image_url', 'extra_images', 'ref_image', 'seedance2_asset', 'seedance2_voice_asset'] },
  { table: 'scenes', columns: ['image_url', 'local_path', 'extra_images', 'ref_image'] },
  { table: 'props', columns: ['image_url', 'local_path', 'extra_images', 'ref_image'] },
  { table: 'storyboards', columns: ['image_url', 'local_path', 'last_frame_image_url', 'last_frame_local_path', 'video_url', 'audio_local_path', 'narration_audio_local_path'] },
  { table: 'episodes', columns: ['video_url', 'thumbnail'] },
  { table: 'image_generations', columns: ['image_url', 'local_path', 'reference_images'] },
  { table: 'video_generations', columns: ['image_url', 'first_frame_url', 'last_frame_url', 'reference_image_urls', 'video_url', 'local_path'] },
  { table: 'video_merges', columns: ['merged_url', 'scenes'] },
];

function getStorageRoot() {
  const cfg = loadConfig();
  const raw = cfg.storage?.local_path || './data/storage';
  return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
}

function normalizeRelPath(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s || s.startsWith('data:') || s.startsWith('asset://')) return null;
  s = s.replace(/\\/g, '/');
  const staticIdx = s.indexOf('/static/');
  if (staticIdx >= 0) s = s.slice(staticIdx + '/static/'.length);
  if (/^https?:\/\//i.test(s)) return null;
  s = s.replace(/^\/+/, '');
  if (!s || s.includes('\0')) return null;
  const normalized = path.posix.normalize(s);
  if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized === '..') return null;
  return normalized.replace(/^\/+/, '');
}

function collectRelPathsFromValue(value, out = new Set()) {
  if (value == null) return out;
  if (Array.isArray(value)) {
    for (const item of value) collectRelPathsFromValue(item, out);
    return out;
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value)) collectRelPathsFromValue(item, out);
    return out;
  }
  const s = String(value).trim();
  if (!s) return out;
  const rel = normalizeRelPath(s);
  if (rel) out.add(rel);
  if ((s.startsWith('[') || s.startsWith('{'))) {
    try {
      collectRelPathsFromValue(JSON.parse(s), out);
    } catch (_) {}
  }
  return out;
}

function relPathsFromRow(row, columns) {
  const paths = new Set();
  for (const col of columns || []) collectRelPathsFromValue(row?.[col], paths);
  return [...paths];
}

function allSafe(db, sql, ...params) {
  try {
    return db.prepare(sql).all(...params);
  } catch (_) {
    return [];
  }
}

function getSafe(db, sql, ...params) {
  try {
    return db.prepare(sql).get(...params);
  } catch (_) {
    return null;
  }
}

function runSafe(db, sql, ...params) {
  try {
    return db.prepare(sql).run(...params);
  } catch (_) {
    return { changes: 0 };
  }
}

function ignoreSetForTable(ignoreRefs, table) {
  return new Set((ignoreRefs?.[table] || []).map((x) => String(x)));
}

function activeRowsForSpec(db, spec, ignoreRefs) {
  const ignored = ignoreSetForTable(ignoreRefs, spec.table);
  const cols = ['id', ...spec.columns].join(', ');
  const rows = allSafe(db, `SELECT ${cols} FROM ${spec.table} WHERE deleted_at IS NULL`);
  if (!ignored.size) return rows;
  return rows.filter((row) => !ignored.has(String(row.id)));
}

function findActiveReferences(db, relPath, ignoreRefs = {}) {
  const rel = normalizeRelPath(relPath);
  if (!rel) return [];
  const refs = [];
  for (const spec of MEDIA_REF_SPECS) {
    for (const row of activeRowsForSpec(db, spec, ignoreRefs)) {
      const rowPaths = relPathsFromRow(row, spec.columns);
      if (rowPaths.includes(rel)) refs.push({ table: spec.table, id: row.id });
    }
  }
  return refs;
}

function safeDeleteFile(storageRoot, relPath) {
  const rel = normalizeRelPath(relPath);
  if (!rel) return { deleted: false, reason: 'invalid_path' };
  const root = path.resolve(storageRoot);
  const abs = path.resolve(root, rel.replace(/\//g, path.sep));
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    return { deleted: false, reason: 'outside_storage' };
  }
  if (!fs.existsSync(abs)) return { deleted: false, reason: 'missing', path: rel };
  const st = fs.statSync(abs);
  if (!st.isFile()) return { deleted: false, reason: 'not_file', path: rel };
  fs.unlinkSync(abs);
  return { deleted: true, path: rel };
}

function defaultSummary() {
  return {
    db_deleted: [],
    db_updated: [],
    files_deleted: [],
    files_kept: [],
  };
}

function pushUnique(list, item) {
  const key = JSON.stringify(item);
  if (!list.some((x) => JSON.stringify(x) === key)) list.push(item);
}

function deleteFilesIfUnreferenced(db, log, relPaths, ignoreRefs, summary, options = {}) {
  const storageRoot = options.storageRoot || getStorageRoot();
  const unique = [...new Set((relPaths || []).map(normalizeRelPath).filter(Boolean))];
  for (const rel of unique) {
    const refs = findActiveReferences(db, rel, ignoreRefs);
    if (refs.length > 0) {
      summary.files_kept.push({ path: rel, reason: 'referenced', refs: refs.slice(0, 5) });
      continue;
    }
    try {
      const result = safeDeleteFile(storageRoot, rel);
      if (result.deleted) {
        summary.files_deleted.push({ path: rel });
      } else {
        summary.files_kept.push({ path: rel, reason: result.reason });
      }
    } catch (err) {
      summary.files_kept.push({ path: rel, reason: 'delete_failed', error: err.message });
      try { log?.warn?.('[cleanup] 删除文件失败', { path: rel, error: err.message }); } catch (_) {}
    }
  }
}

function matchesGeneratedMedia(entity, generated) {
  const targetPaths = relPathsFromRow(generated, ['image_url', 'local_path', 'video_url', 'merged_url']);
  const entityPaths = relPathsFromRow(entity, ['image_url', 'local_path', 'video_url', 'merged_url']);
  const exactGeneratedUrls = [generated?.image_url, generated?.video_url, generated?.merged_url].filter(Boolean).map(String);
  const exactEntityUrls = [entity?.image_url, entity?.video_url, entity?.merged_url].filter(Boolean).map(String);
  return entityPaths.some((p) => targetPaths.includes(p)) || exactEntityUrls.some((u) => exactGeneratedUrls.includes(u));
}

function clearEntityMediaIfMatches(db, summary, table, id, generated, mediaKind = 'image') {
  if (id == null) return;
  const row = getSafe(db, `SELECT * FROM ${table} WHERE id = ? AND deleted_at IS NULL`, Number(id));
  if (!row || !matchesGeneratedMedia(row, generated)) return;
  const now = new Date().toISOString();
  if (mediaKind === 'video') {
    const result = runSafe(db, `UPDATE ${table} SET video_url = NULL, local_path = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NULL`, now, Number(id));
    if (result.changes > 0) summary.db_updated.push(`${table}:${id}:media`);
    return;
  }
  const result = runSafe(db, `UPDATE ${table} SET image_url = NULL, local_path = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NULL`, now, Number(id));
  if (result.changes > 0) summary.db_updated.push(`${table}:${id}:media`);
}

function clearStoryboardImageBindings(db, summary, row) {
  if (!row?.storyboard_id) return;
  const now = new Date().toISOString();
  const sid = Number(row.storyboard_id);
  const id = Number(row.id);
  const r1 = runSafe(
    db,
    'UPDATE storyboards SET first_frame_image_id = NULL, image_url = NULL, local_path = NULL, updated_at = ? WHERE id = ? AND first_frame_image_id = ?',
    now,
    sid,
    id
  );
  if (r1.changes > 0) summary.db_updated.push(`storyboards:${sid}:first_frame`);
  const r2 = runSafe(
    db,
    'UPDATE storyboards SET last_frame_image_id = NULL, last_frame_image_url = NULL, last_frame_local_path = NULL, updated_at = ? WHERE id = ? AND last_frame_image_id = ?',
    now,
    sid,
    id
  );
  if (r2.changes > 0) summary.db_updated.push(`storyboards:${sid}:last_frame`);
  const sb = getSafe(db, 'SELECT id, image_url, local_path FROM storyboards WHERE id = ? AND deleted_at IS NULL', sid);
  if (sb && matchesGeneratedMedia(sb, row)) {
    const r3 = runSafe(db, 'UPDATE storyboards SET image_url = NULL, local_path = NULL, updated_at = ? WHERE id = ?', now, sid);
    if (r3.changes > 0) summary.db_updated.push(`storyboards:${sid}:image`);
  }
}

function deleteImageGenerationArtifacts(db, log, row, summary = defaultSummary(), options = {}) {
  if (!row?.id) return summary;
  const rels = relPathsFromRow(row, ['image_url', 'local_path']);
  clearStoryboardImageBindings(db, summary, row);
  clearEntityMediaIfMatches(db, summary, 'characters', row.character_id, row, 'image');
  clearEntityMediaIfMatches(db, summary, 'scenes', row.scene_id, row, 'image');
  const now = new Date().toISOString();
  const result = runSafe(db, 'UPDATE image_generations SET deleted_at = ?, status = ? WHERE id = ? AND deleted_at IS NULL', now, 'deleted', Number(row.id));
  if (result.changes > 0) summary.db_deleted.push(`image_generations:${row.id}`);
  deleteFilesIfUnreferenced(db, log, rels, { image_generations: [row.id] }, summary, options);
  return summary;
}

function deleteVideoGenerationArtifacts(db, log, row, summary = defaultSummary(), options = {}) {
  if (!row?.id) return summary;
  const rels = relPathsFromRow(row, ['video_url', 'local_path']);
  if (row.storyboard_id) {
    const sb = getSafe(db, 'SELECT id, video_url, local_path FROM storyboards WHERE id = ? AND deleted_at IS NULL', Number(row.storyboard_id));
    if (sb && matchesGeneratedMedia(sb, row)) {
      const now = new Date().toISOString();
      const r = runSafe(db, 'UPDATE storyboards SET video_url = NULL, local_path = NULL, updated_at = ? WHERE id = ?', now, Number(row.storyboard_id));
      if (r.changes > 0) summary.db_updated.push(`storyboards:${row.storyboard_id}:video`);
    }
  }
  const now = new Date().toISOString();
  const result = runSafe(db, 'UPDATE video_generations SET deleted_at = ?, status = ? WHERE id = ? AND deleted_at IS NULL', now, 'deleted', Number(row.id));
  if (result.changes > 0) summary.db_deleted.push(`video_generations:${row.id}`);
  deleteFilesIfUnreferenced(db, log, rels, { video_generations: [row.id] }, summary, options);
  return summary;
}

function deleteVideoMergeArtifacts(db, log, row, summary = defaultSummary(), options = {}) {
  if (!row?.id) return summary;
  const rels = relPathsFromRow(row, ['merged_url']);
  if (row.episode_id) {
    const ep = getSafe(db, 'SELECT id, video_url FROM episodes WHERE id = ? AND deleted_at IS NULL', Number(row.episode_id));
    if (ep && matchesGeneratedMedia({ ...ep, local_path: ep.video_url }, { ...row, local_path: row.merged_url })) {
      const now = new Date().toISOString();
      const r = runSafe(db, 'UPDATE episodes SET video_url = NULL, updated_at = ? WHERE id = ?', now, Number(row.episode_id));
      if (r.changes > 0) summary.db_updated.push(`episodes:${row.episode_id}:video`);
    }
  }
  const now = new Date().toISOString();
  const result = runSafe(db, 'UPDATE video_merges SET deleted_at = ?, status = ? WHERE id = ? AND deleted_at IS NULL', now, 'deleted', Number(row.id));
  if (result.changes > 0) summary.db_deleted.push(`video_merges:${row.id}`);
  deleteFilesIfUnreferenced(db, log, rels, { video_merges: [row.id] }, summary, options);
  return summary;
}

function parseTaskResult(task) {
  if (!task?.result) return {};
  if (typeof task.result === 'object') return task.result || {};
  try {
    return JSON.parse(task.result);
  } catch (_) {
    return {};
  }
}

function activeLibrarySourceExists(db, table, sourceType, sourceId) {
  const row = getSafe(
    db,
    `SELECT id FROM ${table} WHERE source_type = ? AND source_id = ? AND deleted_at IS NULL LIMIT 1`,
    sourceType,
    String(sourceId)
  );
  return !!row;
}

function softDeleteEntityIfNotInLibrary(db, log, summary, table, id, libraryTable, sourceType, options = {}) {
  if (id == null) return;
  if (activeLibrarySourceExists(db, libraryTable, sourceType, id)) {
    summary.files_kept.push({ reason: 'entity_in_library', table, id });
    return;
  }
  const row = getSafe(db, `SELECT * FROM ${table} WHERE id = ? AND deleted_at IS NULL`, Number(id));
  if (!row) return;
  const rels = relPathsFromRow(row, ['image_url', 'local_path', 'four_view_image_url', 'extra_images', 'ref_image']);
  const now = new Date().toISOString();
  const result = runSafe(db, `UPDATE ${table} SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`, now, Number(id));
  if (result.changes > 0) summary.db_deleted.push(`${table}:${id}`);
  if (table === 'characters') runSafe(db, 'DELETE FROM episode_characters WHERE character_id = ?', Number(id));
  if (table === 'props') runSafe(db, 'DELETE FROM storyboard_props WHERE prop_id = ?', Number(id));
  deleteFilesIfUnreferenced(db, log, rels, { [table]: [id] }, summary, options);
}

function cleanupTaskResultEntities(db, log, task, summary, options = {}) {
  const result = parseTaskResult(task);
  if (Array.isArray(result.characters)) {
    for (const item of result.characters) {
      softDeleteEntityIfNotInLibrary(db, log, summary, 'characters', item?.id, 'character_libraries', 'character', options);
    }
  }
  if (Array.isArray(result.scenes)) {
    for (const item of result.scenes) {
      softDeleteEntityIfNotInLibrary(db, log, summary, 'scenes', item?.id, 'scene_libraries', 'scene', options);
    }
  }
  if (Array.isArray(result.props)) {
    for (const item of result.props) {
      softDeleteEntityIfNotInLibrary(db, log, summary, 'props', item?.id, 'prop_libraries', 'prop', options);
    }
  }
  if (result.prop_id && (result.local_path || result.image_url)) {
    clearEntityMediaIfMatches(db, summary, 'props', result.prop_id, result, 'image');
    deleteFilesIfUnreferenced(db, log, relPathsFromRow(result, ['image_url', 'local_path']), {}, summary, options);
  }
}

function deleteImageGenerationById(db, log, id, options = {}) {
  const row = getSafe(db, 'SELECT * FROM image_generations WHERE id = ? AND deleted_at IS NULL', Number(id));
  if (!row) return null;
  const summary = deleteImageGenerationArtifacts(db, log, row, defaultSummary(), options);
  return summary;
}

function deleteVideoGenerationById(db, log, id, options = {}) {
  const row = getSafe(db, 'SELECT * FROM video_generations WHERE id = ? AND deleted_at IS NULL', Number(id));
  if (!row) return null;
  const summary = deleteVideoGenerationArtifacts(db, log, row, defaultSummary(), options);
  return summary;
}

function deleteVideoMergeById(db, log, id, options = {}) {
  const row = getSafe(db, 'SELECT * FROM video_merges WHERE id = ? AND deleted_at IS NULL', Number(id));
  if (!row) return null;
  const summary = deleteVideoMergeArtifacts(db, log, row, defaultSummary(), options);
  return summary;
}

function deleteTaskAndArtifacts(db, log, taskId, options = {}) {
  const task = getSafe(db, 'SELECT * FROM async_tasks WHERE id = ? AND deleted_at IS NULL', String(taskId));
  if (!task) return null;
  const summary = defaultSummary();
  const imageRows = allSafe(db, 'SELECT * FROM image_generations WHERE task_id = ? AND deleted_at IS NULL', String(taskId));
  for (const row of imageRows) deleteImageGenerationArtifacts(db, log, row, summary, options);

  const videoRows = allSafe(db, 'SELECT * FROM video_generations WHERE task_id = ? AND deleted_at IS NULL', String(taskId));
  for (const row of videoRows) deleteVideoGenerationArtifacts(db, log, row, summary, options);

  const mergeRows = allSafe(db, 'SELECT * FROM video_merges WHERE task_id = ? AND deleted_at IS NULL', String(taskId));
  for (const row of mergeRows) deleteVideoMergeArtifacts(db, log, row, summary, options);

  cleanupTaskResultEntities(db, log, task, summary, options);

  const now = new Date().toISOString();
  const status = task.status === 'completed' || task.status === 'failed' ? task.status : 'cancelled';
  const r = runSafe(
    db,
    'UPDATE async_tasks SET status = ?, deleted_at = ?, updated_at = ?, completed_at = COALESCE(completed_at, ?) WHERE id = ? AND deleted_at IS NULL',
    status,
    now,
    now,
    now,
    String(taskId)
  );
  if (r.changes > 0) summary.db_deleted.push(`async_tasks:${taskId}`);
  try { log?.info?.('[cleanup] task deleted with artifacts', { task_id: taskId, summary }); } catch (_) {}
  return { task_id: taskId, ...summary };
}

module.exports = {
  normalizeRelPath,
  collectRelPathsFromValue,
  findActiveReferences,
  safeDeleteFile,
  deleteFilesIfUnreferenced,
  deleteImageGenerationById,
  deleteVideoGenerationById,
  deleteVideoMergeById,
  deleteTaskAndArtifacts,
};
