const {
  canManageLibraryItem,
  creatorFieldsFromUser,
  withLibraryPermissions,
} = require('./libraryOwnership');

function list(db, query) {
  let sql = 'FROM assets WHERE deleted_at IS NULL';
  const params = [];
  const user = query.user;
  if (query.drama_id) {
    sql += ' AND drama_id = ?';
    params.push(query.drama_id);
  }
  if (user && user.role !== 'admin') {
    sql += ` AND (
      assets.created_by_user_id = ?
      OR EXISTS (
        SELECT 1 FROM dramas d
        WHERE d.id = assets.drama_id
          AND d.deleted_at IS NULL
          AND d.owner_user_id = ?
      )
    )`;
    params.push(String(user.id));
    params.push(String(user.id));
  }
  if (query.type) {
    sql += ' AND type = ?';
    params.push(query.type);
  }
  const countRow = db.prepare('SELECT COUNT(*) as total ' + sql).get(...params);
  const total = countRow.total || 0;
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(query.page_size, 10) || 20));
  const offset = (page - 1) * pageSize;
  const rows = db.prepare('SELECT * ' + sql + ' ORDER BY created_at DESC LIMIT ? OFFSET ?').all(...params, pageSize, offset);
  return { items: rows.map((row) => rowToItem(row, user)), total, page, pageSize };
}

function rowToItem(r, user) {
  return withLibraryPermissions({
    id: r.id,
    drama_id: r.drama_id,
    name: r.name,
    type: r.type,
    category: r.category,
    url: r.url,
    local_path: r.local_path,
    duration: r.duration,
    image_gen_id: r.image_gen_id,
    video_gen_id: r.video_gen_id,
    created_by_user_id: r.created_by_user_id || null,
    created_by_username: r.created_by_username || null,
    created_by_display_name: r.created_by_display_name || null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }, user);
}

function getById(db, id, user) {
  const r = db.prepare('SELECT * FROM assets WHERE id = ? AND deleted_at IS NULL').get(Number(id));
  return r ? rowToItem(r, user) : null;
}

function create(db, log, req) {
  const now = new Date().toISOString();
  const creator = creatorFieldsFromUser(req.user);
  const info = db.prepare(
    `INSERT INTO assets (drama_id, name, type, category, url, local_path, file_size, mime_type, width, height, duration, image_gen_id, video_gen_id, created_by_user_id, created_by_username, created_by_display_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    req.drama_id ?? null,
    req.name || '未命名',
    req.type || 'image',
    req.category ?? null,
    req.url || '',
    req.local_path ?? null,
    req.file_size ?? null,
    req.mime_type ?? null,
    req.width ?? null,
    req.height ?? null,
    req.duration ?? null,
    req.image_gen_id ?? null,
    req.video_gen_id ?? null,
    creator.created_by_user_id,
    creator.created_by_username,
    creator.created_by_display_name,
    now,
    now
  );
  return getById(db, info.lastInsertRowid, req.user);
}

function update(db, log, id, req) {
  const row = db.prepare('SELECT * FROM assets WHERE id = ? AND deleted_at IS NULL').get(Number(id));
  if (!row) return null;
  if (!canManageLibraryItem(row, req.user)) return { forbidden: true };
  const updates = [];
  const params = [];
  ['name', 'description', 'type', 'category', 'url', 'local_path', 'thumbnail_url', 'file_size', 'mime_type', 'width', 'height', 'duration', 'is_favorite'].forEach((key) => {
    if (req[key] !== undefined) {
      updates.push(key + ' = ?');
      params.push(req[key]);
    }
  });
  if (updates.length === 0) return getById(db, id, req.user);
  params.push(new Date().toISOString(), id);
  db.prepare('UPDATE assets SET ' + updates.join(', ') + ', updated_at = ? WHERE id = ?').run(...params);
  return getById(db, id, req.user);
}

function deleteById(db, log, id, user) {
  const row = db.prepare('SELECT * FROM assets WHERE id = ? AND deleted_at IS NULL').get(Number(id));
  if (!row) return null;
  if (!canManageLibraryItem(row, user)) return { forbidden: true };
  const now = new Date().toISOString();
  const result = db.prepare('UPDATE assets SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL').run(now, Number(id));
  return result.changes > 0;
}

function importFromImage(db, log, imageGenId, user) {
  const img = db.prepare('SELECT * FROM image_generations WHERE id = ? AND deleted_at IS NULL').get(Number(imageGenId));
  if (!img) return null;
  return create(db, log, {
    drama_id: img.drama_id,
    name: `图片 ${imageGenId}`,
    type: 'image',
    url: img.image_url || '',
    local_path: img.local_path,
    image_gen_id: img.id,
    user,
  });
}

function importFromVideo(db, log, videoGenId, user) {
  const vid = db.prepare('SELECT * FROM video_generations WHERE id = ? AND deleted_at IS NULL').get(Number(videoGenId));
  if (!vid) return null;
  return create(db, log, {
    drama_id: vid.drama_id,
    name: `视频 ${videoGenId}`,
    type: 'video',
    url: vid.video_url || '',
    local_path: vid.local_path,
    video_gen_id: vid.id,
    user,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  deleteById,
  importFromImage,
  importFromVideo,
};
