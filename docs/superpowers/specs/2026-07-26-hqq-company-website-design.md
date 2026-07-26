# hqq-tech.com — Company Website Design

**Date:** 2026-07-26
**Repo:** `hqq-oms`
**Status:** Approved design, pending implementation plan

---

## 1. Goal

`hqq-tech.com` currently serves only the OMS login screen. The company has no public
web presence. This project makes the domain root a company website for **مؤسسة حسن جاسم
القرقوش التجارية (HQQ)** and moves the OMS to `/app/*`, reachable from the site via a
«دخول الموظفين» link.

The site's single job: **make a factory owner contact HQQ for a quote.**

Audience: owners and technical managers of date factories and — via the new ATRUM
agency — dairy factories in Saudi Arabia. Industrial buyers, WhatsApp-first, decisions
worth hundreds of thousands of riyals.

## 2. Company facts (source: `brand/Company-Profile.pdf`)

- 25+ years supplying and supporting date-factory equipment
- 90+ date factories served across the Kingdom
- HQ in Dammam, branch in Al-Ahsa, coverage of all regions
- Lead specialty: **silicone molds and gaskets** for vacuum packing machines
- Also: vacuum packing, AI sorting, waterless brush cleaning, complete production
  lines (maamoul, date paste, date syrup), cutting blades, film-pulling chains, spares
- **ATRUM — exclusive agency for the entire Arabian Gulf**, not Saudi Arabia alone.
  Dairy and wider food lines: butter, cheese, and others. This is the single scarcest
  credential HQQ has and it is regional, not national — the site must say Gulf everywhere.
- **JOYSORT** — partner for AI date sorting
- Eight customer logos published in the profile: الامتياز، الخماش، باسقات القصيم،
  الأمين للتمور، رواد التمر، الطيار الفاخر، تمرا، ثمار النخبة
- Contact: phone `0554807333`, WhatsApp `966554807333`, `hqq.ibra@gmail.com`
- Seven named executed projects (see §9)

UTIEN PACK was previously listed as a partner and is **removed everywhere**, including
the partners image on page 8 of the profile, which must not be reused.

## 3. Decisions

| Decision | Choice | Why |
|---|---|---|
| OMS entry point | Same site, OMS moves to `/app/*` | One repo, one deploy, one certificate; clean public/private split |
| Positioning | **P1** — dates lead, ATRUM second pillar | 25 years / 90 factories is a moat no competitor can copy; ATRUM adds the sector without spending that credibility |
| Lead capture | WhatsApp-first + short form to email | Matches how customers already buy; no public write endpoint into the live DB |
| Content | Lives in code | Fastest to build, nothing extra to secure, layout can't be broken by an editor |
| Languages | Arabic (default) + English | Arabic at `/`, English at `/en` |

**Tagline change required.** «حلول متكاملة موثوقة لمصانع التمور» no longer describes what
HQQ sells now that ATRUM covers dairy. Both the AR and EN taglines must be re-approved
by the owner before launch — this is a brand decision, not an implementation detail.

## 4. Architecture

Next.js 15.5 App Router, React 19, Tailwind 3.4 — the existing `apps/web`.

Next.js permits **one root layout per top-level route group** when there is no shared
`app/layout.tsx`. Using that, Arabic, English, and the OMS each own their `<html>` tag
with the correct `lang`/`dir`, while all three stay statically generated:

```
apps/web/src/app/
  (site-ar)/  layout.tsx   <html lang="ar" dir="rtl">   →  /            Arabic
  (site-en)/  layout.tsx   <html lang="en" dir="ltr">   →  /en/*        English
  (oms)/app/  layout.tsx   <html lang="en" dir="ltr">   →  /app/*       OMS
```

Rejected alternative: a single layout switching direction at request time. It forces
every marketing page to render per-request; these pages should be static HTML.

Consequence worth stating: the marketing pages stop loading `@tanstack/react-query`,
`zustand`, `socket.io-client`, TipTap, and the service worker. They ship near-zero JS.
That is most of what makes the site feel fast.

**Migration scope, measured:** 43 route literals across 21 files under `apps/web/src`.

### URL map

| URL | Serves |
|---|---|
| `/` | Arabic home |
| `/solutions`, `/projects`, `/about`, `/contact` | Arabic subpages |
| `/en`, `/en/solutions`, … | English equivalents |
| `/app/login` | OMS login |
| `/app/orders`, `/app/products`, `/app/customers`, `/app/projects`, `/app/vendors`, `/app/reports`, `/app/analytics/*`, `/app/todo/*`, `/app/users` | OMS |

## 5. Migration and compatibility

Three things break if not handled. Each is a required task, not a nice-to-have.

