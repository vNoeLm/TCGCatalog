import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://playriftbound.com/en-us/card-gallery/');
  await page.waitForTimeout(5000);
  
  const data = await page.evaluate(() => {
    return {
      nextData: (window as any).__NEXT_DATA__,
      state: (window as any).__INITIAL_STATE__,
      gatsby: (window as any).___chunkMapping
    };
  });
  
  console.log(JSON.stringify(data, null, 2).substring(0, 500));
  
  await browser.close();
})();
