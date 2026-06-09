const https = require('https');
const http = require('http');

function buildOpenAiTtsUrl(baseUrl) {
  return (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '') + '/audio/speech';
}

async function synthesizeWithOpenai(text, voice, apiKey, baseUrl, model, speed, timeoutMs = 180000) {
  const url = buildOpenAiTtsUrl(baseUrl);
  const body = JSON.stringify({
    model: model || 'tts-1',
    input: text,
    voice: voice || 'alloy',
    response_format: 'mp3',
    speed: speed || 1.0,
  });
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
    };
    const req = mod.request(reqOpts, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`OpenAI TTS HTTP ${res.statusCode}: ${buf.toString('utf-8').slice(0, 500)}`));
          return;
        }
        resolve(buf);
      });
    });
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error(`OpenAI TTS 请求超时（${timeoutMs}ms）`));
    }, timeoutMs);
    req.on('error', (e) => { clearTimeout(timer); reject(e); });
    req.on('close', () => clearTimeout(timer));
    req.write(body);
    req.end();
  });
}

module.exports = {
  buildOpenAiTtsUrl,
  synthesizeWithOpenai,
};
