/**
 * nrriandika — Supabase Client
 * Reusable Supabase connection for server-side use.
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl  = process.env.SUPABASE_URL;
const supabaseKey  = process.env.SUPABASE_ANON_KEY;

let supabase = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
} else {
  console.warn('⚠  SUPABASE_URL or SUPABASE_ANON_KEY not set.');
}

module.exports = supabase;
