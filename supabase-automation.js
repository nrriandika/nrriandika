/**
 * nrriandika — Supabase Client (Automation project)
 * Koneksi terpisah ke project Supabase "otomasi", independen dari supabase.js.
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_AUTOMATION_URL;
const supabaseKey = process.env.SUPABASE_AUTOMATION_KEY;

let supabaseAutomation = null;

if (supabaseUrl && supabaseKey) {
  supabaseAutomation = createClient(supabaseUrl, supabaseKey);
} else {
  console.warn('⚠  SUPABASE_AUTOMATION_URL or SUPABASE_AUTOMATION_KEY not set.');
}

module.exports = supabaseAutomation;
