// Headless smoke test: load the built app, click to start audio, watch for errors.
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ root: process.cwd(), server: { port: 5199 } });
await server.listen();

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader'],
});
const page = await browser.newPage();

const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`);
});
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
page.on('response', (res) => {
  if (res.status() >= 400) errors.push(`[http ${res.status()}] ${res.url()}`);
});
page.on('requestfailed', (req) => errors.push(`[reqfail] ${req.url()} ${req.failure()?.errorText}`));

await page.goto('http://localhost:5199', { waitUntil: 'load' });
await page.waitForTimeout(2500); // visuals boot
await page.click('#overlay');    // wake audio + engine
await page.waitForTimeout(25000); // let samples load, patterns schedule, a rebuild pass

// probe internal state + count 5 seconds of bus events
const state = await page.evaluate(async () => {
  const counts = {};
  const un = window.jungle.bus.subscribe((e) => {
    const k = e.type === 'hap' ? `hap:${e.sound}` : e.type;
    counts[k] = (counts[k] ?? 0) + 1;
  });
  await new Promise((r) => setTimeout(r, 5000));
  un();
  return {
    overlayHidden: document.getElementById('overlay').style.display === 'none',
    readout: document.getElementById('readout')?.textContent ?? '',
    counts,
  };
});

console.log('--- SMOKE RESULT ---');
console.log('overlayHidden:', state.overlayHidden);
console.log('readout:', JSON.stringify(state.readout));
console.log('bus events in 5s:', JSON.stringify(state.counts));
console.log('errors:', errors.length ? '\n' + errors.join('\n') : 'none');

await browser.close();
await server.close();
process.exit(errors.filter((e) => !e.includes('favicon')).length > 0 ? 1 : 0);
