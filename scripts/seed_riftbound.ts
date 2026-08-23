import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

const cardsData = JSON.parse(fs.readFileSync('riftbound_cards_final.json', 'utf8'));

async function seed() {
    console.log("Starting database seed for Riftbound...");
    
    const sets = Array.from(new Set(cardsData.map((c: any) => c.cardSet)));
    console.log(`Found ${sets.length} sets. Creating them...`);
    
    const setMap: Record<string, string> = {};
    for (const setName of sets) {
        const code = setName === 'Vendetta' ? 'VEN' : 
                     setName === 'Unleashed' ? 'UNL' : 
                     setName === 'Origins' ? 'OGN' : 
                     setName === 'Stand for Demacia' ? 'SFD' : 
                     (setName as string).substring(0, 3).toUpperCase();
                     
        const { data, error } = await supabase
            .from('sets')
            .upsert({ code, name: setName as string, game: 'riftbound' }, { onConflict: 'code' })
            .select()
            .single();
            
        if (error) {
            console.error(`Error inserting set ${setName}:`, error);
        } else if (data) {
            setMap[setName as string] = data.id;
        }
    }
    
    console.log("Sets created. Uploading images and inserting cards (concurrently)...");
    let success = 0;
    
    // Batch processing
    const batchSize = 10;
    for (let i = 0; i < cardsData.length; i += batchSize) {
        const batch = cardsData.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (card: any) => {
            if (!card.image_path) return;
            
            const setId = setMap[card.cardSet];
            if (!setId) return;
            
            let storagePath = `riftbound/${path.basename(card.image_path)}`;
            
            try {
                const imgBuffer = fs.readFileSync(card.image_path);
                const { error: uploadError } = await supabase.storage
                    .from('card-images')
                    .upload(storagePath, imgBuffer, {
                        contentType: 'image/png',
                        upsert: true
                    });
            } catch (e) {
                // Ignore upload errors if it already exists or minor issues
            }
            
            const { error: insertError } = await supabase
                .from('cards')
                .upsert({
                    set_id: setId,
                    card_number: card.cardNumber,
                    name: card.name,
                    rarity: card.rarity || 'Common',
                    card_type: card.cardType || 'Unit',
                    game: 'riftbound',
                    energy: card.energy,
                    might: card.might,
                    domain: card.domain,
                    tags: card.tags,
                    ability: card.ability,
                    artist: card.artist,
                    image_path: storagePath
                }, { onConflict: 'set_id,card_number' });
                
            if (!insertError) {
                success++;
            }
        }));
        
        console.log(`Processed ${Math.min(i + batchSize, cardsData.length)} / ${cardsData.length} cards...`);
    }
    
    console.log(`Seed complete! Successfully inserted ${success} cards.`);
}

seed().catch(console.error);
