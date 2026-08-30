// Runtime-konfig for frontend. Ingen hemmeligheter her (anon key er OK i klient, beskyttet av RLS).
(function () {
  var SUPABASE_URL = 'https://alyzypfguxumtnztrzer.supabase.co';
  var isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

  window.APP_CONFIG = {
    // 'live' bruker Supabase RPC nearby_stores; 'snapshot' bruker public/data/snapshot.json.
    dataSource: 'live',

    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFseXp5cGZndXh1bXRuenRyemVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5ODc4NjIsImV4cCI6MjEwMjU2Mzg2Mn0.zQwvuCAJj2a9BeospnDD2FNAYX30DYUi9khbXr6zrEw',

    // Dev: lokal token-server. Prod: Supabase Edge Function (mapkit-token).
    mapkitTokenUrl: isLocal ? '/mapkit-token' : SUPABASE_URL + '/functions/v1/mapkit-token',

    defaultCenter: { lat: 59.9139, lon: 10.7522 }, // Oslo sentrum (fallback uten posisjon)
    radiusMeters: 20000,
  };
})();
