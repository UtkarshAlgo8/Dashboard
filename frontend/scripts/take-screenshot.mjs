import http from 'node:http';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';

const PORT = 9222;
const TARGET_URL = 'http://localhost:5173/banmore/production';
const OUTPUT_FILE = '/home/yugal/.gemini/antigravity/brain/7a86f00b-adc8-4534-89c5-f049bb880d58/live_ui_screenshot.png';

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--hide-scrollbars',
    '--window-size=1440,900',
    '--no-sandbox',
    '--disable-gpu',
    'about:blank'
  ]);

  await sleep(1000);

  try {
    const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
    const page = list.find(t => t.type === 'page');
    if (!page || !page.webSocketDebuggerUrl) {
      throw new Error('No page WebSocket URL found');
    }

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let msgId = 1;
    const pending = new Map();

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && pending.has(data.id)) {
        pending.get(data.id)(data.result);
        pending.delete(data.id);
      }
    };

    await new Promise(r => ws.onopen = r);

    const send = (method, params = {}) => {
      const id = msgId++;
      return new Promise((resolve) => {
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    };

    await send('Page.enable');
    await send('Page.navigate', { url: TARGET_URL });
    await sleep(2500);

    const result = await send('Page.captureScreenshot', { format: 'png' });
    if (result && result.data) {
      await fs.writeFile(OUTPUT_FILE, Buffer.from(result.data, 'base64'));
      console.log('Screenshot successfully captured!');
    } else {
      console.error('Failed to capture screenshot data');
    }

    ws.close();
  } finally {
    chrome.kill();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
