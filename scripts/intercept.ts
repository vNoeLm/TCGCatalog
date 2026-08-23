import { chromium } from 'playwright';
import fs from 'fs';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('.json') || url.includes('api') || url.includes('graphql') || url.includes('cms')) {
      try {
        const text = await response.text();
        if (text.includes('Baccai Sandspinner') || text.includes('Vendetta')) {
          console.log('Found card data in URL:', url);
          fs.writeFileSync('riftbound_api_response.json', text);
        }
      } catch(e) {}
    }
  });

  console.log("Navigating to Riftbound gallery...");
  await page.goto('https://playriftbound.com/en-us/card-gallery/');
  await page.waitForTimeout(5000);
  
  await browser.close();
})();
