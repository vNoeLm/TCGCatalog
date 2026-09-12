/**
 * @deprecated user_cards row-per-card table has been retired and migrated to public.user_collections JSONB.
 * Use src/lib/userCollections.ts instead.
 */
export { saveUserCollection, loadUserCollection } from './userCollections';
