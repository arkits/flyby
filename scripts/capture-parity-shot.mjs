import { chromium } from 'playwright';

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:4180/';
const outputPath = process.argv[3] ?? 'parity-shot-webgpu.png';

const browser = await chromium.launch({
  headless: true,
  args: [
    '--enable-unsafe-webgpu',
    '--use-angle=metal',
    '--enable-features=Vulkan',
  ],
});

try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });

  page.on('console', (msg) => {
    console.log(`console:${msg.type()}: ${msg.text()}`);
  });

  await page.goto(targetUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: outputPath });

  const debugText = await page.locator('body').innerText().catch(() => '');
  const captureState = await page.evaluate(() => window.__flybyCapture ?? null).catch(() => null);
  console.log(JSON.stringify({
    targetUrl,
    outputPath,
    debugText,
    captureState,
  }));
} finally {
  await browser.close();
}
