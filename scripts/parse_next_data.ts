import fs from 'fs';
import path from 'path';
import https from 'https';

const nextData = JSON.parse(fs.readFileSync('next_data.json', 'utf8'));

// Recursive function to find all card objects
function findCards(obj: any, cards: any[]) {
    if (!obj || typeof obj !== 'object') return;
    
    // A card object typically has "publicCode", "cardImage", "rarity", etc.
    if (obj.id && obj.name && obj.cardImage && obj.publicCode) {
        cards.push(obj);
        return; // Found a card, don't recurse inside it
    }
    
    if (Array.isArray(obj)) {
        for (const item of obj) findCards(item, cards);
    } else {
        for (const key in obj) findCards(obj[key], cards);
    }
}

const rawCards: any[] = [];
findCards(nextData, rawCards);

console.log(`Found ${rawCards.length} cards in __NEXT_DATA__`);

async function downloadImage(url: string, filepath: string) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
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

const imagesDir = path.join(process.cwd(), 'images');
if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir);

const formattedCards = [];

(async () => {
    for (const card of rawCards) {
        const energy = card.energy?.value?.label || null;
        const might = card.might?.value?.label || null;
        const domain = card.domain?.values?.map((v: any) => v.label).join(', ') || null;
        const cardType = card.cardType?.type?.map((t: any) => t.label).join(', ') || null;
        const tags = card.tags?.tags || [];
        const ability = card.text?.richText?.body || null;
        const rarity = card.rarity?.value?.label || null;
        const artist = card.illustrator?.values?.map((v: any) => v.label).join(', ') || null;
        const cardSet = card.set?.value?.label || null;
        
        let imgUrl = card.cardImage?.url || null;
        let localImagePath = null;
        if (imgUrl) {
            const cleanUrl = imgUrl.split('?')[0];
            const ext = cleanUrl.split('.').pop() || 'png';
            localImagePath = `images/${card.id}.${ext}`;
            try {
                if (!fs.existsSync(localImagePath)) {
                    await downloadImage(imgUrl, localImagePath);
                    console.log(`Downloaded image for ${card.id}`);
                }
            } catch(e) {
                console.error(`Failed to download image for ${card.id}`, e);
            }
        }
        
        formattedCards.push({
            id: card.id,
            name: card.name,
            cardNumber: card.publicCode,
            energy,
            might,
            domain,
            cardType,
            tags,
            ability,
            rarity,
            artist,
            cardSet,
            image_path: localImagePath
        });
    }

    fs.writeFileSync('riftbound_cards_final.json', JSON.stringify(formattedCards, null, 2));
    console.log(`Successfully saved ${formattedCards.length} structured cards to riftbound_cards_final.json`);
})();
