import { chromium } from 'playwright';
import fs from 'fs';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log("Navigating to Riftbound gallery...");
  await page.goto('https://playriftbound.com/en-us/card-gallery/');
  await page.waitForTimeout(5000);
  
  const cardElements = await page.$$('[data-testid^="game-card-"]');
  if (cardElements.length > 0) {
    console.log("Clicking first card...");
    await cardElements[0].click({ force: true });
    await page.waitForTimeout(3000); // Wait for modal to open
    
    const html = await page.content();
    fs.writeFileSync('riftbound_modal_dump.html', html);
    console.log("Saved modal dump to riftbound_modal_dump.html");
  } else {
    console.log("No cards found.");
  }

  await browser.close();
})();
