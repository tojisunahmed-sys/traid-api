import * as cheerio from 'cheerio';

export const SITE = 'https://traidmodz.org';
const APK_REGEX = /https?:\/\/s\d+\.tmdownload\.com\/[^"'<> \n\r]+\.apk/i;

// ---------- cache بسيط في الذاكرة ----------
const cache = new Map();
const TTL = 10 * 60 * 1000; // 10 دقايق

const cached = async (key, fn) => {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  const v = await fn();
  cache.set(key, { t: Date.now(), v });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return v;
};

// ---------- حماية: بس روابط الموقع ----------
export const isValidAppUrl = (u) => {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && ['traidmodz.org', 'www.traidmodz.org'].includes(x.hostname);
  } catch {
    return false;
  }
};

// ---------- fetch ----------
const get = async (url, ms = 30000) => {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: c.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
        Referer: SITE,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
};

// ---------- استخراج رابط التحميل المباشر ----------
const extractUrl = (value) => {
  if (!value) return null;
  let decoded = value;
  try { decoded = decodeURIComponent(value); } catch {}

  try {
    const parsed = new URL(decoded);
    if (parsed.searchParams.has('urls')) {
      let direct = parsed.searchParams.get('urls');
      if (direct) {
        try { direct = decodeURIComponent(direct); } catch {}
        const m = direct.match(APK_REGEX);
        if (m) return m[0];
      }
    }
  } catch {}

  const m = decoded.match(APK_REGEX);
  return m ? m[0] : null;
};

const findDownloadUrl = ($, html) => {
  const values = [];
  $('a[href]').each((_, el) => values.push($(el).attr('href')));
  $('[data-url]').each((_, el) => values.push($(el).attr('data-url')));
  $('[data-download-url]').each((_, el) => values.push($(el).attr('data-download-url')));
  $('script').each((_, el) => values.push($(el).html() || ''));

  for (const v of values) {
    const d = extractUrl(v);
    if (d) return d;
  }

  let decodedHtml = html;
  try { decodedHtml = decodeURIComponent(html); } catch {}
  const m = decodedHtml.match(APK_REGEX);
  return m ? m[0] : null;
};

// ---------- معلومات التطبيق ----------
const parseInfo = ($) => {
  const info = {
    title: $('h1.title').text().trim() || 'غير معروف',
    genre: $('.specs-list li a').first().text().trim() || 'تطبيق',
    version: 'غير محدد',
    size: 'غير محدد',
    updated: 'غير محدد',
    requirements: 'غير محدد',
    popularity: 'غير محدد',
    playStore: false,
  };

  $('.specs-list li.specs-item').each((_, el) => {
    const label = $(el).find('.spec-label').text().trim();
    const value = $(el).find('.spec-cont').text().trim();
    if (label.includes('النسخة')) info.version = value;
    if (label.includes('الحجم')) info.size = value;
    if (label.includes('تحديث')) info.updated = value;
    if (label.includes('المتطلبات')) info.requirements = value;
  });

  const rawPop = $('.popularity .rating_progress_bar b').clone().children().remove().end().text().trim();
  const popVal = $('.popularity .rating_progress_bar b b').text().trim() || rawPop.replace('الشعبية', '').trim();
  if (popVal) info.popularity = `${popVal.replace(/[%]/g, '')}%`;

  info.playStore = $('.specs-list a[href*="play.google.com"]').length > 0;
  return info;
};

// ---------- الدوال العامة ----------

/** بحث في الموقع */
export const searchTraid = (query) =>
  cached(`search:${query.toLowerCase()}`, async () => {
    const html = await get(`${SITE}/?s=${encodeURIComponent(query)}`);
    const $ = cheerio.load(html);
    const results = [];

    $('.entry.entry-app').each((_, el) => {
      const link = $(el).find('h2.title a.item-link').attr('href') || '';
      const title = $(el).find('h2.title a.item-link').text().trim();
      const image = $(el).find('figure.img img').attr('src') || '';
      const genre = $(el).find('.genre').text().trim();

      if (link && title && !results.some((x) => x.link === link)) {
        results.push({ title: title.slice(0, 70), link, image, genre });
      }
    });

    return results;
  });

/** معلومات + رابط تحميل من نفس الطلب (صفحة واحدة بس) */
export const getAppDetails = (appUrl) =>
  cached(`app:${appUrl}`, async () => {
    const html = await get(appUrl);
    const $ = cheerio.load(html);
    return {
      ...parseInfo($),
      downloadUrl: findDownloadUrl($, html),
      link: appUrl,
    };
  });

/** تشغيل مهام بالتوازي مع حد أقصى */
export const mapLimit = async (items, limit, fn) => {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = await fn(items[idx], idx);
      } catch (e) {
        out[idx] = { error: e.message };
      }
    }
  });
  await Promise.all(workers);
  return out;
};