1. **Staff bookmarks.** nginx `301` from every old top-level OMS path to its `/app/*`
   equivalent (`/login`, `/orders`, `/products`, `/customers`, `/projects`, `/vendors`,
   `/reports`, `/analytics`, `/todo`, `/users`).
2. **Android app.** The TWA's `start_url` in `apps/web/public/manifest.json` is `/`,
   which today redirects to `/orders` or `/login`. Once `/` is the company page, the
   installed app opens the marketing site. Change `start_url` to `/app`, rebuild, and
   re-sign with the existing keystore (`apps/android/android.keystore`, alias `hqq`).
3. **Service worker.** `public/sw.js` caches `['/', '/login', '/manifest.json']` under
   `CACHE_NAME = 'hqq-oms-v1'`, a name that never changes, with stale-while-revalidate.
   Installed PWA clients will serve a stale `/`. Bump to `hqq-oms-v2`, move the worker
   to `/app/sw.js` with scope `/app/`, and ship a one-time unregister for the old
   root-scoped worker.

## 6. Content model

Typed dictionaries, one per language, sharing a single shape so a missing translation is
a type error rather than a runtime gap:

```
apps/web/src/content/site/
  types.ts     # the shape both languages must satisfy
  ar.ts
  en.ts
```

Page files stay thin — each renders a shared section component with its language's
dictionary. English is a **mirror, not a translation**: the signature thread moves to the
left edge, layout reflects, and the Latin display face must carry the same weight as the
Arabic one.

## 7. Visual design

**Thesis: «منتجك القادم يبدأ من خط إنتاج.»** HQQ is a solutions source for factories —
it sells complete production lines, not maintenance. The headline sells expansion and
works equally for dates and for ATRUM's dairy lines. The primary CTA is
«اطلب دراسة لمصنعك», not a price request, because a solutions supplier starts with a study.

> An earlier draft used «الخط لا يتوقف» as the site thesis. That was wrong: it frames HQQ
> as the spare-parts supplier. The line is excellent but belongs to one section — it is
> now the heading of the **قطع الغيار** band, where downtime genuinely is the argument.

**Ground: one unified deep navy across the entire page.** Section changes come from
hairlines, spacing, and soft radial glows — never from flipping between light and dark.
Alternating white and navy chops the page into disconnected blocks and puts a visible
white rectangle around every photo.

**One deliberate exception:** the customer logo wall sits on a single light panel. Those
logos carry dark text and are illegible on navy. It reads as a credentials plate, which is
what it is.

**No line motif.** An earlier draft ran the tricolor as a straight edge-to-edge line, then
as three swept strokes echoing the profile's corner ribbons. Both were rejected: the
profile's ribbons taper and overlap like fabric, and three even strokes just read as three
lines — worst of all on a narrow screen. Depth now comes from soft glows. If the ribbon
motif returns it must be drawn as tapering filled shapes, and hidden below tablet width.

**Color:**

| Token | Value | Use |
|---|---|---|
| Navy ground | `#0B1422` | The single page ground |
| Navy surfaces | `#080E18` · `#111C2E` · `#16243A` | Deeper bands, cards, hovers |
| Hairline | `#1E2E47` | All section and card separation |
| Brand red | `#E03A2A` | CTAs and section tags only |
| Brand green | `#2BA04A` | The ATRUM exclusivity mark only |
| WhatsApp green | `#25D366` | WhatsApp actions only — not a brand colour |
| Text | `#E9EEF5` · `#9DACBF` · `#6B7C92` | Primary, secondary, tertiary |

**Type:** Noto Kufi Arabic (display, 800/900, tight tracking) · Readex Pro (body, 200–400)
· IBM Plex Mono (machine data, capacities, model numbers). The app currently sets no font
at all. For English display, **Archivo** at 700/800 — a tight grotesque that holds the same
structural weight as Kufi at large sizes, so the two language versions read as one brand
rather than a translation.

**Numbers are display-scale.** The credibility band (25+ / 90+ / 2 / 1) sets its figures at
48–76px in the mono face. At body scale they read as footnotes; the whole point is that a
visitor absorbs them without reading a sentence. The fourth cell is **1 — وكالة ATRUM
الحصرية للخليج العربي**, phrased as a numeral so all four share one rhythm.

**Photography — cutouts are mandatory on a dark ground.** Every source photo is a
white-background studio shot, which cannot be blended into navy. Seven have been knocked
out by flood-filling inward from the image borders, so interior whites (panel faces,
machine highlights, silicone cavities) survive while the studio background goes, with a
0.7px feather so edges don't look scissor-cut. They sit directly on the navy with a real
drop shadow. **Two remain:** both chain photos were shot in a working environment
(concrete floor, machine interior) and have no white to remove — they need manual cutting,
or they stay as framed photographic panels, which is an acceptable texture contrast.

