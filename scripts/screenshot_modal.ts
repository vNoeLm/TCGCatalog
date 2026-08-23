import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://playriftbound.com/en-us/card-gallery/');
  await page.waitForTimeout(5000);
  
  const cardElements = await page.$$('[data-testid^="game-card-"]');
  if (cardElements.length > 0) {
    await cardElements[0].click({ force: true });
    await page.waitForTimeout(3000); // Wait for modal
    await page.screenshot({ path: 'modal_screenshot.png', fullPage: true });
  }

  await browser.close();
})();
