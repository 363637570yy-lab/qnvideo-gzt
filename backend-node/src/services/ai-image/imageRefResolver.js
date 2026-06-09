const fs = require('fs');
const path = require('path');

function stripStaticPrefixForStoragePath(value) {
  let s = String(value || '').trim().replace(/\\/g, '/');
  if (!s || s.startsWith('data:')) return '';
  s = s.split('?')[0].split('#')[0];
  const staticMatch = s.match(/(?:^|\/)static\/(.+)$/i);
  if (staticMatch) return staticMatch[1].replace(/^\/+/, '');
  return s.replace(/^\/+/, '');
}

function resolveStorageRelativePathFromImageRef(value, filesBaseUrl) {
  const s = String(value || '').trim();
  if (!s || s.startsWith('data:')) return '';
  if (/^https?:\/\//i.test(s)) {
    const baseUrl = (filesBaseUrl || '').replace(/\/$/, '');
    try {
      const u = new URL(s);
      const decodedPath = decodeURIComponent(u.pathname || '');
      if (baseUrl && s.startsWith(baseUrl)) {
        return stripStaticPrefixForStoragePath(s.slice(baseUrl.length));
      }
      if (/localhost|127\.0\.0\.1/i.test(s) || /(?:^|\/)static\//i.test(decodedPath)) {
        return stripStaticPrefixForStoragePath(decodedPath);
      }
      return '';
    } catch (_) {
      return stripStaticPrefixForStoragePath(s.replace(/^https?:\/\/[^/]+\//i, ''));
    }
  }
  return stripStaticPrefixForStoragePath(s);
}

function readLocalImageRefAsDataUrl(storageLocalPath, relPath) {
  if (!storageLocalPath || !relPath) return null;
  const storageRoot = path.resolve(storageLocalPath);
  const filePath = path.resolve(storageRoot, relPath);
  if (filePath !== storageRoot && !filePath.startsWith(storageRoot + path.sep)) return null;
  try {
    if (!fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.bmp': 'image/bmp' }[ext] || 'image/png';
    return 'data:' + mime + ';base64,' + buf.toString('base64');
  } catch (_) {
    return null;
  }
}

function joinPublicImageUrl(filesBaseUrl, value) {
  const s = String(value || '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  const baseUrl = (filesBaseUrl || '').replace(/\/$/, '');
  if (!baseUrl) return s;
  const rel = stripStaticPrefixForStoragePath(s);
  const baseHasStatic = /\/static$/i.test(baseUrl);
  const prefix = baseHasStatic ? baseUrl : `${baseUrl}/static`;
  return `${prefix}/${rel}`.replace(/([^:]\/)\/+/g, '$1');
}

function resolveImageRef(value, filesBaseUrl, storageLocalPath) {
  if (!value || !String(value).trim()) return null;
  const s = String(value).trim();
  if (s.startsWith('data:')) return s;
  const relPath = resolveStorageRelativePathFromImageRef(s, filesBaseUrl);
  const localDataUrl = readLocalImageRefAsDataUrl(storageLocalPath, relPath);
  if (localDataUrl) return localDataUrl;
  return joinPublicImageUrl(filesBaseUrl, s);
}

function dataUrlToBlobParts(dataUrl) {
  const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.*)$/s);
  if (!m) return null;
  return {
    mime: m[1] || 'image/png',
    buffer: Buffer.from(String(m[2] || '').replace(/\s/g, ''), 'base64'),
  };
}

module.exports = {
  resolveImageRef,
  dataUrlToBlobParts,
  _test: {
    stripStaticPrefixForStoragePath,
    resolveStorageRelativePathFromImageRef,
    readLocalImageRefAsDataUrl,
    joinPublicImageUrl,
  },
};
