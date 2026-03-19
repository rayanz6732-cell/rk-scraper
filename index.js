const express = require('express');
const cors = require('cors');
const cloudscraper = require('cloudscraper');
const cheerio = require('cheerio');

const app = express();
app.use(cors());
app.use(express.json());

const ANIMEKAI_BASE = 'https://animekai.to';

async function searchAnimeKai(title) {
  try {
    const html = await cloudscraper.get(`${ANIMEKAI_BASE}/browser?keyword=${encodeURIComponent(title)}`);
    const $ = cheerio.load(html);

    let slug = null;

    // Try multiple possible selectors
    const selectors = [
      'a.item',
      'a.film-name',
      '.flw-item a',
      '.film_list-wrap .flw-item a',
      'a[href*="/watch"]',
      '.anif-block-ul li a',
      'a.dynamic-name',
      '.film-detail a'
    ];

    for (const selector of selectors) {
      const el = $(selector).first();
      if (el.length) {
        const href = el.attr('href');
        if (href) {
          slug = href.replace(/^\//, '').split('?')[0];
          console.log(`[S3] Found slug with selector "${selector}": ${slug}`);
          break;
        }
      }
    }

    // Log the HTML snippet for debugging
    if (!slug) {
      console.log('[S3] Could not find slug. HTML snippet:', html.substring(0, 2000));
    }

    return slug;
  } catch (err) {
    console.error('[S3] searchAnimeKai error:', err.message);
    return null;
  }
}

async function getEpisodes(slug) {
  try {
    const html = await cloudscraper.get(`${ANIMEKAI_BASE}/${slug}`);
    const $ = cheerio.load(html);

    const episodes = [];

    const epSelectors = [
      'a.ep-item',
      '.ep-list a',
      '.episodes-ul li a',
      'a[data-num]',
      '.ssl-item.ep-item'
    ];

    for (const selector of epSelectors) {
      $(selector).each((i, el) => {
        const epNum = $(el).attr('data-num') || $(el).attr('data-number') || $(el).text().trim();
        const epId = $(el).attr('data-id') || $(el).attr('href');
        if (epNum && epId) {
          episodes.push({
            number: parseInt(epNum),
            id: epId,
            title: $(el).attr('title') || `Episode ${epNum}`
          });
        }
      });
      if (episodes.length > 0) {
        console.log(`[S3] Found ${episodes.length} episodes with selector "${selector}"`);
        break;
      }
    }

    return episodes;
  } catch (err) {
    console.error('[S3] getEpisodes error:', err.message);
    return [];
  }
}

async function getEmbedUrl(epId) {
  try {
    const url = epId.startsWith('http') ? epId : `${ANIMEKAI_BASE}${epId.startsWith('/') ? '' : '/'}${epId}`;
    const html = await cloudscraper.get(url);
    const $ = cheerio.load(html);

    const iframe = $('iframe').first().attr('src');
    if (iframe) return iframe.startsWith('http') ? iframe : `https:${iframe}`;

    return url;
  } catch (err) {
    console.error('[S3] getEmbedUrl error:', err.message);
    return null;
  }
}

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'RK Scraper running' });
});

// Debug route — see raw HTML from AnimeKai search
app.get('/debug', async (req, res) => {
  const { title } = req.query;
  if (!title) return res.status(400).json({ error: 'title required' });
  try {
    const html = await cloudscraper.get(`${ANIMEKAI_BASE}/browser?keyword=${encodeURIComponent(title)}`);
    res.send(`<pre>${html.substring(0, 5000)}</pre>`);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search
app.get('/search', async (req, res) => {
  const { title } = req.query;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const slug = await searchAnimeKai(title);
  if (!slug) return res.status(404).json({ error: 'Anime not found' });
  res.json({ slug });
});

// Episodes
app.get('/episodes', async (req, res) => {
  const { title } = req.query;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const slug = await searchAnimeKai(title);
  if (!slug) return res.status(404).json({ error: 'Anime not found on AnimeKai' });
  const episodes = await getEpisodes(slug);
  res.json({ slug, episodes });
});

// Embed
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`RK Scraper running on port ${PORT}`));
```

After saving on GitHub, Railway will **auto-redeploy** in about 1 minute. Then go to:
```
https://rk-scraper-production.up.railway.app/debug?title=Jujutsu Kaisen
