// One door to the local AI CLI. Works with either:
//   - Claude Code (`claude`) on a Claude Pro/Max subscription
//   - OpenAI Codex CLI (`codex`) on a ChatGPT Plus/Pro subscription
// Auto-detects whichever is installed; AI_BACKEND=claude|codex in .env overrides.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let cached;
export function detectBackend() {
  if (cached !== undefined) return cached;
  const forced = (process.env.AI_BACKEND || '').toLowerCase();
  const has = cmd => spawnSync('which', [cmd], { stdio: 'ignore' }).status === 0;
  if (forced === 'claude' || forced === 'codex') cached = has(forced) ? forced : null;
  else cached = has('claude') ? 'claude' : has('codex') ? 'codex' : null;
  return cached;
}

// Runs one prompt through the detected CLI, resolves the model's final text.
// images: file paths the model must be able to see (thumbnail vetting).
// webSearch: let the model search the web (deep-dive reports).
export function runAI(prompt, { images = [], webSearch = false, timeoutMs = 180000, cwd } = {}) {
  const backend = detectBackend();
  if (!backend) return Promise.reject(new Error('No AI CLI found. Install Claude Code (claude) or OpenAI Codex (codex) and log in.'));

  let cmd, args, lastMsgFile = null;
  if (backend === 'claude') {
    cmd = 'claude';
    args = ['-p', prompt, '--output-format', 'text'];
    if (images.length) args.push('--allowedTools', 'Read'); // reads image paths named in the prompt
  } else {
    cmd = 'codex';
    lastMsgFile = path.join(os.tmpdir(), `lode-codex-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
    args = ['exec', '--skip-git-repo-check', '-s', 'read-only', '--output-last-message', lastMsgFile];
    if (webSearch) args.push('-c', 'tools.web_search=true');
    for (const img of images.slice(0, 24)) args.push(`--image=${cwd ? path.resolve(cwd, img) : img}`);
    args.push(prompt);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd, env: { ...process.env } });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`${cmd} timed out`)); }, timeoutMs);
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => {
      clearTimeout(timer);
      let text = out;
      if (lastMsgFile) {
        try { text = fs.readFileSync(lastMsgFile, 'utf8'); } catch { /* fall back to stdout */ }
        try { fs.unlinkSync(lastMsgFile); } catch {}
      }
      if (!text.trim()) return reject(new Error(err.slice(0, 400) || `${cmd} exited ${code} with no output`));
      resolve(text.trim());
    });
  });
}
