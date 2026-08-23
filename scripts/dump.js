const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  console.log("Navigating to Riftbound gallery...");
  await page.goto('https://playriftbound.com/en-us/card-gallery/');
  
  // Wait for the page to load
  await page.waitForTimeout(5000);
  
  // Dump the HTML
  const html = await page.content();
  fs.writeFileSync('riftbound_dump.html', html);
  console.log("Dumped HTML to riftbound_dump.html");
  
  await browser.close();
})();
