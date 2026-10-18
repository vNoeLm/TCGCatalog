import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const BUCKET = 'card-images';

async function listAllFiles(prefix = '') {
  const files = [];
  const limit = 100;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });

    if (error) {
      console.error(`Error listing prefix "${prefix}":`, error.message);
      break;
    }

    if (!data || data.length === 0) break;

    for (const item of data) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) {
        // It's a folder, recurse
        const nested = await listAllFiles(fullPath);
        files.push(...nested);
      } else {
        files.push(fullPath);
      }
    }

    if (data.length < limit) break;
    offset += limit;
  }

  return files;
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`Scanning Supabase storage bucket "${BUCKET}" for files to clean up...`);

  // Target folders to delete: riftbound and thumbs
  const targetPrefixes = ['riftbound', 'thumbs'];
  const filesToDelete = [];

  for (const prefix of targetPrefixes) {
    console.log(`Scanning "${prefix}"...`);
    const files = await listAllFiles(prefix);
    console.log(`Found ${files.length} files under "${prefix}".`);
    filesToDelete.push(...files);
  }

  console.log(`\nTotal files targeted for deletion: ${filesToDelete.length}`);

  if (!apply) {
    console.log('\nDRY RUN completed. No files were deleted.');
    console.log('Run with --apply to permanently delete these files from Supabase.');
    return;
  }

  console.log('\nDeleting files from Supabase Storage in batches of 100...');
  const BATCH_SIZE = 100;
  let deletedCount = 0;

  for (let i = 0; i < filesToDelete.length; i += BATCH_SIZE) {
    const batch = filesToDelete.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase.storage.from(BUCKET).remove(batch);
    if (error) {
      console.error(`Error deleting batch starting at ${i}:`, error.message);
    } else {
      deletedCount += (data || []).length;
      process.stdout.write(`Deleted ${deletedCount} / ${filesToDelete.length} files...\r`);
    }
  }

  console.log(`\nFinished deleting ${deletedCount} files from Supabase Storage.`);
}

main().catch((err) => {
  console.error('Fatal cleanup error:', err);
  process.exit(1);
});
