// lib/supabaseBrowserClient.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Export BOTH ways so the import can be named or default
export { supabase };
export default supabase;
