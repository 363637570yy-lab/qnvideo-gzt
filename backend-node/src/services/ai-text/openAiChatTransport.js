const https = require('https');
const http = require('http');

function extractChatMessageContent(json) {
  return json?.choices?.[0]?.message?.content
    || json?.choices?.[0]?.message?.reasoning_content
    || null;
}

function extractChatUsage(json) {
  const usage = json?.usage;
  if (!usage || typeof usage !== 'object') return null;
  return {
    input_tokens: usage.prompt_tokens ?? usage.input_tokens ?? null,
    output_tokens: usage.completion_tokens ?? usage.output_tokens ?? null,
    total_tokens: usage.total_tokens ?? null,
    raw: usage,
  };
}

function extractStreamDelta(event) {
  return event?.choices?.[0]?.delta?.content || '';
}

/**
 * 非流式 POST，发送 JSON body，等待完整 HTTP 响应后返回。
 * 用于视觉分析等短请求，兼容 o-series 推理模型和各种第三方代理。
 */
function postJSONNonStream(url, headers, body, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const bodyStr = JSON.stringify(body);
    const reqHeaders = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr),
      ...headers,
    };
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: reqHeaders,
    };

    const req = mod.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 500)}`));
        }
        try {
          const json = JSON.parse(raw);
          resolve({ status: res.statusCode, body: extractChatMessageContent(json), raw, usage: extractChatUsage(json) });
        } catch (_) {
          resolve({ status: res.statusCode, body: null, raw });
        }
      });
      res.on('error', reject);
    });

    const timer = setTimeout(() => { req.destroy(); reject(new Error(`Vision request timeout after ${timeoutMs}ms`)); }, timeoutMs);
    req.on('error', (e) => { clearTimeout(timer); reject(e); });
    req.on('close', () => clearTimeout(timer));
    req.write(bodyStr);
    req.end();
  });
}

/**
 * 用 SSE 流式输出（stream: true）请求 OpenAI 兼容接口。
 * silenceTimeoutMs：连续多少毫秒无任何数据才判定超时。
 */
function postJSONStream(url, headers, body, silenceTimeoutMs = 60000, onProgress = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const streamBody = { ...body, stream: true };
    const bodyStr = JSON.stringify(streamBody);
    const reqHeaders = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr),
      ...headers,
    };
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: reqHeaders,
    };

    let silenceTimer = null;
    const resetSilenceTimer = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        req.destroy();
        reject(new Error(`AI stream silence timeout after ${silenceTimeoutMs}ms`));
      }, silenceTimeoutMs);
    };

    const req = mod.request(options, (res) => {
      const statusCode = res.statusCode;
      if (statusCode < 200 || statusCode >= 300) {
        const errChunks = [];
        res.on('data', (c) => errChunks.push(c));
        res.on('end', () => {
          clearTimeout(silenceTimer);
          reject(new Error(`HTTP ${statusCode}: ${Buffer.concat(errChunks).toString('utf-8').slice(0, 500)}`));
        });
        return;
      }

      let accumulated = '';
      let sseBuffer = '';
      let firstToken = true;
      resetSilenceTimer();

      res.on('data', (chunk) => {
        resetSilenceTimer();
        sseBuffer += chunk.toString('utf-8');
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop();
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') continue;
          try {
            const evt = JSON.parse(data);
            const delta = extractStreamDelta(evt);
            if (delta) {
              if (firstToken) {
                firstToken = false;
                if (onProgress) onProgress(0, 'first_token', '');
              }
              accumulated += delta;
              if (onProgress) onProgress(accumulated.length, null, accumulated);
            }
          } catch (_) {}
        }
      });

      res.on('end', () => {
        clearTimeout(silenceTimer);
        resolve({ status: statusCode, body: accumulated });
      });
      res.on('error', (e) => { clearTimeout(silenceTimer); reject(e); });
    });

    req.on('error', (e) => { clearTimeout(silenceTimer); reject(e); });
    resetSilenceTimer();
    req.write(bodyStr);
    req.end();
  });
}

module.exports = {
  postJSONNonStream,
  postJSONStream,
  _test: {
    extractChatMessageContent,
    extractChatUsage,
    extractStreamDelta,
  },
};