**Verify machine identity against the profile before labelling.** Extraction order does not
match visual order: the vacuum packer and the AI sorter were transposed for several drafts.
The sorter is the multi-station line with a control screen; the vacuum packer is the long
flat machine with a film reel.

**Motion:** hero video loop; the thread draws on load and pulses; stat numbers count once;
cards lift on hover. `prefers-reduced-motion` respected. Nothing else moves.

## 8. Pages

**Home** — hero (thesis + Gulf exclusivity badge + CTAs + cut-out machine) → credibility
band → **الحلول** → **قطع الغيار** («الخط لا يتوقف») → **ATRUM** → **عملاؤنا** (logo wall)
→ projects ledger → closing CTA → footer.

**الحلول** — **خطوط الإنتاج المتكاملة leads at full width**, because that is what HQQ
sells; the rest follow as equals: vacuum packing, AI sorting, waterless brush cleaning,
silicone molds & gaskets, date pitting. Every card carries real specifications.

**قطع الغيار** — its own band with «الخط لا يتوقف» as the heading: cutting blades and
knives, spare parts for all machines, film-pulling chains (الجنازير). This is recurring
revenue and was missing entirely from the first drafts — a factory buys one packing
machine and then buys consumables for years.

**عملاؤنا** — the eight customer logos, cut apart from the profile page so they lay out
individually. Named factories that chose HQQ outperform any sentence the site can write.
Confirm none of the eight object to being listed publicly before launch.

**Projects** — all seven named factories and what was delivered, presented as a manifest.

**About** — 25 years, the five-step process (دراسة الاحتياج → تصميم الحل والتوريد →
التركيب والتشغيل → تدريب الكوادر → الصيانة وقطع الغيار), the six reasons, Vision 2030
market context with its official sources cited.

**Contact** — phone, WhatsApp, email, both locations, and the quote form.

## 9. Executed projects (site content)

| # | Factory | Delivered |
|---|---|---|
| 1 | مصنع عبدالهادي الربيعة للتمور | ماكينة تغليف تمر فاكيوم — 6 كجم/دورة |
| 2 | مصنع العيد للتمور | ماكينة تغليف تمر فاكيوم — 6 كجم/دورة |
| 3 | مصنع حبيب الرزق | ماكينة تغليف تمر فاكيوم — 4 كجم/دورة |
| 4 | شركة الأحساء للصناعات الغذائية | خط إنتاج عجينة تمر كامل |
| 5 | مصنع جازات للتمور | ماكينة فرز التمور حسب الأحجام والجودة |
| 6 | جمعية النخلة التعاونية لتعبئة التمور — الأحساء | خط إنتاج معمول شامل التغليف |
| 7 | مصنع علي أجود لتعبئة التمور — الأحساء | ماكينة تغليف تمر فاكيوم — 4 كجم/دورة |

Presented as selected examples from a record of 90+ factories.

## 10. Lead capture

**Both contact actions are native deep links, never displayed numbers.**

| Action | Label | Link | Icon |
|---|---|---|---|
| WhatsApp | «تواصل على واتساب» | `https://wa.me/966554807333` | WhatsApp glyph, `#25D366` |
| Call | «اتصل بنا» | `tel:+966554807333` | Handset glyph |

A raw number printed as a button label is not a call to action — the visitor has to read
it, remember it, switch apps and retype it. «اتصل بنا» with a handset icon opens the
dialer on tap. Same rule on desktop: `tel:` still works, and the number belongs on the
contact page as text, not on a button.

On mobile both actions are pinned to the bottom of the viewport on every page, at 56px
height. Reaching WhatsApp must never require scrolling.

A short quote form — name, factory, city, phone, machine of interest, message — posts to a
Next.js route handler that sends email. **No database write and no new public endpoint
into the live DB.**

Protections: honeypot field, per-IP rate limit, server-side validation, and a visible
WhatsApp fallback if mail delivery fails.

Needed from the owner: SMTP credentials, and a decision on the public address. `info@hqq-tech.com`
is recommended over `hqq.ibra@gmail.com` — the domain is already owned, and a free
mail address on a company site undercuts 25 years of credibility.

## 11. Security

The site going public changes the threat model. These ship **with** launch.

1. **`/uploads/` is served by nginx with no authentication** and contains customer
   drawings. Today the only protection is that the URLs aren't published. Fix: remove the
   public `alias` from the nginx server block and serve uploads through an authenticated
   API route that verifies the session, then streams the file from `/opt/hqq-oms/uploads/`.
   Existing `/uploads/...` references in the OMS are rewritten to the new route. This is
   the highest-priority item in the project.
