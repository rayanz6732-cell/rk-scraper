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
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Connection': 'keep-alive'
};

async function searchAnimeKai(title) {
  try {
    const res = await axios.get(
      `${ANIMEKAI_BASE}/browser?keyword=${encodeURIComponent(title)}`,
      { headers: HEADERS, timeout: 15000 }
    );
    const $ = cheerio.load(res.data);
    let slug = null;

    const selectors = [
      'a.item', 'a.film-name', '.flw-item a',
      'a[href*="/watch"]', 'a.dynamic-name',
      '.film-detail a', '.anif-block-ul li a', 'a[href*="-"]'
    ];

    for (const selector of selectors) {
      const el = $(selector).first();
      if (el.length) {
        const href = el.attr('href');
        if (href && href !== '/') {
          slug = href.replace(/^\//, '').split('?')[0];
          console.log(`[S3] Slug "${slug}" via "${selector}"`);
          break;
        }
      }
    }

    if (!slug) {
      console.log('[S3] No slug found. Snippet:', res.data.substring(0, 1500));
    }

    return slug;
  } catch (err) {
    console.error('[S3] searchAnimeKai error:', err.message);
