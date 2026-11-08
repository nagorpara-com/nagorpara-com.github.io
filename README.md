# নগর পাড়া অগ্রগামী যুব সংঘ — Official Website

Public Website + Admin Panel in **one** React app.
React + TypeScript + Tailwind CSS 4 · Supabase (Auth + PostgreSQL + Storage) ·
Hosted on GitHub Pages.

Brand colors (fixed by the organization): Dark Green `#17623D`,
White `#FFFFFF`, Gold `#F3C64E`.

> **Build status: Phase 2 — Foundation only.**
> No homepage design, banner, player list or other page content exists
> yet. Every page is a neutral route placeholder and will be designed in
> its own phase, from the Reference Image the organization provides.
> No sample content is presented as real organization data anywhere.

## Routing decision (GitHub Pages)

**HashRouter.** GitHub Pages is static hosting with no SPA fallback, so
with BrowserRouter a shared link or refresh on `/football` would 404.
With HashRouter, links look like `https://<user>.github.io/<repo>/#/football`
— the server only ever serves `index.html`, so every page opens
directly, refreshes safely and can be shared. `base: './'` in
`vite.config.ts` keeps asset paths correct under any repo name.

## Project structure

```
nagar-para-youth-sangha/
├── public/
│   └── logo.png                # The organization's REAL logo (installed
│                               # 2026-10-22, byte-identical to the original
│                               # in references/logo-original.png).
│                               # Never alter it without permission.
├── references/                 # Original logo + planning/reference images
│                               # provided by the organization (archive only,
│                               # not part of the website)
├── docs/REFERENCE_ANALYSIS.md  # Panel-by-panel analysis of the references
├── src/
│   ├── config/organization.ts  # org name (BN/EN) + brand colors
│   ├── lib/supabaseClient.ts   # Supabase client (null until configured)
│   ├── context/AuthContext.tsx # session + profile/role provider
│   ├── components/             # shared UI + RequireAdmin route guard
│   ├── layouts/                # PublicLayout, AdminLayout
│   ├── pages/
│   │   ├── public/             # one file per public page
│   │   └── admin/              # one file per admin page
│   ├── types/database.types.ts # domain types mirroring the SQL schema
│   └── App.tsx                 # all routes (public + /admin)
├── supabase/
│   ├── migrations/             # 0001 schema + RLS, 0002 storage, 0003 homepage, 0004 players, 0005 cricket
│   └── README.md               # setup + security + finance rules
├── .github/workflows/deploy.yml
├── .env.example                # copy to .env — public values only
└── .gitignore                  # .env and secrets are never committed
```

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build into dist/
npm run preview    # preview the production build
```

## Supabase (not connected yet)

No project is connected and **no fake credentials are used**. When the
organization creates its project, follow `supabase/README.md`:
run the five migrations, then put only `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` in `.env` (and in GitHub Actions Secrets for
deployment). The service_role key and database password must never
enter this repository.

Until Supabase is configured the site shell still renders, the Admin
login page honestly shows "not connected", and `/admin` routes redirect
to the login page. There is no demo login.

## Deployment (GitHub Pages)

Push to `main` → GitHub Actions builds and deploys (`.github/workflows/deploy.yml`).
One-time repo setup: Settings > Pages > Source = **GitHub Actions**, and
add the two `VITE_SUPABASE_*` values under Settings > Secrets > Actions.
Manual alternative: `npm run deploy` (gh-pages branch).

## Phase plan

| Phase | Work |
|---|---|
| 1 | Planning — architecture, routes, schema, security ✅ |
| 2 | Foundation & project setup ✅ (this phase) |
| 3 | Layout — Header, Footer, mobile menu (Reference Image) |
| 4 | Home page (Reference Image) |
| 5 | Village Profile & History |
| 6 | Football Team & Player Profiles |
| 7 | Cricket Team & Player Profiles |
| 8 | Matches, Results & Tournaments |
| 9 | News, Activities & Notices |
| 10 | Photo & Video Gallery |
| 11 | Finance & Accounts (public summary + admin) |
| 12 | Members, Committee & Contact |
| 13 | Auth (Supabase) + Admin Login activation |
| 14 | Admin Dashboard & Content Management |
| 15 | Admin Finance, User Management & Settings |
| 16 | Full testing, security check & final deployment |

Each phase starts only on the organization's instruction, with its
Reference Image, and ends with a report.
