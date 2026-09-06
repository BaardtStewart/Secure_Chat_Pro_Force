import { createClient } from '@supabase/supabase-js';

// Real project credentials — the anon key is meant to be public/client-side,
// this is not a secret. Never put the service_role key here or anywhere in
// client code.
const SUPABASE_URL = 'https://kmxnzrjopuaramlnajqs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtteG56cmpvcHVhcmFtbG5hanFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1NDIyNTIsImV4cCI6MjEwNDExODI1Mn0.01tFavgA55HrGRH1bChztJ4z2b8OHCgAQhzibouuwIc';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Required for the magic link flow: when Supabase redirects the user
    // back after clicking the email link, the session tokens arrive in the
    // URL — this tells the client to look for them and establish a real
    // session automatically on page load, rather than requiring extra code
    // to parse the URL ourselves.
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
});
