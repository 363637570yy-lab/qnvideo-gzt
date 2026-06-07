function creatorFieldsFromUser(user) {
  if (!user?.id) {
    return {
      created_by_user_id: null,
      created_by_username: null,
      created_by_display_name: null,
    };
  }
  return {
    created_by_user_id: String(user.id),
    created_by_username: user.username || null,
    created_by_display_name: user.display_name || user.username || null,
  };
}

function creatorLabel(row) {
  return row?.created_by_display_name || row?.created_by_username || '';
}

function canManageLibraryItem(row, user) {
  if (!row) return false;
  if (user?.role === 'admin') return true;
  return !!row.created_by_user_id && !!user?.id && String(row.created_by_user_id) === String(user.id);
}

function withLibraryPermissions(item, user) {
  if (!item) return item;
  return {
    ...item,
    created_by: creatorLabel(item),
    can_manage: canManageLibraryItem(item, user),
  };
}

function applyCreatorFilter(query, sql, params) {
  const owner = String(query.owner || query.creator || '').toLowerCase();
  const explicitUserId = query.created_by_user_id || query.user_id;
  if (owner === 'mine') {
    if (!query.user?.id) {
      sql += ' AND 1 = 0';
      return sql;
    }
    sql += ' AND created_by_user_id = ?';
    params.push(String(query.user.id));
    return sql;
  }
  if (owner === 'system') {
    sql += " AND (created_by_user_id IS NULL OR created_by_user_id = '')";
    return sql;
  }
  if (explicitUserId && query.user?.role === 'admin') {
    sql += ' AND created_by_user_id = ?';
    params.push(String(explicitUserId));
  }
  return sql;
}

module.exports = {
  applyCreatorFilter,
  canManageLibraryItem,
  creatorFieldsFromUser,
  withLibraryPermissions,
};
