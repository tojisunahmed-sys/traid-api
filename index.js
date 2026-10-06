import express from 'express';
import { searchTraid, getAppDetails, isValidAppUrl, mapLimit } from './scraper.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.set('json spaces', 2);

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    console.error(`[${req.path}]`, e.message);
    res.status(502).json({ ok: false, error: e.message });
  }
};

const bad = (res, msg) => res.status(400).json({ ok: false, error: msg });

// الصفحة الرئيسية / توثيق سريع
app.get('/', (_req, res) => {
  res.json({
    ok: true,
    name: 'Traid Mod API',
    endpoints: {
      search: '/api/search?q=Spotify',
      app: '/api/app?url=<رابط التطبيق>',
      download: '/api/download?url=<رابط التطبيق>',
      full: '/api/full?q=Spotify&limit=5',
    },
  });
});

// 1) بحث
app.get('/api/search', wrap(async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return bad(res, 'q مطلوب');
  const results = await searchTraid(q);
  res.json({ ok: true, query: q, count: results.length, results });
}));

// 2) معلومات تطبيق
app.get('/api/app', wrap(async (req, res) => {
  const url = (req.query.url || '').toString();
  if (!isValidAppUrl(url)) return bad(res, 'url غير صالح (لازم يكون من traidmodz.org)');
  const { downloadUrl, ...info } = await getAppDetails(url);
  res.json({ ok: true, ...info });
}));

// 3) رابط التحميل المباشر
app.get('/api/download', wrap(async (req, res) => {
  const url = (req.query.url || '').toString();
  if (!isValidAppUrl(url)) return bad(res, 'url غير صالح (لازم يكون من traidmodz.org)');
  const { downloadUrl } = await getAppDetails(url);
  if (!downloadUrl) return res.status(404).json({ ok: false, error: 'مفيش رابط تحميل مباشر' });
  res.json({ ok: true, url, downloadUrl });
}));

// 4) بحث + معلومات + تحميل (زي الكاروسيل في البوت)
app.get('/api/full', wrap(async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return bad(res, 'q مطلوب');

  const limit = Math.min(Math.max(parseInt(req.query.limit) || 5, 1), 20);
  const results = await searchTraid(q);

  const items = await mapLimit(results.slice(0, limit), 4, async (item) => {
    const d = await getAppDetails(item.link);
    return { ...item, ...d, title: d.title || item.title, genre: d.genre || item.genre };
  });

  res.json({ ok: true, query: q, total: results.length, count: items.length, results: items });
}));

app.use((_req, res) => res.status(404).json({ ok: false, error: 'Not found' }));

app.listen(PORT, () => console.log(`Traid API running on http://localhost:${PORT}`));
