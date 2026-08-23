import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const jsonPath = path.join(process.cwd(), 'riftbound_cards_final.json');
const cardsData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

async function fixRarities() {
    console.log("Identifying Showcase cards...");
    let updatedCount = 0;
    
    for (const card of cardsData) {
        let isShowcase = false;
        if (card.cardNumber.includes('SP')) isShowcase = true;
        
        const m = card.cardNumber.match(/(\d+)([a-zA-Z]*)\/(\d+)/);
        if (m) {
            const num = parseInt(m[1], 10);
            const letter = m[2];
            const total = parseInt(m[3], 10);
            if (num > total || letter) isShowcase = true;
        }
        
        if (isShowcase && card.rarity !== 'Showcase') {
            card.rarity = 'Showcase';
            updatedCount++;
            
            // Update in Supabase
            const { error } = await supabase
                .from('cards')
                .update({ rarity: 'Showcase' })
                .eq('game', 'riftbound')
                .eq('card_number', card.cardNumber);
                
            if (error) {
                console.error(`Error updating ${card.cardNumber}:`, error.message);
            } else {
                console.log(`Updated ${card.cardNumber} (${card.name}) to Showcase`);
            }
        }
    }
    
    if (updatedCount > 0) {
        fs.writeFileSync(jsonPath, JSON.stringify(cardsData, null, 2));
        console.log(`\nSuccessfully updated ${updatedCount} Showcase cards in Database and JSON!`);
    } else {
        console.log("No Showcase cards needed updating.");
    }
}

fixRarities().catch(console.error);
