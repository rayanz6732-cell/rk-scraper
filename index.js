const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(cors());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

// Debug — raw HTML from AnimeKai search
app.get('/debug', async (req, res) => {
  const { title } = req.query;
  if (!title) return res.status(400).json({ error: 'title required' });

  try {
    const r = await axios.get(`https://animekai.to/browser?keyword=${encodeURIComponent(title)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html'
      },
      timeout: 10000
    });
    res.send('<pre>' + r.data.substring(0, 6000) + '</pre>');
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Embed endpoint
app.get('/embed', async (req, res) => {
  const { title, ep } = req.query;
  if (!title || !ep) return res.status(400).json({ error: 'title and ep required' });

  try {
    // Step 1 — Search AnimeKai
    const searchRes = await axios.get(`https://animekai.to/browser?keyword=${encodeURIComponent(title)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html'
      },
      timeout: 10000
    });

    const $s = cheerio.load(searchRes.data);
    let slug = null;

    $s('a').each((i, el) => {
      const href = $s(el).attr('href') || '';
      if (href.match(/^\/[a-z0-9-]+-\d+$/) && !slug) {
        slug = href.replace('/', '');
      }
    });

    if (!slug) return res.status(404).json({ error: 'Anime not found on AnimeKai', html_preview: searchRes.data.substring(0, 1000) });

    // Step 2 — Get anime page
    const animeRes = await axios.get(`https://animekai.to/${slug}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html'
      },
      timeout: 10000
    });

    const $a = cheerio.load(animeRes.data);
    let epHref = null;

    $a('a').each((i, el) => {
      const num = $a(el).attr('data-num');
      const href = $a(el).attr('href') || '';
      if (num && parseInt(num) === parseInt(ep) && href.includes('watch') && !epHref) {
        epHref = href;
      }
    });

    if (!epHref) return res.status(404).json({ error: `Episode ${ep} not found`, slug });

    // Step 3 — Get embed from watch page
    const watchUrl = epHref.startsWith('http') ? epHref : `https://animekai.to${epHref}`;
    const watchRes = await axios.get(watchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html',
        'Referer': 'https://animekai.to'
      },
      timeout: 10000
    });

    const $w = cheerio.load(watchRes.data);
    const iframe = $w('iframe').first().attr('src');

    if (!iframe) return res.status(404).json({ error: 'No embed found', watchUrl });

    const embedUrl = iframe.startsWith('http') ? iframe : `https:${iframe}`;
    res.json({ embedUrl, slug, episode: ep });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => console.log(`Running on ${PORT}`));
```

---

The key differences from before:
- **No `cloudscraper`** — removed completely
- **Pinned `cheerio` to `rc.10`** — the rc.12 version was breaking on Railway
- **Much simpler code** — less dependencies = less crash risk
- **Added `html_preview`** in error responses so we can debug if selectors fail

Replace both files on GitHub, wait for Railway to redeploy, then visit:
```
https://rk-scraper-production.up.railway.app/
