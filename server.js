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
const Anthropic     = require('@anthropic-ai/sdk');
const supabase      = require('./supabase');

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

// ─── Anthropic (Claude Haiku) client ───────────────────────────
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const FINDER_SYSTEM_PROMPT = `You are a world-class music curator with encyclopedic knowledge across every genre, era, language, and scene — Indonesian indie, K-pop B-sides, 80s synthwave deep cuts, Japanese city pop, bossa nova, African funk, bedroom pop, hyperpop, post-rock, whatever fits.

Given a natural-language prompt about what someone wants to listen to, suggest exactly 15 REAL, verifiable songs that genuinely match the vibe.

CRITICAL DIVERSITY RULES:
- Avoid obvious top-10 picks — no "Let Her Go" for every sad prompt, no "Blinding Lights" for every upbeat prompt
- Mix across popularity tiers: roughly 30% well-known / 40% moderately known / 30% genuine hidden gems
- Vary artists — no repeat artist unless absolutely essential to the vibe
- Vary eras, languages, countries when the prompt allows
- Read between the lines: "lagu nangis di hujan" means emotional Indonesian ballads that pair with rain, not just any sad song. "night drive" means synthwave/dream pop/lo-fi with motion, not chart hits.
- Be a CURATOR, not a chart scraper. Surprise the listener with something they haven't heard.

Output ONLY valid JSON, no markdown fences, no commentary:
{"songs":[{"name":"Exact Song Title","artist":"Exact Artist Name"}, ...]}

- Names must be accurate and findable on Spotify
- Match the user's language/cultural context when relevant
- No duplicates`;

/** Ask Claude for song suggestions. `deep=true` uses Sonnet for refined taste. */
async function generateSongSuggestions({ keyword, deep = false }) {
  if (!anthropic) throw new Error('ANTHROPIC_API_KEY not set');
  if (!keyword) throw new Error('Prompt is required');

  const userPrompt = String(keyword).trim().slice(0, 150);
  const model = deep ? 'claude-sonnet-4-5' : 'claude-haiku-4-5-20251001';
  const nonce = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;

  const response = await anthropic.messages.create({
    model,
    max_tokens: 1200,
    temperature: 1.0,
    top_p: 0.95,
    system: [
      { type: 'text', text: FINDER_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{
      role: 'user',
      content: `Find songs for: "${userPrompt}"\n\n(Session ${nonce} — surprise me with tracks I might not have heard before, avoid predictable picks.)`
    }],
  });

  const content = response.content?.[0]?.text || '';

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
    else throw new Error('Could not parse AI response');
  }

  const list = Array.isArray(parsed) ? parsed : (parsed.songs || parsed.tracks || parsed.recommendations || []);
  const valid = list.filter(x => x && x.name && x.artist);

  // Shuffle then take 10 — different selection each time even from same 15
  const shuffled = valid.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 10);
}

/** Search a single track on Spotify — returns first match with full metadata */
async function spotifyTrackLookup(token, name, artist) {
  const q = `track:"${name}" artist:"${artist}"`;
  const url = `${SPOTIFY_API_BASE}/search?${querystring.stringify({ q, type: 'track', limit: '1' })}`;

  try {
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      validateStatus: null,
    });
    const t = data?.tracks?.items?.[0];
    if (!t) return null;
    return {
      id:       t.id,
      name:     t.name,
      artist:   t.artists.map(a => a.name).join(', '),
      album:    t.album.name,
      image:    t.album.images[0]?.url || null,
      preview:  t.preview_url,
      url:      t.external_urls?.spotify || null,
      duration: t.duration_ms,
    };
  } catch {
    return null;
  }
}

/** Rate limit middleware — daily per-IP + per-endpoint counter in Supabase.
 *  `costFn(req)` returns how many credits the request consumes (default 1). */
function rateLimit(endpoint, maxPerDay, costFn = () => 1) {
  return async function (req, res, next) {
    if (!supabase) return next(); // skip if DB down, don't block users

    const ip =
      req.ip ||
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.socket?.remoteAddress ||
      'unknown';

    const day = new Date().toISOString().slice(0, 10);
    const cost = Math.max(1, costFn(req));

    try {
      const { data: existing } = await supabase
        .from('rate_limits')
        .select('count')
        .eq('ip', ip)
        .eq('endpoint', endpoint)
        .eq('day', day)
        .maybeSingle();

      const used = existing?.count || 0;

      if (used + cost > maxPerDay) {
        const remaining = Math.max(0, maxPerDay - used);
        return res.status(429).json({
          error:     'rate_limit_exceeded',
          message:   cost > 1
            ? `Deep Search costs ${cost} credits, but you only have ${remaining} left today.`
            : `You've used all ${maxPerDay} searches today. Come back tomorrow!`,
          limit:     maxPerDay,
          used,
          cost,
          remaining,
          resetAt:   `${day}T23:59:59Z`,
        });
      }

      await supabase
        .from('rate_limits')
        .upsert({ ip, endpoint, day, count: used + cost }, { onConflict: 'ip,endpoint,day' });

      res.setHeader('X-RateLimit-Limit', maxPerDay);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxPerDay - used - cost));
      req.rateLimit = { used: used + cost, limit: maxPerDay, cost };
      next();
    } catch (err) {
      console.error('rate limit error:', err.message);
      next();
    }
  };
}

/** AI-powered song finder: Claude Haiku/Sonnet → Spotify enrichment.
 *  10 credits/day per IP. Deep Search (Sonnet) costs 2 credits. */
app.get(
  '/api/find-songs',
  rateLimit('find-songs', 10, (req) => req.query.deep === 'true' ? 2 : 1),
  async (req, res) => {
  try {
    const keyword = req.query.keyword
      ? String(req.query.keyword).trim().slice(0, 150)
      : '';
    const deep = req.query.deep === 'true';

    if (!keyword) {
      return res.status(400).json({ error: 'no_prompt', message: 'Please describe what you want to hear' });
    }

    // Get owner token (visitor doesn't need to login)
    const token = await getOwnerToken();
    if (!token) {
      return res.status(503).json({ error: 'owner_not_connected', message: 'Owner Spotify not configured' });
    }

    // Step 1: Ask Claude for song suggestions (Haiku or Sonnet based on `deep`)
    let suggestions;
    try {
      suggestions = await generateSongSuggestions({ keyword, deep });
    } catch (err) {
      console.error('Anthropic error:', err.response?.data || err.message);
      return res.status(502).json({ error: 'ai_failed', message: 'AI suggestion failed. ' + err.message });
    }

    if (!suggestions || suggestions.length === 0) {
      return res.json({ query: keyword, tracks: [], deep, rateLimit: req.rateLimit });
    }

    // Step 2: Enrich each suggestion with Spotify data (parallel)
    const enriched = await Promise.all(
      suggestions.map(s => spotifyTrackLookup(token, s.name, s.artist))
    );

    res.json({ query: keyword, tracks: enriched.filter(Boolean), deep, rateLimit: req.rateLimit });
  } catch (err) {
    console.error('find-songs error:', err.response?.status, err.response?.data || err.message);
    res.status(500).json({
      error: 'search_failed',
      message: err.response?.data?.error?.message || err.message
    });
  }
});

// ─── Recommendations (Supabase) ─────────────────────────────────

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
