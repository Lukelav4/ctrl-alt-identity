# ctrl+alt+identity

A Windows XP themed blog about identity and access management, by Luke Laverton.

Static site. No build step, no dependencies, no framework. Every file can be edited
directly in the GitHub web editor from a phone, and the change is live in under a minute.

---

## Deploy

### Fastest — Netlify Drop

1. Go to <https://app.netlify.com/drop>
2. Upload this folder (or the `.zip`)
3. You get a live URL immediately

### Proper — GitHub + Vercel

1. Create a new repository on GitHub
2. Upload these files (**Add file → Upload files**; on iOS you can multi-select from the Files app)
3. Go to <https://vercel.com/new>, import the repo
4. Framework preset: **Other**. Build command: leave empty. Output directory: `.`
5. Deploy

Every push to `main` redeploys automatically.

GitHub Pages also works with zero configuration — Settings → Pages → deploy from `main`.

---

## Sharing a post

Every post has a permalink:

```
https://ctrlaltidentity.dev/#/posts/<filename-without-.md>
```

Opening one of those skips the boot sequence and lands straight on the post.
`#/about`, `#/blog`, `#/contact`, `#/projects` and `#/linkedin` work the same way.

**Regenerate `feed.xml` whenever you add a post.** It is written by hand at the moment,
so copy an existing `<item>` block and edit it, or ask Claude to rebuild it.

---

## Adding a blog post

Two steps.

**1.** Create a markdown file in `posts/`, for example `posts/my-new-post.md`.
Do not put a `#` title at the top — the title comes from the index.

**2.** Add an entry to the **top** of `posts/index.json`:

```json
{
  "file": "my-new-post.md",
  "title": "My New Post",
  "date": "3 August 2026",
  "read": "5 min"
}
```

That's it. The post appears in the Blog Posts folder on the desktop.

### Markdown supported

`##` and `###` headings, paragraphs, `**bold**`, `*italic*`, `` `code` ``,
fenced code blocks, bullet lists with `-`, and `[links](https://example.com)`.

Deliberately minimal — the renderer is about 40 lines in `app.js`. Extend it if you need more.

---

## Editing the rest

| What | Where |
|---|---|
| About / Contact text | `posts/about.md`, `posts/contact.md` |
| LinkedIn profile | `posts/linkedin.json` |
| LukeBot replies | `data/chatbot.json` |
| SailPoint identities | `data/sailpoint.json` |
| SailPoint menus | `IIQ_MENUS` in `app.js` |
| Active Directory contents | `data/directory.json` |
| Active Directory menus | `ADUC_MENUS` in `app.js` |
| Desktop icons and labels | `ITEMS` array at the top of `app.js` |
| Task Manager joke list | `fillWindow()` in `app.js` |
| Colours, type, layout | `:root` variables at the top of `styles.css` |
| Sounds | `SOUNDS` map at the top of `app.js`; files in `assets/sounds/` |
| Link preview card | `assets/og-image.png`, 1200x630 |
| RSS feed | `feed.xml` |
| Permalink routes | `ROUTE_WINDOWS` in `app.js` |
| Wallpaper | the `<svg class="hills">` block in `index.html` |
| Boot / login wording | `index.html` |

Boot timing is at the bottom of `app.js` — `setTimeout(() => show("#login"), 3600)`.

---

## Files

```
index.html          markup for all four screens
styles.css          flat minimalist XP theme
app.js              boot sequence, window manager, markdown renderer
posts/              content, markdown files plus index.json
data/               SailPoint, Active Directory and LukeBot contents
assets/xp-logo.png  the flag
assets/sounds/      XP sounds, only fetched after the visitor unmutes
assets/tahoma.woff2 subset of Tahoma, ~29KB
assets/icons/       UI icons
```

---

## Before going public

**Fonts.** `assets/tahoma.woff2` is a subset of Tahoma, which is proprietary
Microsoft software. Fine locally; not licensed for redistribution on a public site.
Either delete the `@font-face` block in `styles.css` and let it fall back to the system
stack, or swap in a freely licensed alternative.

**Sounds.** Audio is muted by default and nothing downloads until someone presses the
speaker in the system tray, so a visitor who never unmutes pays no bandwidth for it.

**Trademarks.** The Windows flag and the "xp" lockup are Microsoft marks. Homage sites
do this routinely and it is very rarely an issue, but the site carries your name, so it
is your call. A stylised original mark would sidestep it entirely.
