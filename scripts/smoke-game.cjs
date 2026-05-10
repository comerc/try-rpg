const { spawn } = require('node:child_process');

const PORT = Number(process.env.RTS_SMOKE_PORT ?? 5197);
const URL = `http://127.0.0.1:${PORT}/?quality=medium`;

async function main() {
  const { chromium } = require('playwright');
  const server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(PORT)], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, BROWSER: 'none' },
  });

  let serverText = '';
  server.stdout.on('data', (d) => { serverText += d.toString(); });
  server.stderr.on('data', (d) => { serverText += d.toString(); });

  try {
    await waitForServer(URL, 15000);
    await runDesktopSmoke(chromium);
    await runMobileSmoke(chromium);
    console.log('Smoke passed');
  } catch (err) {
    console.error(serverText.slice(-2000));
    throw err;
  } finally {
    server.kill('SIGTERM');
  }
}

async function runDesktopSmoke(chromium) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const issues = collectIssues(page);
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.mouse.click(190, 780);
  await page.waitForTimeout(1800);
  const result = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const box = canvas?.getBoundingClientRect();
    const logs = typeof window.__rtsLogs === 'function' ? window.__rtsLogs() : [];
    return {
      hasCanvas: !!canvas,
      width: box?.width ?? 0,
      height: box?.height ?? 0,
      appErrors: logs.filter((entry) => entry.level === 'error').length,
    };
  });
  await browser.close();
  assert(result.hasCanvas, 'desktop canvas missing');
  assert(result.width > 1000 && result.height > 600, `desktop canvas too small: ${JSON.stringify(result)}`);
  assert(result.appErrors === 0, `desktop app errors: ${result.appErrors}`);
  assert(issues.errors.length === 0, `desktop page errors: ${issues.errors.join('\n')}`);
}

async function runMobileSmoke(chromium) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const issues = collectIssues(page);
  await page.goto(URL, { waitUntil: 'networkidle' });
  const result = await page.evaluate(() => {
    const notice = document.querySelector('.orientation-notice');
    return {
      display: notice ? getComputedStyle(notice).display : '',
      text: notice?.textContent ?? '',
    };
  });
  await browser.close();
  assert(result.display !== 'none', 'mobile portrait notice is hidden');
  assert(result.text.includes('Поверни экран'), `mobile notice text missing: ${result.text}`);
  assert(issues.errors.length === 0, `mobile page errors: ${issues.errors.join('\n')}`);
}

function collectIssues(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return { errors };
}

async function waitForServer(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Server did not start at ${url}`);
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
