import express from 'express';
import { searchTraid, getAppDetails, uploadToImgbb, mapLimit } from './scraper.js';

const app = express();
const PORT = process.env.PORT || 3000;
const CONCURRENCY = 4;

app.disable('x-powered-by');
app.set('json spaces', 2);

app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

app.get(['/', '/api'], async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) {
    return res.status(400).json({ ok: false, error: 'q مطلوب', example: '/api?q=Spotify' });
  }

  try {
    const results = await searchTraid(q);

    const items = await mapLimit(results, CONCURRENCY, async (item) => {
      const [d, image] = await Promise.all([
        getAppDetails(item.link),
        uploadToImgbb(item.image),
      ]);
      return {
        title: d.title || item.title,
        image,
        genre: d.genre || item.genre,
        version: d.version,
        size: d.size,
        updated: d.updated,
        requirements: d.requirements,
        popularity: d.popularity,
        playStore: d.playStore ? 'فتح' : 'غلق',
        link: item.link,
        downloadUrl: d.downloadUrl || null,
      };
    });

    res.json({ ok: true, query: q, total: results.length, count: items.length, results: items });
  } catch (e) {
    console.error('[api]', e.message);
    res.status(502).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, () => console.log(`Traid API running on http://localhost:${PORT}/api?q=Spotify`));
