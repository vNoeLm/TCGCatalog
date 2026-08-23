import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import sharp from 'sharp';

dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

const IMAGES_DIR = path.join(process.cwd(), 'images');

async function processImages() {
    console.log("Starting WebP conversion and sync...");
    
    if (!fs.existsSync(IMAGES_DIR)) {
        console.error("Images directory not found.");
        return;
    }
    
    const files = fs.readdirSync(IMAGES_DIR);
    const pngFiles = files.filter(f => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'));
    
    console.log(`Found ${pngFiles.length} original images to convert.`);
    
    let processed = 0;
    const batchSize = 10;
    
    for (let i = 0; i < pngFiles.length; i += batchSize) {
        const batch = pngFiles.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (filename) => {
            const ext = path.extname(filename);
            const basename = path.basename(filename, ext);
            const oldPath = path.join(IMAGES_DIR, filename);
            const newFilename = `${basename}.webp`;
            const newPath = path.join(IMAGES_DIR, newFilename);
            
            try {
                // 1. Convert to webp locally
                await sharp(oldPath)
                    .webp({ quality: 80 })
                    .toFile(newPath);
                    
                // 2. Upload webp to Supabase
                const storagePath = `riftbound/${newFilename}`;
                const imgBuffer = fs.readFileSync(newPath);
                
                const { error: uploadError } = await supabase.storage
                    .from('card-images')
                    .upload(storagePath, imgBuffer, {
                        contentType: 'image/webp',
                        upsert: true
                    });
                    
                if (uploadError) {
                    console.error(`Upload error for ${newFilename}:`, uploadError);
                }
                
                // 3. Delete old file from Supabase Storage
                const oldStoragePath = `riftbound/${filename}`;
                await supabase.storage.from('card-images').remove([oldStoragePath]);
                
                // 4. Update the DB record specifically for this image
                await supabase.from('cards')
                    .update({ image_path: storagePath })
                    .eq('image_path', oldStoragePath);
                    
                // 5. Delete old local file to save space
                fs.unlinkSync(oldPath);
                
                processed++;
            } catch (err) {
                console.error(`Error processing ${filename}:`, err);
            }
        }));
        
        console.log(`Processed ${Math.min(i + batchSize, pngFiles.length)} / ${pngFiles.length} images...`);
    }
    
    // 6. Update the local JSON file just in case it is used again
    try {
        const jsonPath = path.join(process.cwd(), 'riftbound_cards_final.json');
        if (fs.existsSync(jsonPath)) {
            const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            for (const item of data) {
                if (item.image_path) {
                    item.image_path = item.image_path.replace(/\.(png|jpg|jpeg)$/i, '.webp');
                }
            }
            fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
            console.log("Updated riftbound_cards_final.json with webp paths.");
        }
    } catch (e) {
        console.log("Could not update JSON file (optional).");
    }
    
    console.log(`Successfully processed and converted ${processed} images!`);
}

processImages().catch(console.error);
