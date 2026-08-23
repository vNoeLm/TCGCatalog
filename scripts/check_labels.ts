import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://playriftbound.com/en-us/card-gallery/');
  await page.waitForTimeout(5000);
  
  await page.click('[data-testid="card-sets-trigger"]');
  await page.waitForTimeout(1000);
  
  const labels = await page.$$eval('label', (els) => els.map(e => ({ text: e.textContent, id: e.getAttribute('for') })));
  console.log("Labels:", labels);
  
  await browser.close();
})();
