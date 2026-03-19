const express = require('express');
const cors = require('cors');
const cloudscraper = require('cloudscraper');
const cheerio = require('cheerio');

const app = express();
app.use(cors());
app.use(express.json());

const ANIMEKAI_BASE = 'https://animekai.to';

// Search AnimeKai for an anime by title, return its slug
async function searchAnimeKai(title) {
  try {
    const html = await cloudscraper.get(`${ANIMEKAI_BASE}/browser?keyword=${encodeURIComponent(title)}`);
    const $ = cheerio.load(html);

    let slug = null;
    $('.aitem').first().each((i, el) => {
      const href = $(el).attr('href');
      if (href) slug = href.replace('/', '');
    });

    return slug;
  } catch (err) {
    console.error('[scraper] searchAnimeKai error:', err.message);
    return null;
  }
}

// Get episode list for a given anime slug
async function getEpisodes(slug) {
  try {
    const html = await cloudscraper.get(`${ANIMEKAI_BASE}/${slug}`);
    const $ = cheerio.load(html);

    const episodes = [];
    $('.ep-item').each((i, el) => {
      const epNum = $(el).attr('data-num');
      const epId = $(el).attr('data-id');
      const epTitle = $(el).attr('title') || `Episode ${epNum}`;
      if (epNum && epId) {
        episodes.push({
          number: parseInt(epNum),
          id: epId,
          title: epTitle
        });
      }
    });

    return episodes;
  } catch (err) {
    console.error('[scraper] getEpisodes error:', err.message);
    return [];
  }
}

// Get the embed URL for a specific episode
async function getEmbedUrl(epId) {
  try {
    const html = await cloudscraper.get(`${ANIMEKAI_BASE}/watch/${epId}`);
    const $ = cheerio.load(html);

    // Try to find the iframe src or video source
    const iframe = $('iframe').first().attr('src');
    if (iframe) return iframe;

    // Fallback: return the watch page URL itself
    return `${ANIMEKAI_BASE}/watch/${epId}`;
  } catch (err) {
    console.error('[scraper] getEmbedUrl error:', err.message);
    return null;
  }
}

// ── ROUTES ──────────────────────────────────────────────

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'RK Scraper is running' });
});

// Search for an anime and return its slug
// GET /search?title=Jujutsu+Kaisen
app.get('/search', async (req, res) => {
  const { title } = req.query;
  if (!title) return res.status(400).json({ error: 'title is required' });

  const slug = await searchAnimeKai(title);
  if (!slug) return res.status(404).json({ error: 'Anime not found' });

  res.json({ slug });
});

// Get episode list for an anime
// GET /episodes?title=Jujutsu+Kaisen
app.get('/episodes', async (req, res) => {
  const { title } = req.query;
  if (!title) return res.status(400).json({ error: 'title is required' });

  const slug = await searchAnimeKai(title);
  if (!slug) return res.status(404).json({ error: 'Anime not found on AnimeKai' });

  const episodes = await getEpisodes(slug);
  res.json({ slug, episodes });
});

// Get embed URL for a specific episode
// GET /embed?title=Jujutsu+Kaisen&ep=1
app.get('/embed', async (req, res) => {
  const { title, ep } = req.query;
  if (!title || !ep) return res.status(400).json({ error: 'title and ep are required' });

  const slug = await searchAnimeKai(title);
  if (!slug) return res.status(404).json({ error: 'Anime not found on AnimeKai' });

  const episodes = await getEpisodes(slug);
  const episode = episodes.find(e => e.number === parseInt(ep));
  if (!episode) return res.status(404).json({ error: `Episode ${ep} not found` });

  const embedUrl = await getEmbedUrl(episode.id);
  res.json({ embedUrl, episode });
});

// ── START ────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`RK Scraper running on port ${PORT}`);
});
