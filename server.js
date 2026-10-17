import express from 'express';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'node:url';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '64kb' }));
app.use((req, res, next) => {
  if (/^\/(?:server\.js|package(?:-lock)?\.json|README\.txt|\.gitignore|\.env(?:\..*)?)$/i.test(req.path)) return res.status(404).end();
  next();
});
app.use(express.static(__dirname, { dotfiles: 'deny', index: 'index.html', setHeaders(res, filePath) { if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); } }));
app.get('/api/health', (_req, res) => res.json({ ok: true, storeFinder: 'official-asian-paints-locators', openAIConfigured: false }));

// Retrieve publicly displayed store cards from Asian Paints' own locator pages.
// Only listings with a source-provided distance <= 20 km are returned; no guessed stores.
app.get('/api/stores', async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return res.status(400).json({ error: 'A valid current location is required to search within 20 km.' });
  }
  const sources = [
    'https://colourideas-dealers-nearme.asianpaints.com/',
    'https://colourcube-dealers-nearme.asianpaints.com/'
  ];
  try {
    const pages = await Promise.all(sources.map(async base => {
      const url = `${base}?lat=${encodeURIComponent(lat)}&long=${encodeURIComponent(lon)}`;
      const response = await fetch(url, { headers: { 'User-Agent': 'ShadeFlowStoreFinder/1.0' }, signal: AbortSignal.timeout(10000) });
      if (!response.ok) return [];
      const html = await response.text();
      const $ = cheerio.load(html);
      const found = [];
      $('a').each((_i, el) => {
        const name = $(el).text().replace(/\s+/g, ' ').trim();
        if (!/^Asian Paints (Colourideas|Colour Cube)\s*[-–]/i.test(name)) return;
        let node = $(el);
        let cardText = '';
        let card = null;
        for (let depth = 0; depth < 7 && node.length; depth++, node = node.parent()) {
          const text = node.text().replace(/\s+/g, ' ').trim();
          if (/\b\d+(?:\.\d+)?\s*KM\s+from\s+your\s+location\b/i.test(text) && /\+?\d[\d\s()-]{7,}/.test(text)) {
            cardText = text; card = node; break;
          }
        }
        if (!card || !cardText) return;
        const dm = cardText.match(/(\d+(?:\.\d+)?)\s*KM\s+from\s+your\s+location/i);
        if (!dm || Number(dm[1]) > 20) return;
        const phoneMatch = cardText.match(/(?:\+91\s*)?\+?\d[\d\s()-]{8,}\d/);
        const phone = phoneMatch ? phoneMatch[0].replace(/[^+\d]/g, '') : '';
        const anchors = card.find('a').toArray().map(a => ({ text: $(a).text().replace(/\s+/g, ' ').trim(), href: $(a).attr('href') || '' }));
        const mapLink = anchors.find(a => /map|direction/i.test(a.text) && /^https?:/i.test(a.href));
        const websiteLink = anchors.find(a => /website/i.test(a.text) && /^https?:/i.test(a.href));
        let address = cardText.replace(name, '').replace(/\d+(?:\.\d+)?\s*KM\s+from\s+your\s+location/i, '').replace(phoneMatch?.[0] || '', '').replace(/\b(?:Call|Map|Website|Get In Touch)\b/gi, '').replace(/\s+/g, ' ').trim();
        found.push({ name, address: address.slice(0, 260), phone, distanceKm: Number(dm[1]), website: websiteLink?.href || '', mapUrl: mapLink?.href || '', source: base });
      });
      return found;
    }));
    const unique = new Map();
    for (const store of pages.flat()) {
      const key = `${store.name}|${store.address}`.toLowerCase();
      if (!unique.has(key) || store.distanceKm < unique.get(key).distanceKm) unique.set(key, store);
    }
    const stores = [...unique.values()].sort((a, b) => a.distanceKm - b.distanceKm);
    res.set('Cache-Control', 'public, max-age=300');
    return res.json({ stores, radiusKm: 20, count: stores.length, source: 'Asian Paints official locator pages' });
  } catch (error) {
    return res.status(502).json({ error: 'Could not retrieve live dealer listings from the official store locator. Please try again shortly.' });
  }
});
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API route not found.' });
  res.sendFile(path.join(__dirname, 'index.html'), err => { if (err) next(err); });
});
app.listen(port, '0.0.0.0', () => console.log(`ShadeFlow is running locally on port ${port}`));
