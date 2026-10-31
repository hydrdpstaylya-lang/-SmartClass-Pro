import {createInterface} from 'node:readline';
import {Writable} from 'node:stream';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';

// Inputs stay in memory for this test. Nothing is written to disk.
export function readHidden(prompt, {input = process.stdin, output = process.stdout} = {}) {
  if (!input.isTTY) return Promise.reject(new Error('Open CHECK-CLOUDFLARE.cmd in a normal terminal window.'));
  return new Promise((resolve, reject) => {
    let muted = false, finished = false;
    const sink = new Writable({write(chunk, _encoding, done) { if (!muted) output.write(chunk); done(); }});
    const rl = createInterface({input, output: sink, terminal: true, historySize: 0});
    const stop = () => {
      if (finished) return;
      finished = true;
      rl.close();
      output.write('\n');
      reject(new Error('Input cancelled.'));
    };
    rl.on('SIGINT', stop);
    rl.on('close', () => {
      if (!finished) { finished = true; reject(new Error('No input received.')); }
    });
    rl.question(prompt, value => {
      if (finished) return;
      finished = true;
      rl.close();
      output.write('\n');
      resolve(value.trim());
    });
    muted = true;
  });
}

function safeText(value, secrets = [], limit = 500) {
  let text = String(value ?? '');
  for (const secret of secrets) {
    if (secret) text = text.split(secret).join('[REDACTED]');
  }
  return text.replace(/Bearer\s+[^\s"'<>]+/gi, 'Bearer [REDACTED]')
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, limit);
}

function finalAnswer(result) {
  const value = result?.choices?.[0]?.message?.content ?? result?.response;
  if (typeof value !== 'string') return '';
  // Ignore a separate reasoning_content field and remove tagged reasoning.
  return value.replace(/<think\b[^>]*>[\s\S]*?<\/think\s*>/gi, '')
    .replace(/<think\b[^>]*>[\s\S]*$/gi, '')
    .replace(/^[\s\S]*?<\/think\s*>/gi, '').trim();
}

async function readBody(response, maxBytes = 65536) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error('Response too large.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}

export async function checkConnection({accountId, apiToken, request = globalThis.fetch, timeoutMs = 45000}) {
  if (typeof accountId !== 'string' || !/^[a-fA-F0-9]{32}$/.test(accountId))
    return {ok: false, kind: 'INVALID_ACCOUNT_ID', detail: 'Account ID must be 32 hexadecimal characters; use Account ID, not Zone ID.'};
  if (typeof apiToken !== 'string' || !/^[!-~]{20,4096}$/.test(apiToken))
    return {ok: false, kind: 'INVALID_TOKEN', detail: 'Paste the complete Workers AI API Token, without quotes or spaces.'};
  const secrets = [apiToken, accountId, accountId.toLowerCase(), accountId.toUpperCase()];
  let http;
  try {
    const response = await request(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      headers: {'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        messages: [
          {role: 'system', content: 'فقط پاسخ نهایی را به فارسی و بسیار کوتاه بنویس. توضیح مراحل فکر کردن را ننویس.'},
          {role: 'user', content: '۳ ضربدر ۴ چند می‌شود؟ فقط عدد پاسخ را بنویس. /no_think'}
        ],
        max_tokens: 256, temperature: 0.2, stream: false
      })
    });
    http = response.status;
    const raw = await readBody(response);
    let data;
    try { data = JSON.parse(raw); } catch { /* Never dump an HTML error page. */ }
    if (!response.ok || data?.success !== true) {
      const errors = Array.isArray(data?.errors) ? data.errors.slice(0, 3) : [];
      let detail = errors.map(e => typeof e === 'string' ? e : [e?.code, e?.message].filter(v => v != null).join(': ')).join(' | ');
      if (!detail && typeof data?.error === 'string') detail = data.error;
      return {ok: false, http, kind: 'API_ERROR', detail: safeText(detail || 'No successful Cloudflare JSON response. Check the account, Workers AI permissions and quota.', secrets)};
    }
    const answer = safeText(finalAnswer(data.result), secrets, 300);
    if (!answer) return {ok: false, http, kind: 'NO_FINAL_ANSWER', detail: 'The API replied but returned no final answer. Send this result for review.'};
    return {ok: true, http, answer};
  } catch (error) {
    const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    const detail = timeout ? 'No complete response within 45 seconds.' : [error?.message, error?.cause?.code].filter(Boolean).join(' ');
    return {ok: false, http, kind: timeout ? 'TIMEOUT' : 'CONNECTION_ERROR', detail: safeText(detail || 'Request failed.', secrets)};
  }
}

export async function main({input = process.stdin, output = process.stdout, request = globalThis.fetch} = {}) {
  output.write('Cloudflare Workers AI - Node connection test\nNo credentials will be saved. Both inputs are hidden.\n\n');
  let accountId, apiToken;
  try {
    accountId = await readHidden('1) Paste Account ID, then press Enter: ', {input, output});
    if (!/^[a-fA-F0-9]{32}$/.test(accountId)) {
      output.write('INVALID_ACCOUNT_ID: Copy the 32-character Account ID from the Workers AI REST API page.\n');
      return 1;
    }
    apiToken = await readHidden('2) Paste Workers AI API Token, then press Enter: ', {input, output});
  } catch (error) {
    output.write(`CLOUDFLARE_INPUT_ERROR: ${error.message}\n`);
    return 1;
  }
  output.write('\nTesting one request (up to 45 seconds)...\n');
  const result = await checkConnection({accountId, apiToken, request});
  output.write(`CLOUDFLARE_HTTP: ${result.http ?? 'NONE'}\nMODEL: ${MODEL}\n`);
  if (result.ok) {
    output.write(`CLOUDFLARE_OK\nANSWER: ${result.answer}\n`);
    return 0;
  }
  output.write(`CLOUDFLARE_${result.kind}\nDETAIL: ${result.detail}\n`);
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
