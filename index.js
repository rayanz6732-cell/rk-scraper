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
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Cache-Control': 'max-age=0'
};

async function searchAnimeKai(title) {
  try {
    const res = await axios.get(`${ANIMEKAI_BASE}/browser?keyword=${encodeURIComponent(title)}`, {
      headers: HEADERS,
      timeout: 10000
    });
    const $ = cheerio.load(res.data);

    let slug = null;
    const selectors = [
      'a.item', 'a.film-name', '.flw-item a',
      'a[href*="/watch"]', 'a.dynamic-name', '.film-detail a',
      '.anif-block-ul li a', 'a[href*="-"]'
    ];

    for (const selector of selectors) {
      const el = $(selector).first();
      if (el.length) {
        const href = el.attr('href');
        if (href && href !== '/') {
          slug = href.replace(/^\//, '').split('?')[0];
          console.log(`[S3] Found slug "${slug}" via selector "${selector}"`);
          break;
        }
      }
    }

    if (!slug) {
      console.log('[S3] No slug found. Page snippet:', res.data.substring(0, 1500));
    }

    return slug;
  } catch (err) {
    console.error('[S3] searchAnimeKai error:', err.message);
    return null;
  }
}

async function getEpisodes(slug) {
  try {
    const res = await axios.get(`${ANIMEKAI_BASE}/${slug}`, {
      headers: HEADERS,
      timeout: 10000
    });
    const $ = cheerio.load(res.data);
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