2. **`apps/web/src/middleware.ts` is a no-op** — it matches every path and calls
   `NextResponse.next()` unconditionally. Auth is client-side only. Add a server-side
   guard redirecting unauthenticated `/app/*` to `/app/login`.
3. **Security headers** at nginx: CSP, HSTS, `frame-ancestors`, `X-Content-Type-Options`,
   `Referrer-Policy`, `Permissions-Policy`.
4. **Rate limit** the login endpoint (`limit_req`) against credential stuffing.
5. **Uploads out of git** — `apps/api/uploads` is currently tracked with 171 files.
6. **`process.cwd()` upload paths** — 11 sites in the API should read a `UPLOADS_DIR`
   env var instead. Carried over from the earlier uploads fix; still outstanding.

## 12. SEO and indexing

nginx currently sends `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet` on **every**
response, by earlier request. A company website nobody can find defeats the purpose.

Change to selective: marketing pages indexable; `noindex` scoped to `/app/` and
`/uploads/`. `robots.txt` continues to allow crawling deliberately — `Disallow` would
prevent robots from ever seeing the `noindex` and could strand indexed URLs.

Add: per-page metadata, OpenGraph images, `hreflang` alternates between AR and EN,
`sitemap.xml`, and Organization + LocalBusiness structured data covering both branches.

## 13. Performance

Static generation for every marketing page. `next/image` with AVIF/WebP. Fonts self-hosted
via `next/font` with `display: swap`. Video lazy-loaded behind a poster, `muted`/`playsinline`,
never autoplayed on mobile data. Target: Lighthouse ≥95 performance and ≥95 accessibility
on the Arabic home page, mobile profile.

## 14. Testing and verification

The project's own build caveat is that a green build does not prove type-correctness, and
lint is disabled. So:

- `tsc --noEmit` compared against the known 6-error baseline — no new errors
- Playwright smoke tests: both languages render, language switcher round-trips, nav links
  resolve, quote form validates and submits, `/app/login` still loads
- `curl` assertions on the 301s, the security headers, and the scoped `X-Robots-Tag`
- Unauthenticated `GET /uploads/<known-file>` must fail after the fix
- After deploy, confirm `pm2 jlist` shows both processes actually restarted — an SSH drop
  between build and restart has silently produced stale 404s on this project before

## 15. Deployment

Per the established procedure: `git archive` a clean tarball (excluding `node_modules`,
`.next`, and uploads) → back up `apps/*/src` and `.next` on the server → `scp` → extract
into `/opt/hqq-oms` → `npm install` → build API → build web → **`pm2 restart hqq-api hqq-web`**
→ verify. nginx changes applied separately with a timestamped backup of
`/etc/nginx/sites-available/hqq-tech`.

## 16. Inputs still needed from the owner

Implementation can start without these; launch cannot finish without them.

| Input | Blocks |
|---|---|
| Vector logo (`.svg`/`.ai`/`.eps`) | Crisp rendering at all sizes; favicon |
| The two chain photos, cut out | The قطع الغيار band — the other seven are already done automatically; only these two were shot in a real environment |
| Written confirmation of the Gulf-wide ATRUM agency scope | Every «الخليج العربي» claim on the site |
| ATRUM logo, website, catalogue, line photos | The entire ATRUM section — no claims will be written about them unverified |
| Four short videos (packer cycling, sorter running, hands fitting a gasket, ATRUM line) | Hero and sector bands |
| Installation photos from customer factories | Projects page — the most persuasive images available |
| SMTP credentials | Quote form |
| Decision on the public email address | Contact page |
| Approval of the revised AR/EN tagline | Header and metadata |
| Certificates (CR, VAT, ISO, agency letters) | About page credibility block |

## 17. Delivery phases

The work is one launch, but it has three separable tracks. The implementation plan should
follow this order, because each one de-risks the next.

**A — Relocation.** Move the OMS under `/app`, add the 301s, fix the middleware guard,
bump and re-scope the service worker, update and rebuild the TWA. Ends with the OMS
working exactly as before at new URLs, `/` still untouched. Independently verifiable and
independently revertable.

**B — The site.** Route groups, content dictionaries, design system, Arabic pages, English
mirror, quote form. Ends with the site live at `/`.

**C — Public-exposure hardening.** Uploads behind auth, security headers, login rate limit,
selective indexing, sitemap and structured data.

**A and C must both be complete before the site is announced.** B can ship to a staging
URL earlier for review. Track C is not optional polish — putting a public front door on a
server whose `/uploads/` is unauthenticated is the one sequencing mistake that would matter.

## 18. Out of scope

Editing site content without a developer (no CMS). Online ordering or e-commerce.
Public exposure of OMS product data. Customer login. Blog or news section. Any change to
OMS business logic beyond relocating its routes.
