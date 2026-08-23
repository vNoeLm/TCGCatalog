import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import http from 'https';

async function downloadImage(url: string, filepath: string) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      if (res.statusCode === 200) {
        res.pipe(fs.createWriteStream(filepath))
           .on('error', reject)
           .once('close', () => resolve(filepath));
      } else {
        res.resume();
        reject(new Error(`Request Failed With a Status Code: ${res.statusCode}`));
      }
    });
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log("Navigating to Riftbound gallery...");
  await page.goto('https://playriftbound.com/en-us/card-gallery/');
  await page.waitForTimeout(5000);
  
  // Close the Osano cookie banner if it exists
  try {
      const cookieButton = await page.$('.osano-cm-accept-all');
      if (cookieButton) {
          console.log("Closing cookie banner");
          await cookieButton.click();
          await page.waitForTimeout(1000);
      }
  } catch(e) {}

  // Click "Show Filters"
  try {
    const filterBtn = await page.$('text="Show Filters"');
    if (filterBtn) {
        await filterBtn.click();
        await page.waitForTimeout(1000);
    } else {
        const iconBtn = await page.$('[data-testid="icon-filter"]');
        if (iconBtn) {
            await iconBtn.click();
            await page.waitForTimeout(1000);
        }
    }
  } catch(e) {
    console.log("Show Filters button not found or already open");
  }

  // Click "Set" accordion
  console.log("Opening Set accordion...");
  await page.click('[data-testid="card-sets-trigger"]', { force: true });
  await page.waitForTimeout(1000);
  
  // Check all un-checked checkboxes in the Sets filter
  console.log("Selecting all sets...");
  const setCheckboxes = await page.$$('[data-testid="card-sets-input"] [role="checkbox"], [data-testid="card-sets-input"] input[type="checkbox"]');
  for (const cb of setCheckboxes) {
      const isChecked = await cb.getAttribute('aria-checked') === 'true' || await cb.isChecked();
      if (!isChecked) {
          await cb.click({ force: true });
          await page.waitForTimeout(200);
      }
  }

  await page.waitForTimeout(3000);
  
  const cardsData = [];
  
  console.log("Scrolling to load all cards...");
  let previousHeight = 0;
  while (true) {
    const currentHeight = await page.evaluate('document.body.scrollHeight');
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    await page.waitForTimeout(2000); 
    if (currentHeight === previousHeight) {
      break;
    }
    previousHeight = currentHeight;
  }
  
  const cardElements = await page.$$('[data-testid^="game-card-"]');
  console.log(`Found ${cardElements.length} cards. Starting extraction...`);
  
  const imagesDir = path.join(process.cwd(), 'images');
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir);

  for (let i = 0; i < cardElements.length; i++) {
    const cardId = await cardElements[i].getAttribute('data-card-id');
    console.log(`Extracting card ${i+1}/${cardElements.length}: ${cardId}`);
    
    await cardElements[i].click({ force: true });
    await page.waitForTimeout(1000);
    
    try {
        // Look for the modal that contains the card details, specifically excluding cookie banners.
        // We can find the dialog that contains the close button or is the actual card modal.
        // Usually the card modal will have h2 and h3 elements for stats.
        const modalLocator = page.locator('[role="dialog"], .radix-dialog-content').filter({ hasText: 'Artist' });
        
        if (await modalLocator.count() === 0) {
            console.log("Card Modal not found for", cardId);
            // close it if any other modal is open
            await page.keyboard.press('Escape');
            continue;
        }

        const modal = modalLocator.first();
        
        const cardTitle = await modal.locator('h2, h1').first().textContent().catch(() => "Unknown");
        const cardNumber = await modal.locator('h2 + p, h1 + p').first().textContent().catch(() => "Unknown");
        
        const imgElement = modal.locator('img').first();
        let imgUrl = null;
        if (await imgElement.count() > 0) {
            imgUrl = await imgElement.getAttribute('src');
        }
        
        let localImagePath = null;
        if (imgUrl) {
            const cleanUrl = imgUrl.split('?')[0];
            const ext = cleanUrl.split('.').pop() || 'png';
            localImagePath = `images/${cardId}.${ext}`;
            await downloadImage(imgUrl, path.join(process.cwd(), localImagePath)).catch(e => console.error("Failed to download image", e));
        }
        
        // Grab all text content inside the modal to parse later or find specific properties
        // We can get pairs of h3 (label) and p/span (value)
        const texts = await modal.allInnerTexts();
        
        const cardObj: any = {
            id: cardId,
            name: cardTitle,
            cardNumber: cardNumber,
            image_path: localImagePath,
            raw_text: texts[0] // Since allInnerTexts returns array of strings for each match, we get the first modal's text
        };
        
        cardsData.push(cardObj);
        
        // Close modal
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        
    } catch (e) {
        console.error("Error processing card", cardId, e);
        await page.keyboard.press('Escape'); // try to escape just in case
    }
  }

  fs.writeFileSync('riftbound_cards_fixed.json', JSON.stringify(cardsData, null, 2));
  console.log(`Saved ${cardsData.length} cards to riftbound_cards_fixed.json`);
  
  await browser.close();
})();
