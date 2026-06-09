function toStaticImageUrl(localPath) {
  if (!localPath || !String(localPath).trim()) return null;
  return '/static/' + String(localPath).replace(/^\/+/, '').replace(/\\/g, '/');
}

function preferLocalStaticImageUrl(imageUrl, localPath) {
  return toStaticImageUrl(localPath) || imageUrl || null;
}

function summarizeImageUrlForLog(imageUrl) {
  const s = String(imageUrl || '');
  if (!s) return { image_url_kind: null };
  if (s.startsWith('data:')) return { image_url_kind: 'data', image_url_head: 'data:image/...base64(omitted)' };
  return { image_url_kind: /^https?:\/\//i.test(s) ? 'http' : 'path', image_url_head: s.slice(0, 160) };
}

module.exports = {
  toStaticImageUrl,
  preferLocalStaticImageUrl,
  summarizeImageUrlForLog,
};
