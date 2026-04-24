/**
 * nrriandika — Personal Website Server
 * Handles Spotify OAuth 2.0 and proxies Spotify API calls.
 *
 * Flow:
 *  1. Browser → GET /auth/login  → redirect to Spotify
 *  2. Spotify → GET /auth/callback?code=… → exchange for tokens
 *  3. Browser → GET /api/now-playing       → currently playing
 *  4. Browser → GET /api/top-tracks        → top tracks
 *  5. Browser → GET /api/recent-tracks     → recently played
 */

require('dotenv').config();
const express       = require('express');
const cookieSession = require('cookie-session');
const axios         = require('axios');
const cors          = require('cors');
const path          = require('path');
const crypto        = require('crypto');
const querystring   = require('querystring');
const fs            = require('fs');
const https         = require('https');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Validate required env vars ────────────────────────────────
const SPOTIFY_CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REDIRECT_URI  = process.env.SPOTIFY_REDIRECT_URI || `http://localhost:${PORT}/auth/callback`;
const SESSION_SECRET        = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
  console.warn('\n⚠  SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET not set.');
  console.warn('   Copy .env.example to .env and fill in your credentials.\n');
}

// ─── Middleware ─────────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieSession({
  name: 'session',
  keys: [SESSION_SECRET],
  maxAge: 7 * 24 * 60 * 60 * 1000,
  secure: process.env.NODE_ENV === 'production',
  httpOnly: true,
  sameSite: 'lax',
}));

// Serve static frontend files from public/
app.use(express.static(path.join(__dirname, 'public')));

// ─── Spotify helpers ────────────────────────────────────────────
const SPOTIFY_SCOPES = [
  'user-read-currently-playing',
  'user-read-playback-state',
  'user-top-read',
  'user-read-recently-played',
].join(' ');

const SPOTIFY_TOKEN_URL   = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE    = 'https://api.spotify.com/v1';

function base64Creds() {
  return Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
}

