# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Sugar.mn: a Mongolian-language blog/news site (1,229 posts) hosted on GitHub Pages (custom domain `sugar.mn` via `CNAME`). It follows the pattern of github.com/Narangarig/portfolio:

- Plain HTML pages, vanilla JS, Tailwind via the Play CDN, marked.js from cdnjs.
- **No framework, no bundler, no npm.** The user explicitly rejected Astro and a generator that wrote one HTML file per post. Post content must stay dynamically loaded: `fetch()` the `.md` file, then render it with marked in the browser. Don't reintroduce per-post HTML generation or a build step.
- The user styles things by hand, so keep markup a skeleton: Tailwind utility classes, minimal custom CSS.

## Commands

```bash
node scripts/update-manifest.mjs   # after adding/editing posts: rewrites posts/manifest.json, sitemap.xml, llms.txt
python3 -m http.server 8000        # local preview (fetch() fails on file://)
node --check assets/main.js        # quick syntax check (there are no tests or linter)
```

Deploy is `git push` to `main`. Pages is set to "Deploy from a branch", `main` / root, with no Actions.

## Architecture

**Data flow:** `posts/*.md` (front matter + body) → `scripts/update-manifest.mjs` → `posts/manifest.json` (sorted newest-first: slug, file, title, date, updated, author, categories, cover, excerpt). Every page fetches the manifest once at runtime, so lists, load more and search all filter that one array. There's no other data source.

**Front matter** in posts is JSON-compatible YAML (quoted strings, JSON arrays). The script parses it with `JSON.parse` per line, with no YAML library. `category_slugs` drives categories, and `created_at` ("YYYY-MM-DD HH:mm:ss", Ulaanbaatar time) is the sort key. Image paths inside `.md` are relative to `posts/` (`images/...`, `images/cover/...`).

**`assets/main.js` is the whole app.** Each page's `<body>` carries:
- `data-page` (`home|category|post|search|about|...`): selects which section runs (see the `run` block at the bottom of the file).
- `data-root` (`./` at the root, `../` in subfolders): prefixed to every link, asset and fetch, so the site also works under a repo subpath. `404.html` uses `/`, because GitHub Pages serves it at any depth.

**Routing uses query strings:** `post/?slug=<slug>`, `category/?slug=<slug>`, `search/?q=<text>`. On the post page, JS strips the front matter, the leading `# Title` and the duplicated cover image from the markdown. It rewrites `images/` → `${ROOT}posts/images/`, renders the post, then sets the title, meta, canonical, Open Graph and BlogPosting JSON-LD dynamically.

**UI pieces in main.js:**
- `cardHtml()` is the single source of post-card markup.
- `masonry()` is a JS column layout: each card is appended to the shortest flex column, and the layout rebuilds only when the breakpoint column count changes. Don't swap it for CSS `columns`, which reshuffles existing cards when more are appended. Its layout styles are set inline, not as Tailwind classes, because the Play CDN generates classes for JS-added elements late. The post page's "Бусад нийтлэлүүд" block shows 8 random posts (`randomPick()`) in a plain 4-column CSS grid (`[data-random-grid]`), not masonry.
- Share buttons: markup is `<template id="share-template">` in `post/index.html` (`{{url}}`/`{{title}}` are URL-encoded), rendered by `shareButtons()` into each `[data-share-slot]` (under the title + end of article). Shared URL is always the canonical `SITE_URL` one.
- Load more shows 35 posts per click (`PER_PAGE`; masonry is up to 5 columns via `BREAKPOINTS`). It shows the button spinner, waits for the new cards' images (`imagesReady`, 6s cap), then appends them.

**Shared pieces (single source, loaded at runtime):**
- `site.json`: site name/url, social URLs, the category list (slug → Mongolian name). It's read by `main.js` (`init()` fills `SITE_NAME`, `SITE_URL`, `CATEGORIES`) and by `scripts/update-manifest.mjs`. Page logic runs only after it loads.
- `partials/header.html` and `partials/footer.html` replace `<div data-include="header|footer">` on every page. `fill()` substitutes `{{key}}` placeholders and leaves unknown keys untouched, so the category `<template>` inside `#category-menu` keeps its `{{url}}/{{slug}}/{{name}}` until the menu is built. The mobile dropdown toggle (`[data-menu-toggle]`) is wired in `renderHeader()` after injection, so header-dependent JS must run there, not at load.
- `assets/tailwind.config.js` holds the Play CDN config.
- Each partial ends with a single bare `</body>`. Keep it. VS Code Live Server injects its reload script into every `.html` response: before `</body>` if there is one, otherwise before **every** `</svg>`, while counting only one injection in `Content-Length`. Without it, `header.html` (5 inline SVGs) arrives truncated and the category menu is missing. Never add a second `</body>` to a partial.
- Still duplicated: each page's `<head>` (meta tags, JSON-LD) and the `https://sugar.mn` literals in those heads and in `robots.txt`.

**SEO / AI crawlers:**
- Static meta and JSON-LD live in each page's `<head>`; post-level meta is injected by JS.
- `llms.txt` links straight to the raw `/posts/*.md` files, because most AI crawlers don't run JS.
- `robots.txt` explicitly allows AI bots.
- `.nojekyll` must stay, or GitHub Pages would convert the `.md` files instead of serving them raw.
