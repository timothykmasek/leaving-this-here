// Edit these for your environment.
//
// SUPABASE_URL / SUPABASE_ANON_KEY: public values from your Supabase project
// (the same ones in the web app's .env.local — the anon key is safe to ship
// in a client). API_BASE: where your Next.js app is reachable.
//
// For local testing point API_BASE at the dev server. For the published
// extension, switch it to your production domain.
export const CONFIG = {
  SUPABASE_URL: 'https://xtnqvjaexkztcrriotjj.supabase.co',
  SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0bnF2amFleGt6dGNycmlvdGpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNzI0NDQsImV4cCI6MjA5MDg0ODQ0NH0.XSHMUyZWhQ1CHJs_CNXbi4QbMruCeSLyUvyVxarWjlY',
  // Production. Use the canonical www host directly — the apex
  // (internet-gems.com) 308-redirects to www, and a cross-origin POST
  // redirect can drop the Authorization header. For local testing swap to
  // 'http://localhost:3000' (run `npm run dev`).
  API_BASE: 'https://www.internet-gems.com',
}