/** Exchange auth code for access + refresh token */
async function exchangeCode(code) {
  const response = await axios.post(SPOTIFY_TOKEN_URL,
    querystring.stringify({ grant_type: 'authorization_code', code, redirect_uri: SPOTIFY_REDIRECT_URI }),
    { headers: { Authorization: `Basic ${base64Creds()}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return response.data; // { access_token, refresh_token, expires_in }
}

/** Refresh an expired access token */
async function refreshToken(refreshTk) {
  const response = await axios.post(SPOTIFY_TOKEN_URL,
    querystring.stringify({ grant_type: 'refresh_token', refresh_token: refreshTk }),
    { headers: { Authorization: `Basic ${base64Creds()}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return response.data; // { access_token, expires_in }
}

// ─── Owner token helpers (Supabase) ─────────────────────────────

/** Get owner's Spotify token from Supabase, refresh if needed */
async function getOwnerToken() {
  if (!supabase) return null;

  const { data: owner, error } = await supabase
    .from('spotify_owner')
    .select('*')
    .eq('id', 'owner')
    .single();

  if (error || !owner) return null;

  // Refresh if expiring within 60 seconds
  if (Date.now() >= (owner.expires_at - 60_000)) {
    try {
      const refreshed = await refreshToken(owner.refresh_token);
      const newExpires = Date.now() + refreshed.expires_in * 1000;

      await supabase.from('spotify_owner').upsert({
        id: 'owner',
        access_token:  refreshed.access_token,
        refresh_token: refreshed.refresh_token || owner.refresh_token,
        expires_at:    newExpires,
        updated_at:    new Date().toISOString(),
      });

      return refreshed.access_token;
    } catch {
      return null;
    }
  }

  return owner.access_token;
}

/** Middleware — resolves access token: user session first, then owner fallback */
async function resolveSpotifyToken(req, res, next) {
  // 1) Visitor has their own session
  if (req.session.spotify?.accessToken) {
    const { accessToken, refreshTk, expiresAt } = req.session.spotify;

    if (Date.now() >= (expiresAt - 60_000)) {
      try {
        const data = await refreshToken(refreshTk);
        req.session.spotify.accessToken = data.access_token;
        req.session.spotify.expiresAt   = Date.now() + data.expires_in * 1000;
      } catch {
        delete req.session.spotify;
      }
    }

    if (req.session.spotify?.accessToken) {
      req.spotifyToken = req.session.spotify.accessToken;
      req.spotifySource = 'user';
      return next();
    }
  }

  // 2) Fallback: owner token from Supabase
  const ownerToken = await getOwnerToken();
  if (ownerToken) {
    req.spotifyToken = ownerToken;
    req.spotifySource = 'owner';
    return next();
  }

  return res.status(401).json({ error: 'not_connected' });
}

// ─── Auth routes ────────────────────────────────────────────────

const OWNER_SECRET = process.env.OWNER_SECRET || 'owner-setup';

/** Step 1 — redirect user to Spotify login */
app.get('/auth/login', (req, res) => {
  const state = crypto.randomBytes(8).toString('hex');
  // Mark if this is owner setup
  if (req.query.owner === OWNER_SECRET) {
    req.session.isOwnerSetup = true;
  }
  req.session.oauthState = state;

  const params = querystring.stringify({
    response_type: 'code',
    client_id:     SPOTIFY_CLIENT_ID,
    scope:         SPOTIFY_SCOPES,
    redirect_uri:  SPOTIFY_REDIRECT_URI,
    state,
    show_dialog:   false,
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
});

/** Step 2 — Spotify redirects back with auth code */
app.get('/auth/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) return res.redirect('/#music?error=' + error);
  if (state !== req.session.oauthState) return res.redirect('/#music?error=state_mismatch');

  try {
    const tokens = await exchangeCode(code);
    const isOwner = req.session.isOwnerSetup;
    delete req.session.isOwnerSetup;

    // If owner setup → save to Supabase
    if (isOwner && supabase) {
      await supabase.from('spotify_owner').upsert({
        id: 'owner',
        access_token:  tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at:    Date.now() + tokens.expires_in * 1000,
        updated_at:    new Date().toISOString(),
      });
      return res.redirect('/#music?owner=connected');
    }

    // Normal visitor login
    req.session.spotify = {
      accessToken: tokens.access_token,
      refreshTk:   tokens.refresh_token,
      expiresAt:   Date.now() + tokens.expires_in * 1000,
    };
    res.redirect('/#music');
  } catch (err) {
    console.error('OAuth callback error:', err.response?.data || err.message);
    res.redirect('/#music?error=token_exchange_failed');
  }
});

/** Logout — clear visitor session (not owner) */
app.get('/auth/logout', (req, res) => {
  delete req.session.spotify;
  res.redirect('/#music');
});

/** Status — check connection state */
app.get('/auth/status', async (req, res) => {
  const userConnected = !!(req.session.spotify?.accessToken);
  const ownerToken = await getOwnerToken();

  res.json({
    connected: userConnected || !!ownerToken,
    source: userConnected ? 'user' : (ownerToken ? 'owner' : 'none'),
    userConnected,
  });
});

// ─── Spotify API routes ─────────────────────────────────────────

/** Currently playing track */
app.get('/api/now-playing', resolveSpotifyToken, async (req, res) => {
  try {
    const { data, status } = await axios.get(
      `${SPOTIFY_API_BASE}/me/player/currently-playing`,
      { headers: { Authorization: `Bearer ${req.spotifyToken}` }, validateStatus: null }
    );

    if (status === 204 || !data || !data.item) {
      return res.json({ playing: false, source: req.spotifySource });
    }

    const track = data.item;
    res.json({
      playing:   data.is_playing,
      name:      track.name,
      artist:    track.artists.map(a => a.name).join(', '),
      album:     track.album.name,
      image:     track.album.images[0]?.url || null,
      url:       track.external_urls?.spotify || null,
      progress:  data.progress_ms,
      duration:  track.duration_ms,
      source:    req.spotifySource,
    });
  } catch (err) {
    console.error('now-playing error:', err.response?.data || err.message);
    res.status(500).json({ error: 'spotify_api_error' });
  }
});

/** Top tracks */
app.get('/api/top-tracks', resolveSpotifyToken, async (req, res) => {
  const timeRange = ['short_term','medium_term','long_term'].includes(req.query.range)
    ? req.query.range : 'short_term';

  try {
    const { data } = await axios.get(
      `${SPOTIFY_API_BASE}/me/top/tracks?limit=10&time_range=${timeRange}`,
      { headers: { Authorization: `Bearer ${req.spotifyToken}` } }
    );

    res.json(data.items.map((t, i) => ({
      rank:   i + 1,
      name:   t.name,
      artist: t.artists.map(a => a.name).join(', '),
      image:  t.album.images.slice(-1)[0]?.url || null,
      url:    t.external_urls?.spotify || null,
    })));
  } catch (err) {
    console.error('top-tracks error:', err.response?.data || err.message);
    res.status(500).json({ error: 'spotify_api_error' });
  }
});

/** Recently played */
app.get('/api/recent-tracks', resolveSpotifyToken, async (req, res) => {
  try {
    const { data } = await axios.get(
      `${SPOTIFY_API_BASE}/me/player/recently-played?limit=10`,
      { headers: { Authorization: `Bearer ${req.spotifyToken}` } }
    );

    const seen = new Set();
    const tracks = [];
    for (const item of data.items) {
      if (!seen.has(item.track.id)) {
        seen.add(item.track.id);
        tracks.push({
          rank:   tracks.length + 1,
          name:   item.track.name,
          artist: item.track.artists.map(a => a.name).join(', '),
          image:  item.track.album.images.slice(-1)[0]?.url || null,
          url:    item.track.external_urls?.spotify || null,
        });
      }
      if (tracks.length >= 10) break;
    }

    res.json(tracks);
  } catch (err) {
    console.error('recent-tracks error:', err.response?.data || err.message);
    res.status(500).json({ error: 'spotify_api_error' });
  }
});

// ─── AI Song Finder ─────────────────────────────────────────────

const MOOD_KEYWORDS = {
  happy:      'happy upbeat feel-good',
  sad:        'sad melancholic heartbreak',
  chill:      'chill lofi relaxing ambient',
  energetic:  'energetic pumped workout',
  romantic:   'romantic love',
  melancholic:'reflective introspective',
};

const ERA_RANGES = {
  '70s':    '1970-1979',
  '80s':    '1980-1989',
  '90s':    '1990-1999',
  '2000s':  '2000-2009',
  '2010s':  '2010-2019',
  'recent': '2020-2025',
};

/** Find songs by parameters — uses owner's token so it works without login */
app.get('/api/find-songs', async (req, res) => {
  try {
    const { mood, genre, era, keyword } = req.query;

    // Build Spotify search query
    const parts = [];
    if (mood && MOOD_KEYWORDS[mood]) parts.push(MOOD_KEYWORDS[mood]);
    if (keyword)                     parts.push(String(keyword).trim().slice(0, 60));
    if (genre)                       parts.push(`genre:${genre}`);
    if (era && ERA_RANGES[era])      parts.push(`year:${ERA_RANGES[era]}`);

    if (parts.length === 0) {
      return res.status(400).json({ error: 'no_parameters', message: 'Pick at least one parameter' });
    }

    const query = parts.join(' ');

    // Get owner token (visitor doesn't need to login)
    const token = await getOwnerToken();
    if (!token) {
      return res.status(503).json({ error: 'owner_not_connected', message: 'Owner Spotify not configured' });
    }

    const searchUrl = `${SPOTIFY_API_BASE}/search?${querystring.stringify({
      q: query,
      type: 'track',
      limit: '10',
    })}`;

    const { data } = await axios.get(searchUrl, {
      headers: { Authorization: `Bearer ${token}` },
      validateStatus: null,
    });

    if (!data || !data.tracks) {
      console.error('find-songs: unexpected response', data);
      return res.status(502).json({ error: 'bad_response', message: data?.error?.message || 'Unexpected response' });
    }

    const tracks = (data.tracks.items || []).map(t => ({
      id:       t.id,
      name:     t.name,
      artist:   t.artists.map(a => a.name).join(', '),
      album:    t.album.name,
      image:    t.album.images[0]?.url || null,
      preview:  t.preview_url,
      url:      t.external_urls?.spotify || null,
      duration: t.duration_ms,
    }));

    res.json({ query, tracks });
  } catch (err) {
    console.error('find-songs error:', err.response?.status, err.response?.data || err.message);
    res.status(500).json({
      error: 'search_failed',
      message: err.response?.data?.error?.message || err.message
    });
  }
});

// ─── Recommendations (Supabase) ─────────────────────────────────
const supabase = require('./supabase');

/** Guard — return 503 if Supabase is not configured */
function requireSupabase(_req, res, next) {
  if (!supabase) return res.status(503).json({ error: 'database_not_configured' });
  next();
}

/** Get all recommendations (newest first) */
app.get('/api/recommendations', requireSupabase, async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit) || 10, 50);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);

  try {
    const { data, error, count } = await supabase
      .from('recommendations')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    res.json({ items: data, total: count, offset, limit });
  } catch (err) {
    console.error('recommendations fetch error:', err.message);
    res.status(500).json({ error: 'fetch_failed' });
  }
});

