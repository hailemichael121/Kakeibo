import { chromium } from 'playwright';

const screens = ['Home', 'Insights', 'History', 'Ritual', 'Settings'];

const seed = async (page) => {
  await page.evaluate(() => {
    localStorage.setItem('kakeibo.onboarded', 'true');
    localStorage.setItem('kakeibo.demo', 'true');
  });
};

(async () => {
  const browser = await chromium.launch();
  for (const viewport of [{ width: 1280, height: 800, name: 'desktop' }, { width: 390, height: 844, name: 'mobile' }]) {
    const page = await browser.newPage({ viewport });
    await page.goto('http://localhost:5173');
    await seed(page);
    await page.reload();
    await page.waitForTimeout(1500);
    for (const s of screens) {
      await page.getByRole('button', { name: new RegExp(s, 'i') }).click().catch(() => {});
      await page.waitForTimeout(800);
      await page.screenshot({ path: `docs/${viewport.name}-${s.toLowerCase()}.png`, fullPage: true });
    }
  }
  await browser.close();
})();
