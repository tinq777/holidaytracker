# Holiday Tracker

A local-first travel budget companion for iPhone. No account, no backend, no tracking. Everything lives in IndexedDB on the device; backups are plain JSON files you control.

Stack: React 18 · TypeScript · Vite 5 · Dexie 4 (IndexedDB) · vite-plugin-pwa (Workbox).

## Run

```bash
npm install
npm run dev        # http://localhost:5173 (add --host to open it from your phone on the same Wi-Fi)
npm test           # logic tests: voice parsing, CSV detection, matching, budget maths
npm run build      # typecheck + production build into dist/
npm run preview    # serve dist/ (service worker active, offline works)
```

## Deploy (GitHub Pages)

The build uses relative paths (`base: './'`) and hash routing, so `dist/` works from any sub-path.

1. Push to a GitHub repo.
2. Settings → Pages → Source: **GitHub Actions**. The included `.github/workflows/deploy.yml` tests, builds and deploys on every push to `main`.
3. On iPhone, open the Pages URL in Safari → Share → **Add to Home Screen**.

Service-worker updates apply automatically on the next launch.

## Privacy and network use

The app makes only these requests, and only when online:

- **Exchange rates**: `open.er-api.com`, falling back to `api.frankfurter.app`. Keyless; only currency codes are sent.
- **AI reading** (optional, off by default): when you choose Claude in More → AI reading and capture a screenshot/receipt, that image goes directly from your phone to Anthropic with your own API key. Nothing is sent otherwise.

Spoken/typed entries ("128 yuan dinner, Alipay") are parsed on the device.

## AI providers

`src/ai/ExpenseExtractionService.ts` defines the interface (image or text → merchant, amount, currency, date, time, category, paymentMethod, description, confidence). Providers in `src/ai/providers.ts`:

| Provider | Use |
|---|---|
| Off (default) | Screenshots are stored in the inbox for you to fill in |
| Demo | Returns sample results (¥128 restaurant, ¥46 Didi, ¥299 Pokémon, ¥75 unknown) to try the workflow |
| Claude | Real extraction with your Anthropic API key |

Add another provider by implementing `ExpenseExtractionService` and registering it in `src/ai/index.ts`.

## Testing the full journey

Browser tests (Python Playwright) live in `tests/e2e/`. With `npm run preview` running on port 4173:

```bash
python3 tests/e2e/1_journey.py                  # create China 2027 → stays → flight → packing → capture → confirm → CSV import
python3 tests/e2e/2_persistence_offline_backup.py  # reopen, refresh, reconcile, lessons, offline, backup/restore
```

## Layout

```
src/lib      db schema, money/date maths, CSV parsing, matching, rates, backup, demo data
src/ai       extraction service + providers
src/screens  Home, HolidayForm, Trip (Overview/Expenses), Plan, Review, Import, Reconcile, Compare, More
src/components shared UI
```
