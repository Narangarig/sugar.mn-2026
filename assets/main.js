// Sugar.mn — vanilla JS. Everything post-related is loaded at runtime:
// posts/manifest.json (list of posts) and posts/*.md (rendered with marked.js).
//
// Each page's <body> has:
//   data-page="home|category|post|search|..."  -> which part of this file runs
//   data-root="./" or "../"                    -> path back to the site root
//
// Sections:
//   1. helpers + card markup
//   2. masonry grid
//   3. post list with "load more" (home, category)
//   4. single post (post/?slug=<slug>) + 8 random posts
//   5. search (search/?q=<text>)
//   6. header/footer: partials/*.html + site.json (categories, socials)
//   7. init

(function () {
  'use strict';

  const ROOT = document.body.dataset.root || './';
  const PAGE = document.body.dataset.page;
  const PER_PAGE = 35; // posts per "load more" (7 rows × 5 columns)
  const params = new URLSearchParams(location.search);

  // Filled from site.json in init()
  let SITE_NAME = 'Sugar.mn';
  let SITE_URL = 'https://sugar.mn';
  let CATEGORIES = {}; // slug -> name

  // ---------- 1. helpers ----------

  const $ = (sel) => document.querySelector(sel);

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // "2019-07-16 20:22:45" -> "2019.07.16"
  const fmtDate = (s) => String(s).slice(0, 10).replaceAll('-', '.');
  const isoDate = (s) => new Date(String(s).replace(' ', 'T') + '+08:00').toISOString();

  const postUrl = (slug) => `${ROOT}post/?slug=${encodeURIComponent(slug)}`;
  const categoryUrl = (slug) => `${ROOT}category/?slug=${encodeURIComponent(slug)}`;

  let manifestPromise;
  const getManifest = () =>
    (manifestPromise ||= fetch(`${ROOT}posts/manifest.json`).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return r.json();
    }));

  const errorHtml = (err) =>
    `<p class="text-red-600">Ачаалж чадсангүй (${esc(err.message)}). Хэрэв файлыг дискнээс шууд нээсэн бол сервер ашиглана уу (README-г үзнэ үү).</p>`;

  // Post card markup — edit classes here.
  // All categories are shown as links, so the image and the title link to the post separately
  // (a link can't contain other links).
  function cardHtml(p) {
    const url = postUrl(p.slug);
    const cats = p.categories
      .filter((c) => CATEGORIES[c])
      .map((c) => `<a href="${categoryUrl(c)}" class="hover:underline">${esc(CATEGORIES[c])}</a>`)
      .join('');
    return `
      <article class="group mb-4 border border-gray-200 rounded overflow-hidden bg-white">
        ${p.cover ? `<a href="${url}" tabindex="-1" aria-hidden="true" class="block overflow-hidden"><img src="${ROOT}${esc(p.cover)}" alt="" loading="lazy" decoding="async" class="w-full h-auto transition-transform duration-300 ease-out group-hover:scale-105"></a>` : ''}
        <div class="p-3">
          ${cats ? `<div class="flex flex-wrap gap-x-2 gap-y-1 text-xs text-primary">${cats}</div>` : ''}
          <h2 class="font-semibold leading-snug"><a href="${url}">${esc(p.title)}</a></h2>
          <time datetime="${isoDate(p.date)}" class="text-xs text-gray-500">${fmtDate(p.date)}</time>
        </div>
      </article>`;
  }

  // n random items without repeats (partial Fisher–Yates shuffle on a copy)
  function randomPick(list, n) {
    const a = list.slice();
    const count = Math.min(n, a.length);
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(Math.random() * (a.length - i));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, count);
  }

  function makeCards(posts) {
    const box = document.createElement('div');
    box.innerHTML = posts.map(cardHtml).join('');
    return [...box.children];
  }

  // Resolves when every image in the elements has loaded (or failed), max `timeout` ms
  function imagesReady(elements, timeout = 6000) {
    const imgs = elements.flatMap((el) => [...el.querySelectorAll('img')]);
    imgs.forEach((img) => (img.loading = 'eager')); // start downloading now
    const all = imgs.map((img) => (img.complete ? null : new Promise((r) => (img.onload = img.onerror = r))));
    return Promise.race([Promise.all(all), new Promise((r) => setTimeout(r, timeout))]);
  }

  // ---------- 2. masonry ----------
  // N flex columns; each card goes into the shortest one, so cards added by
  // "load more" never move the cards already on screen.

  const BREAKPOINTS = [[1280, 5], [1024, 4], [768, 3], [640, 2], [0, 1]]; // [min-width px, columns]
  const columnCount = () => BREAKPOINTS.find(([w]) => window.innerWidth >= w)[1];

  function masonry(el) {
    const grid = { items: [], cols: [], count: 0 };
    // layout styles are inline so they don't depend on the Tailwind CDN generating classes in time
    Object.assign(el.style, { display: 'flex', gap: '1rem', alignItems: 'flex-start' });

    grid.layout = (force = false) => {
      const n = columnCount();
      if (n === grid.count && !force) return;
      grid.count = n;
      el.innerHTML = '';
      grid.cols = Array.from({ length: n }, () => {
        const col = document.createElement('div');
        Object.assign(col.style, { flex: '1 1 0%', minWidth: '0' });
        el.appendChild(col);
        return col;
      });
      place(grid.items);
    };

    const place = (items) =>
      items.forEach((item) => grid.cols.reduce((a, b) => (b.offsetHeight < a.offsetHeight ? b : a)).appendChild(item));

    grid.append = (items) => {
      grid.items.push(...items);
      place(items);
    };

    grid.layout();
    let t;
    window.addEventListener('resize', () => {
      clearTimeout(t);
      t = setTimeout(() => grid.layout(), 150);
    });
    return grid;
  }

  // ---------- 3. post list + load more ----------
  // Markup expected in the page:
  //   <div data-post-grid></div>
  //   <button data-load-more> <svg data-spinner class="hidden ..."> <span data-label>…</span> </button>
  //   <div data-list-status></div>

  async function postList(filterFn) {
    const gridEl = $('[data-post-grid]');
    const btn = $('[data-load-more]');
    const status = $('[data-list-status]');
    const spinner = btn.querySelector('[data-spinner]');
    const label = btn.querySelector('[data-label]');
    const labelText = label.textContent;
    const grid = masonry(gridEl);

    btn.hidden = true;
    status.innerHTML = '<p class="text-gray-500">Уншиж байна…</p>';

    let posts;
    try {
      posts = (await getManifest()).filter(filterFn);
    } catch (err) {
      status.innerHTML = errorHtml(err);
      return;
    }
    status.innerHTML = posts.length ? '' : '<p class="text-gray-500">Энэ ангилалд нийтлэл алга байна.</p>';

    let shown = 0;
    const showNext = async () => {
      const cards = makeCards(posts.slice(shown, shown + PER_PAGE));
      shown += PER_PAGE;
      if (shown > PER_PAGE) await imagesReady(cards); // after a click: wait for images, then show
      grid.append(cards);
      btn.hidden = shown >= posts.length;
    };

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      spinner.classList.remove('hidden');
      label.textContent = 'Уншиж байна…';
      await showNext();
      spinner.classList.add('hidden');
      label.textContent = labelText;
      btn.disabled = false;
    });

    await showNext();
  }

  // ---------- 4. single post ----------

  async function viewPost() {
    const slug = params.get('slug');
    const target = $('#post-content');
    try {
      const manifest = await getManifest();
      const post = manifest.find((p) => p.slug === slug);
      if (!post) {
        target.innerHTML = '<h1 class="text-2xl font-bold">Нийтлэл олдсонгүй</h1>';
        document.title = `Нийтлэл олдсонгүй | ${SITE_NAME}`;
        setMeta('robots', 'noindex');
        return;
      }

      setPostMeta(post);

      const res = await fetch(ROOT + post.file);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      let md = await res.text();

      // strip front matter, the leading "# Title" and the cover image (shown separately below)
      md = md.replace(/^---[\s\S]*?\n---\s*/, '').replace(/^\s*#\s+.*\n/, '');
      const cover = post.cover.replace(/^posts\//, '');
      if (cover) md = md.replace(new RegExp(`^\\s*!\\[[^\\]]*\\]\\(${cover.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)\\s*\\n`), '');
      // image paths in the .md files are relative to posts/
      md = md.replace(/\]\(images\//g, `](${ROOT}posts/images/`).replace(/src="images\//g, `src="${ROOT}posts/images/`);

      const cats = post.categories.filter((c) => CATEGORIES[c]);
      target.innerHTML = `
        <header class="not-prose mb-4">
          <nav aria-label="Ангилал" class="flex flex-wrap gap-2 text-sm text-primary">
            ${cats.map((c) => `<a href="${categoryUrl(c)}">${esc(CATEGORIES[c])}</a>`).join('')}
          </nav>
          <h1 class="text-2xl md:text-3xl font-bold my-2">${esc(post.title)}</h1>
          <p class="text-sm text-gray-500">
            <time datetime="${isoDate(post.date)}">${fmtDate(post.date)}</time>
            ${post.author ? ` · <span>${esc(post.author)}</span>` : ''}
          </p>
          <div class="mt-3" data-share-slot></div>
        </header>
        ${post.cover ? `<img src="${ROOT}${esc(post.cover)}" alt="${esc(post.title)}" class="w-full h-auto">` : ''}
        ${marked.parse(md)}
        <div class="mt-8 pt-4 border-t border-gray-200" data-share-slot></div>`;
      shareButtons(post);
      target.querySelectorAll('img').forEach((img, i) => {
        if (i > 0) img.loading = 'lazy';
      });

      // 8 random posts under the article (different on every page load)
      const others = randomPick(manifest.filter((p) => p.slug !== slug), 8);
      $('[data-random-grid]').innerHTML = others.map(cardHtml).join('');
    } catch (err) {
      target.innerHTML = errorHtml(err);
    }
  }

  // Share buttons from <template id="share-template"> (post/index.html) into every [data-share-slot]
  function shareButtons(post) {
    const tpl = $('#share-template');
    if (!tpl) return;
    const url = `${SITE_URL}/post/?slug=${encodeURIComponent(post.slug)}`;
    const html = tpl.innerHTML
      .replaceAll('{{url}}', encodeURIComponent(url))
      .replaceAll('{{title}}', encodeURIComponent(post.title));

    document.querySelectorAll('[data-share-slot]').forEach((slot) => {
      slot.innerHTML = html;

      const copyBtn = slot.querySelector('[data-share-copy]');
      const copyLabel = slot.querySelector('[data-share-copy-label]');
      copyBtn?.addEventListener('click', async () => {
        const original = copyLabel.textContent;
        try {
          await navigator.clipboard.writeText(url);
          copyLabel.textContent = 'Хуулагдлаа!';
        } catch {
          prompt('Холбоосыг хуулна уу:', url); // clipboard blocked (e.g. not https)
        }
        setTimeout(() => (copyLabel.textContent = original), 2000);
      });

      const nativeBtn = slot.querySelector('[data-share-native]');
      if (nativeBtn && navigator.share) {
        nativeBtn.hidden = false;
        nativeBtn.addEventListener('click', () =>
          navigator.share({ title: post.title, text: post.excerpt, url }).catch(() => {}),
        );
      }
    });
  }

  // Title, description, canonical, Open Graph and JSON-LD for the current post
  function setMeta(name, content, attr = 'name') {
    let m = document.head.querySelector(`meta[${attr}="${name}"]`);
    if (!m) {
      m = document.createElement('meta');
      m.setAttribute(attr, name);
      document.head.appendChild(m);
    }
    m.setAttribute('content', content);
  }

  function setPostMeta(post) {
    const url = `${SITE_URL}/post/?slug=${encodeURIComponent(post.slug)}`;
    const image = post.cover ? `${SITE_URL}/${post.cover}` : `${SITE_URL}/assets/og-image.jpg`;
    document.title = `${post.title} | ${SITE_NAME}`;
    setMeta('description', post.excerpt);
    setMeta('og:type', 'article', 'property');
    setMeta('og:title', post.title, 'property');
    setMeta('og:description', post.excerpt, 'property');
    setMeta('og:url', url, 'property');
    setMeta('og:image', image, 'property');
    setMeta('og:image:alt', post.title, 'property');
    if (post.cover) {
      // the cover's real size is unknown, so drop the 1200×630 size/type tags meant for the default image
      document.head.querySelectorAll('meta[property="og:image:width"], meta[property="og:image:height"], meta[property="og:image:type"]').forEach((m) => m.remove());
    }
    setMeta('twitter:title', post.title);
    setMeta('twitter:description', post.excerpt);
    setMeta('twitter:image', image);
    setMeta('article:published_time', isoDate(post.date), 'property');
    $('link[rel="canonical"]')?.setAttribute('href', url);

    const ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.excerpt,
      image: [image],
      datePublished: isoDate(post.date),
      dateModified: isoDate(post.updated),
      author: post.author ? { '@type': 'Person', name: post.author } : { '@type': 'Organization', name: SITE_NAME },
      publisher: { '@type': 'Organization', name: SITE_NAME, logo: { '@type': 'ImageObject', url: `${SITE_URL}/assets/logo.svg` } },
      mainEntityOfPage: url,
      articleSection: post.categories.map((c) => CATEGORIES[c]).filter(Boolean),
      inLanguage: 'mn',
    });
    document.head.appendChild(ld);

    const md = document.createElement('link');
    md.rel = 'alternate';
    md.type = 'text/markdown';
    md.href = ROOT + post.file;
    document.head.appendChild(md);
  }

  // ---------- 5. search ----------

  async function search() {
    const q = (params.get('q') || '').trim();
    const status = $('[data-search-status]');
    const spinner = $('[data-search-spinner]');
    $('[data-query]').textContent = q;
    if (!q) return (status.textContent = 'Хайх үгээ оруулна уу.');

    spinner.classList.remove('hidden');
    try {
      const terms = q.toLowerCase().split(/\s+/);
      const found = (await getManifest()).filter((p) => {
        const text = `${p.title} ${p.excerpt}`.toLowerCase();
        return terms.every((t) => text.includes(t));
      });
      status.textContent = `${found.length} нийтлэл олдлоо.`;
      masonry($('[data-post-grid]')).append(makeCards(found.slice(0, 60)));
    } catch (err) {
      status.innerHTML = errorHtml(err);
    } finally {
      spinner.classList.add('hidden');
    }
  }

  // ---------- 6. header / footer ----------
  // <div data-include="header|footer"> is replaced with partials/<name>.html.
  // {{key}} placeholders are filled from `data` (values are HTML-escaped).

  // Unknown keys are left as-is (so the category <template> keeps its own placeholders).
  const fill = (tpl, data) => tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in data ? esc(data[k]) : m));

  async function loadPartial(name, mustContain) {
    const url = `${ROOT}partials/${name}.html`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    const html = await res.text();
    // Some dev servers answer missing files with index.html (status 200) — detect that.
    if (!html.includes(mustContain)) {
      console.error(`Unexpected content for ${url}`, { requested: new URL(url, location.href).href, received: res.url, status: res.status, contentType: res.headers.get('content-type'), start: html.slice(0, 300) });
      throw new Error(`${res.url || url} буруу агуулгатай ирлээ: "${html.replace(/\s+/g, ' ').slice(0, 120)}…"`);
    }
    return html;
  }

  function renderHeader(el, html, site) {
    el.outerHTML = fill(html, { root: ROOT, ...site.socials });

    // categories menu from site.json, using the <template> inside #category-menu
    const menu = $('#category-menu');
    const tpl = menu?.querySelector('template');
    if (!tpl) return console.error('partials/header.html: #category-menu <template> not found');
    const itemTpl = tpl.innerHTML;
    menu.innerHTML = site.categories
      .map((c) => fill(itemTpl, { url: categoryUrl(c.slug), slug: c.slug, name: c.name }))
      .join('');

    const currentCat = PAGE === 'category' ? params.get('slug') : null;
    menu.querySelectorAll('a[data-cat]').forEach((a) => {
      if (a.dataset.cat === currentCat) a.setAttribute('aria-current', 'page');
    });

    // mobile dropdown
    const btn = $('[data-menu-toggle]');
    if (!btn) return;
    if (CATEGORIES[currentCat]) btn.querySelector('[data-menu-label]').textContent = CATEGORIES[currentCat];
    const setOpen = (open) => {
      btn.setAttribute('aria-expanded', String(open));
      menu.classList.toggle('hidden', !open); // md:flex keeps it visible on desktop either way
      btn.querySelector('[data-menu-icon-open]').classList.toggle('hidden', open);
      btn.querySelector('[data-menu-icon-close]').classList.toggle('hidden', !open);
    };
    btn.addEventListener('click', () => setOpen(btn.getAttribute('aria-expanded') !== 'true'));
    document.addEventListener('keydown', (e) => e.key === 'Escape' && setOpen(false));
    document.addEventListener('click', (e) => !e.target.closest('nav.site-nav') && setOpen(false));

    // search box prefill
    const q = $('#q');
    if (q) q.value = params.get('q') || '';
  }

  // ---------- 7. init ----------

  async function init() {
    const headerEl = $('[data-include="header"]');
    const footerEl = $('[data-include="footer"]');
    const [site, header, footer] = await Promise.allSettled([
      fetch(`${ROOT}site.json`).then((r) => {
        if (!r.ok) throw new Error(`${ROOT}site.json: ${r.status}`);
        return r.json();
      }),
      headerEl ? loadPartial('header', 'id="category-menu"') : null,
      footerEl ? loadPartial('footer', '<footer') : null,
    ]);

    if (site.status === 'rejected') {
      const main = $('main');
      if (main) main.innerHTML = errorHtml(site.reason);
      return;
    }
    SITE_NAME = site.value.name;
    SITE_URL = site.value.url;
    CATEGORIES = Object.fromEntries(site.value.categories.map((c) => [c.slug, c.name]));

    // A broken header/footer is logged but never stops the page content from loading.
    try {
      if (header.status === 'rejected') throw header.reason;
      if (headerEl) renderHeader(headerEl, header.value, site.value);
    } catch (err) {
      console.error('Header:', err);
      if (headerEl) headerEl.innerHTML = errorHtml(err);
    }
    try {
      if (footer.status === 'rejected') throw footer.reason;
      if (footerEl) footerEl.outerHTML = fill(footer.value, { root: ROOT, year: new Date().getFullYear() });
    } catch (err) {
      console.error('Footer:', err);
    }

    if (PAGE === 'home') postList(() => true);

    if (PAGE === 'category') {
      const slug = params.get('slug');
      const name = CATEGORIES[slug];
      $('#category-title').textContent = name || 'Ангилал олдсонгүй';
      if (name) {
        document.title = `${name} | ${SITE_NAME}`;
        setMeta('description', `${name} ангиллын нийтлэлүүд — ${SITE_NAME}`);
        $('link[rel="canonical"]')?.setAttribute('href', `${SITE_URL}/category/?slug=${slug}`);
        postList((p) => p.categories.includes(slug));
      } else {
        $('[data-load-more]').hidden = true;
      }
    }

    if (PAGE === 'post') viewPost();
    if (PAGE === 'search') search();
  }

  init();
})();
