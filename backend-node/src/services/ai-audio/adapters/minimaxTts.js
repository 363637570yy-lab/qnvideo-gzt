const https = require('https');
const http = require('http');

function buildMinimaxTtsUrl(baseUrl, groupId) {
  const base = (baseUrl || 'https://api.minimax.chat').replace(/\/+$/, '');
  const root = base.replace(/\/v1$/i, '');
  return `${root}/v1/t2a_v2?GroupId=${encodeURIComponent(groupId || '')}`;
}

async function synthesizeWithMinimax(text, voiceId, apiKey, groupId, model, timeoutMs = 180000, baseUrl = '') {
  const body = JSON.stringify({
    model: model || 'speech-02-hd',
    text,
    stream: false,
    voice_setting: {
      voice_id: voiceId || 'female-shaonv',
      speed: 1.0,
      vol: 1.0,
      pitch: 0,
    },
    audio_setting: {
      sample_rate: 32000,
      bitrate: 128000,
      format: 'mp3',
      channel: 1,
    },
  });
  const url = buildMinimaxTtsUrl(baseUrl, groupId);
  return new Promise((resolve, reject) => {
    const reqOpts = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    const req = client.request(urlObj, reqOpts, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`MiniMax TTS HTTP ${res.statusCode}: ${Buffer.concat(chunks).toString()}`));
          return;
        }
        const data = JSON.parse(Buffer.concat(chunks).toString());
        if (data.base_resp?.status_code !== 0) {
          reject(new Error(`MiniMax TTS error: ${data.base_resp?.status_msg || 'unknown'}`));
          return;
        }
        const audioHex = data.data?.audio;
        if (!audioHex) {
          reject(new Error('MiniMax TTS 未返回音频'));
          return;
        }
        resolve(Buffer.from(audioHex, 'hex'));
      });
    });
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error(`MiniMax TTS 请求超时（${timeoutMs}ms）`));
    }, timeoutMs);
    req.on('error', (e) => { clearTimeout(timer); reject(e); });
    req.on('close', () => clearTimeout(timer));
    req.write(body);
    req.end();
  });
}

module.exports = {
  buildMinimaxTtsUrl,
  synthesizeWithMinimax,
};
