/**
 * nrriandika — Supabase Client
 * Reusable Supabase connection for server-side use.
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl  = process.env.SUPABASE_URL;
const supabaseKey  = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('\n⚠  SUPABASE_URL or SUPABASE_ANON_KEY not set.');
  console.warn('   Check your .env file.\n');
}

const supabase = createClient(supabaseUrl || '', supabaseKey || '');

module.exports = supabase;
