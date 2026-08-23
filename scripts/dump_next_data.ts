import { chromium } from 'playwright';
import fs from 'fs';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://playriftbound.com/en-us/card-gallery/');
  await page.waitForTimeout(5000);
  
  const data = await page.evaluate(() => {
    return (window as any).__NEXT_DATA__;
  });
  
  fs.writeFileSync('next_data.json', JSON.stringify(data, null, 2));
  console.log("Saved __NEXT_DATA__ to next_data.json");
  
  await browser.close();
})();
