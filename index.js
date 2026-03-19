const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(cors());
app.use(express.json());

const ANIMEKAI_BASE = 'https://animekai.to';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.5',
  'Connection': 'keep-alive'
};

async function searchAnimeKai(title) {
  try {
    const html = await axios.get(
      `${ANIMEKAI_BASE}/browser?keyword=${encodeURIComponent(title)}`,
      { headers: HEADERS, timeout: 10000 }
    );
    const $ = cheerio.load(html.data);
    let slug = null;

    $('a').each((i, el) => {
      const href = $(el).attr('href') || '';
      if (!slug && href.match(/^\/[a-z0-9-]+-\d+$/)) {
        slug = href.replace('/', '');
      }
    });

    console.log(`[S3] Search "${title}" → slug: ${slug}`);
    return slug;
  } catch (err) {
    console.error('[S3] searchAnimeKai error:', err.message);
    return null;
  }
}

async function getEpisodes(slug) {
  try {
    const html = await axios.get(`${ANIMEKAI_BASE}/${slug}`, {
      headers: HEADERS, timeout: 10000
    });
    const $ = cheerio.load(html.data);
    const episodes = [];

    const selectors = [
      'a.ep-item', '.ep-list a', 'a[data-num]',
      '.ssl-item.ep-item', '.episodes-ul li a'
    ];

    for (const selector of selectors) {
      $(selector).each((i, el) => {
        const epNum = $(el).attr('data-num') || $(el).attr('data-number');
        const epId = $(el).attr('data-id') || $(el).attr('href');
        if (epNum && epId) {
          episodes.push({
            number: parseInt(epNum),
            id: epId,
            title: $(el).attr('title') || `Episode ${epNum}`
          });
        }
      });
      if (episodes.length > 0) break;
    }

    console.log(`[S3] Found ${episodes.length} episodes for "${slug}"`);
    return episodes;
  } catch (err) {
    console.error('[S3] getEpisodes error:', err.message);
    return [];
  }
}

async function getEmbedUrl(epId) {
  try {
    const url = epId.startsWith('http')
      ? epId
      : `${ANIMEKAI_BASE}${epId.startsWith('/') ? '' : '/'}${epId}`;
    const html = await axios.get(url, { headers: HEADERS, timeout: 10000 });
    const $ = cheerio.load(html.data);
    const iframe = $('iframe').first().attr('src');
    if (iframe) return iframe.startsWith('http') ? iframe : `https:${iframe}`;
    return url;
  } catch (err) {
    console.error('[S3] getEmbedUrl error:', err.message);
    return null;
  }
}

app.get('/', (req, res) => {
  res.json({ status: 'RK Scraper running OK' });
});

app.get('/debug', async (req, res) => {
  const { title } = req.query;
  if (!title) return res.status(400).json({ error: 'title required' });
  try {
    const r = await axios.get(
      `${ANIMEKAI_BASE}/browser?keyword=${encodeURIComponent(title)}`,
      { headers: HEADERS, timeout: 10000 }
    );
    res.send('<pre>' + r.data.substring(0, 6000) + '</pre>');
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/search', async (r
