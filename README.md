# Sugar.mn — static blog for GitHub Pages

Plain HTML + vanilla JS, same approach as github.com/Narangarig/portfolio:

- **Markdown loaded dynamically:** posts in `posts/*.md` are fetched with `fetch()` and rendered with [marked.js](https://marked.js.org/) from a CDN.
- **Tailwind CSS** via the Play CDN (config block in each page's `<head>`, primary color `#3BA73D`).
- **No framework, no bundler.** `git push` is the deploy.

## File structure

```
index.html              Home: latest posts, masonry grid + "load more"
category/index.html     Category posts:   category/?slug=family
post/index.html         Single post:      post/?slug=<slug>  (+ 8 random posts below)
search/index.html       Search results:   search/?q=<text>
about/index.html        About page (static)
404.html
robots.txt              Crawler access (AI crawlers allowed) + sitemap pointer
sitemap.xml             All page + post URLs
llms.txt                Site summary for AI crawlers, links to every raw .md file
.nojekyll               Stops GitHub Pages from running Jekyll on the .md files
CNAME                   Custom domain (sugar.mn)
site.json               Site name/URL, social links, categories (single source)
partials/
  header.html           Header template (logo, search, social icons, categories menu)
  footer.html           Footer template
assets/
  main.js               All JS: loads partials + site.json, cards, masonry, load more, post render, search
  tailwind.config.js    Tailwind config (primary color), shared by every page
  style.css             Your custom CSS
  logo.svg, favicon.svg
posts/
  manifest.json         List of posts that every page reads
  *.md                  Posts
  images/               Post images
scripts/
  update-manifest.mjs   Regenerates manifest.json, sitemap.xml, llms.txt from posts/*.md
```

Every page has `<body data-page="..." data-root="./ or ../">`. `main.js` uses `data-page` to decide what to run, and `data-root` so all paths are relative. Because the paths are relative, the site also works under `username.github.io/repo/`.

**Header and footer are shared templates.** Every page has `<div data-include="header"></div>` and `<div data-include="footer"></div>`. `main.js` fetches `partials/header.html` / `partials/footer.html` and fills in the placeholders, so editing a partial changes every page.

- `{{root}}` = path to the site root, `{{facebook}}` `{{x}}` `{{youtube}}` = URLs from `site.json`, `{{year}}` = current year.
- The categories menu is built from `site.json` using the `<template>` inside `#category-menu` in `header.html` (placeholders `{{url}}`, `{{slug}}`, `{{name}}`).

**To change a social URL or a category, edit `site.json` only.**

The post card markup is the `cardHtml()` function in `assets/main.js`.

## Adding a new post

### 1. Create the markdown file

Create `posts/<slug>.md`. The file name must equal the `slug`, which becomes the URL `post/?slug=<slug>`.
Use Latin letters, numbers and `-` only (e.g. `posts/eruul-khoollolt.md`).

```markdown
---
id: 1700
title: "Нийтлэлийн гарчиг"
slug: "eruul-khoollolt"
author: "Baigalmaa"
categories: ["Зөвлөгөө", "Эрүүл мэнд"]
category_slugs: ["advice", "health"]
excerpt: ""
cover: "images/cover/eruul-khoollolt.jpg"
source: ""
status: 1
created_at: "2026-11-18 10:00:00"
updated_at: "2026-11-18 10:00:00"
---

# Нийтлэлийн гарчиг

![Нийтлэлийн гарчиг](images/cover/eruul-khoollolt.jpg)

Нийтлэлийн эхний догол мөр...

![](images/eruul-khoollolt-1.jpg)

Дараагийн догол мөр...
```

Front matter rules (the manifest script reads these lines with `JSON.parse`):

- **Keep every value JSON-style:** strings in double quotes (escape `"` inside as `\"`), lists like `["advice", "health"]`, numbers bare. One `key: value` per line.
- **`category_slugs` drives the categories.** Use slugs from the table below; the first one is shown on the post card. `categories` (names) is kept for reference only.
- **`created_at`** (`YYYY-MM-DD HH:mm:ss`, Ulaanbaatar time) sets the order: newest first on the home page.
- **`status: 1`** means published. Any other value hides the post.
- **`excerpt`** is optional. If empty, the first ~160 characters of the text are used for the meta description and search.
- **`source`** is optional (a URL or a name).
- **`cover`** is shown on the post card and at the top of the post. Put the same image right after the `# Title` line, as the existing posts do; the post page hides that duplicate.

| slug | name | slug | name |
|---|---|---|---|
| `photos` | Фото, Зураг | `family` | Гэр бүл |
| `design` | Загвар, Дизайн | `interesting` | Сонин хачин |
| `music` | Дуу хөгжим | `advice` | Зөвлөгөө |
| `movie` | Кино | `health` | Эрүүл мэнд |
| `culture` | Урлаг | `tech` | Технологи |
| `science` | Шинжлэх ухаан | `test` | Сонжоо |
| `kitchen` | Хоол | `history` | Түүх |
| `animals` | Амьтад | `interview` | Ярилцлага |

### 2. Add the images

- Cover image → `posts/images/cover/`
- Images inside the text → `posts/images/`

In the markdown, write the paths relative to `posts/`: `images/cover/x.jpg` and `images/x.jpg` (not `/posts/images/...`).

### 3. Update the manifest

```bash
node scripts/update-manifest.mjs
```

This rewrites `posts/manifest.json` (the post list every page reads), `sitemap.xml` and `llms.txt`.
**A new post doesn't appear on the site until this runs.**

### 4. Check locally, then publish

```bash
python3 -m http.server 8000      # open http://localhost:8000/post/?slug=<slug>
git add posts sitemap.xml llms.txt
git commit -m "Add post: <title>"
git push
```

GitHub Pages updates within a minute or two.

**Editing a post:** edit the `.md` file. If you changed the title, date, cover, categories or excerpt, run `node scripts/update-manifest.mjs` again. Changes to the body text alone don't need it.

**Removing a post:** delete the `.md` file (or set `status: 0`), then run the script.

### Adding a new category

Add `{ "slug": "...", "name": "..." }` to `categories` in `site.json`. The menu, category pages, post cards and `llms.txt` all read it.

## Preview locally

```bash
python3 -m http.server 8000   # open http://localhost:8000
```

Opening files directly from disk won't work, because browsers block `fetch()` on `file://`.

## Deploy

GitHub → Settings → Pages → Build and deployment → Source: **Deploy from a branch** → `main` / `(root)`.

If you don't use the `sugar.mn` domain, delete `CNAME` and change `url` in `site.json` and replace `https://sugar.mn` in the HTML `<head>`s and `robots.txt`.

## SEO note

Post content is rendered client-side, like in the portfolio repo. Google runs JavaScript and reads the title, meta and JSON-LD that `main.js` sets. Most AI crawlers don't run JavaScript, so `llms.txt` links straight to the raw `.md` files, which are plain text and readable without JS.
