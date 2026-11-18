#!/usr/bin/env node
// Regenerates posts/manifest.json (the list of posts the pages read),
// plus sitemap.xml and llms.txt — from the front matter of posts/*.md.
// Plain Node.js, no npm packages.
//
//   node scripts/update-manifest.mjs
//
// Run it after adding or editing a post, then commit and push.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SITE = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.json'), 'utf8')); // url, categories
const SITE_URL = SITE.url;
const POSTS = path.join(ROOT, 'posts');

const plain = (md) =>
  md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^#+\s.*$/gm, ' ')
    .replace(/[#>*_`~|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const truncate = (s, n = 160) => {
  if (s.length <= n) return s;
  const cut = s.lastIndexOf(' ', n);
  return s.slice(0, cut > 0 ? cut : n) + '…';
};

function frontMatter(raw) {
  const meta = {};
  const end = raw.indexOf('\n---', 3);
  for (const line of raw.slice(3, end).trim().split('\n')) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const v = line.slice(i + 1).trim();
    try { meta[line.slice(0, i).trim()] = JSON.parse(v); } catch { meta[line.slice(0, i).trim()] = v; }
  }
  return { meta, body: raw.slice(end + 4) };
}

const posts = fs
  .readdirSync(POSTS)
  .filter((f) => f.endsWith('.md'))
  .map((file) => {
    const { meta, body } = frontMatter(fs.readFileSync(path.join(POSTS, file), 'utf8'));
    if (meta.status !== undefined && Number(meta.status) !== 1) return null;
    return {
      slug: meta.slug || file.replace(/\.md$/, ''),
      file: `posts/${file}`,
      title: String(meta.title || '').trim(),
      date: meta.created_at, // "2019-07-16 20:22:45"
      updated: meta.updated_at || meta.created_at,
      author: meta.author || '',
      categories: meta.category_slugs || [],
      cover: meta.cover ? `posts/${meta.cover}` : '',
      excerpt: truncate(plain(meta.excerpt || '') || plain(body)),
    };
  })
  .filter(Boolean)
  .sort((a, b) => (a.date < b.date ? 1 : -1));

fs.writeFileSync(path.join(POSTS, 'manifest.json'), JSON.stringify(posts, null, 0).replace(/\},\{/g, '},\n{'));

// sitemap.xml
const iso = (s) => new Date(String(s).replace(' ', 'T') + '+08:00').toISOString();
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const cats = [...new Set(posts.flatMap((p) => p.categories))];
const urls = [
  `<url><loc>${SITE_URL}/</loc><lastmod>${iso(posts[0].updated)}</lastmod></url>`,
  ...cats.map((c) => `<url><loc>${SITE_URL}/category/?slug=${c}</loc></url>`),
  ...posts.map((p) => `<url><loc>${esc(`${SITE_URL}/post/?slug=${encodeURIComponent(p.slug)}`)}</loc><lastmod>${iso(p.updated)}</lastmod></url>`),
  `<url><loc>${SITE_URL}/about/</loc></url>`,
];
fs.writeFileSync(
  path.join(ROOT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
);

// llms.txt — https://llmstxt.org. Links to the raw .md files: full text, readable without JavaScript.
fs.writeFileSync(
  path.join(ROOT, 'llms.txt'),
  [
    '# Sugar.mn',
    '',
    '> Монгол хэл дээрх блог/мэдээний сайт: сонин хачин, зөвлөгөө, гэр бүл, эрүүл мэнд, шинжлэх ухаан, түүх болон бусад сонирхолтой нийтлэлүүд.',
    '',
    `Нийтлэлүүдийн жагсаалт (JSON): ${SITE_URL}/posts/manifest.json. Нийтлэл бүр markdown файл хэлбэрээр доорх холбоосоор нээлттэй.`,
    '',
    '## Ангилал',
    '',
    ...SITE.categories
      .filter((c) => posts.some((p) => p.categories.includes(c.slug)))
      .map((c) => `- [${c.name}](${SITE_URL}/category/?slug=${c.slug})`),
    '',
    '## Хуудсууд',
    '',
    `- [Нүүр](${SITE_URL}/)`,
    `- [Бидний тухай](${SITE_URL}/about/)`,
    '',
    '## Нийтлэлүүд',
    '',
    ...posts.map((p) => `- [${p.title}](${SITE_URL}/${p.file}): ${p.excerpt}`),
    '',
  ].join('\n'),
);

console.log(`manifest.json: ${posts.length} posts · sitemap.xml · llms.txt updated`);
