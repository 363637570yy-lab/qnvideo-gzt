const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const configPaths = [
  path.join(process.cwd(), 'configs', 'config.yaml'),
  path.join(process.cwd(), 'config.yaml'),
  path.join(__dirname, '..', '..', 'configs', 'config.yaml'),
];

function loadConfig() {
  let raw = null;
  for (const p of configPaths) {
    if (fs.existsSync(p)) {
      raw = fs.readFileSync(p, 'utf8');
      break;
    }
  }
  if (!raw) {
    throw new Error('Config file not found: configs/config.yaml');
  }
  const parsed = yaml.load(raw);
  if (!parsed?.app?.name) {
    throw new Error('Invalid config: missing app section');
  }
  parsed.server = parsed.server || {};
  parsed.database = parsed.database || {};
  parsed.storage = parsed.storage || {};
  if (process.env.PORT) parsed.server.port = Number(process.env.PORT);
  if (process.env.SERVER_HOST) parsed.server.host = process.env.SERVER_HOST;
  if (process.env.SQLITE_DB_PATH) parsed.database.path = process.env.SQLITE_DB_PATH;
  if (process.env.STORAGE_LOCAL_PATH) parsed.storage.local_path = process.env.STORAGE_LOCAL_PATH;
  if (process.env.STORAGE_BASE_URL) parsed.storage.base_url = process.env.STORAGE_BASE_URL;
  return parsed;
}

module.exports = { loadConfig };