/** Submit a new recommendation */
app.post('/api/recommendations', requireSupabase, async (req, res) => {
  const { type, name, reason, submitted_by, emoji } = req.body;

  if (!type || !name || !name.trim()) {
    return res.status(400).json({ error: 'type and name are required' });
  }

  if (!['song', 'artist'].includes(type)) {
    return res.status(400).json({ error: 'type must be "song" or "artist"' });
  }

  try {
    const { data, error } = await supabase
      .from('recommendations')
      .insert({
        type,
        name: name.trim().slice(0, 200),
        reason: reason ? reason.trim().slice(0, 300) : null,
        submitted_by: (submitted_by && submitted_by.trim()) ? submitted_by.trim().slice(0, 50) : 'Anonymous',
        emoji: emoji || (type === 'song' ? '🎵' : '🎤'),
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('recommendation insert error:', err.message);
    res.status(500).json({ error: 'insert_failed' });
  }
});

/** Like a recommendation */
app.post('/api/recommendations/:id/like', requireSupabase, async (req, res) => {
  const { id } = req.params;
  try {
    // Fetch current likes
    const { data: rec, error: fetchErr } = await supabase
      .from('recommendations')
      .select('likes')
      .eq('id', id)
      .single();

    if (fetchErr) throw fetchErr;

    const { data, error } = await supabase
      .from('recommendations')
      .update({ likes: (rec.likes || 0) + 1 })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('like error:', err.message);
    res.status(500).json({ error: 'like_failed' });
  }
});

// ─── SPA fallback ────────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ──────────────────────────────────────────────────────
// Only listen when running locally (not on Vercel)
if (process.env.VERCEL !== '1') {
  const USE_HTTPS = process.env.USE_HTTPS === 'true';

  if (USE_HTTPS) {
    const certPath = process.env.SSL_CERT || path.join(__dirname, 'localhost.pem');
    const keyPath  = process.env.SSL_KEY  || path.join(__dirname, 'localhost-key.pem');

    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
      console.error('\n❌  SSL cert not found. Run: mkcert localhost');
      console.error('    Expected:', certPath, 'and', keyPath, '\n');
      process.exit(1);
    }

    https.createServer({ cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) }, app)
      .listen(PORT, () => {
        console.log(`\n🔒  Server running at https://localhost:${PORT}`);
        console.log(`🎵  Spotify auth: https://localhost:${PORT}/auth/login\n`);
      });
  } else {
    app.listen(PORT, () => {
      console.log(`\n🌐  Server running at http://localhost:${PORT}`);
      console.log(`🎵  Spotify auth: http://localhost:${PORT}/auth/login\n`);
    });
  }
}

// Export for Vercel serverless
module.exports = app;
