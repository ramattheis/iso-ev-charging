# EV Charging Coordinator

An independent, anonymous honor-system web app for employees coordinating shared EV charging
spaces.

Drivers can:

- Switch between the Holyoke and Windsor campuses, with Holyoke selected by default
- Signal that they need a charging spot, which flips the day's status from **Slack** to **Congested**
- Post an offer to unplug and vacate a space at a specific time later today
- Claim someone else's offer so the two drivers can meet at the charger

All browsers share the same live state through a Cloudflare Worker and D1 database. Status and
handoff offers are kept separate for each campus. Offers stop appearing at their scheduled time,
and the previous day's names and records are removed by a daily cleanup job.

**Live site:** https://iso-ev-charging.iso-ev-charging.workers.dev

## Tech stack

- React, Vite, and Tailwind CSS
- Cloudflare Workers Static Assets for the frontend
- A Cloudflare Worker for the API
- Cloudflare D1 (SQLite) for shared state
- Cloudflare's native Rate Limiting bindings for abuse protection

## Run locally

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run db:migrate:local
npm run dev
```

The local development server prints its URL, normally `http://localhost:5173`. Local D1 data is
kept under `.wrangler/` and is not committed.

To build and preview the production Worker locally:

```bash
npm run build
npm run preview
```

## Deploy to Cloudflare for $0

For the strongest no-billing guarantee, use a dedicated Cloudflare account that remains on the
**Workers Free** plan. Do not upgrade that account to Workers Paid: the Free plan stops serving
dynamic requests when its daily limit is reached instead of charging overages.

1. Create a free Cloudflare account and sign in from this directory:

   ```bash
   npx wrangler login
   ```

2. On a new Cloudflare account only, create the production D1 database. The checked-in configuration
   is already connected to the current deployment, so do not repeat this step for normal updates:

   ```bash
   npm run cf:db:create
   ```

3. Apply the database migration:

   ```bash
   npm run db:migrate:remote
   ```

4. Deploy the Worker and static site:

   ```bash
   npm run cf:deploy
   ```

Wrangler prints the resulting `*.workers.dev` URL. Future deployments only require the final
command.

The site deliberately has no sign-in. Share its URL only with the intended group, but remember that
an unlisted URL is not access control: anyone who discovers it can see and change the shared status.

## Free-tier and abuse safeguards

The project uses several independent limits:

- **Hard cost ceiling:** Workers Free stops dynamic requests after 100,000 requests/day. D1 Free
  similarly rejects operations after its free read/write limits. An attack can make the app
  temporarily unavailable, but it cannot create Workers or D1 overage charges while the account
  remains on the Free plan.
- **Global throttle:** at most 600 API requests/minute per Cloudflare location reach application
  code.
- **Browser throttle:** at most 30 API requests/minute per browser identifier.
- **Network throttle:** at most 300 API requests/minute per source IP.
- **Write throttle:** at most 10 changes/minute per browser identifier.
- **Database protection:** no more than 100 active offers can exist for one day, request bodies are
  limited to 4 KB, names are limited to 50 characters, and claims use a conditional atomic update.
- **Sensitive-action protection:** marking conditions as Slack, releasing a claim, and removing an
  offer all require confirmation. A stale Slack confirmation is rejected if someone reports new
  charging demand while the confirmation is open.
- **Browser behavior:** the app polls only once every 30 seconds, stops polling while its tab is
  hidden, and cancels an older refresh before applying a user update so stale responses cannot
  repaint the page.
- **Cross-site protection:** browser writes must come from the same website origin.

Cloudflare's application-level rate limiting is intentionally approximate and local to each
Cloudflare location. The Workers Free-plan cutoff—not the custom throttles—is the final billing
safeguard. If the limit is reached, dynamic requests resume after Cloudflare's daily quota resets.

Current limits should be checked before deployment because platform policies can change:

- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [D1 pricing and Free-plan behavior](https://developers.cloudflare.com/d1/platform/pricing/)
- [Workers Rate Limiting API](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

## Project layout

```text
index.html                  Vite entry point and link-preview metadata
src/App.jsx                 React interface and API client
worker/index.js             Shared API, validation, throttling, and daily cleanup
migrations/0001_initial.sql D1 initial schema
migrations/0002_add_locations.sql Per-campus state and offers migration
public/_headers             Browser security and no-index headers
public/legal.html           Quiet standalone ownership, disclaimer, and licensing page
LICENSE                     Project MIT License
NOTICE.md                   Ownership and independence notice
THIRD_PARTY_NOTICES.md      Runtime dependency copyright and license notices
ASSET_PROVENANCE.md         Image and generated-artwork origin record
wrangler.jsonc              Cloudflare bindings and free-tier guardrails
vite.config.js              Vite, React, Tailwind, and Cloudflare plugins
```

## Privacy and ownership

The app stores only the first names entered for today's charging handoffs. Old rows are deleted by a
daily cleanup job. Because there is no sign-in, the server cannot prove who posted, claimed, edited,
or removed an offer; those actions remain honor-system operations.

Website owner and maintainer: **Ross Mattheis**

> ISO New England was not involved in the creation of this website. ISO New England has no ownership or other interest in this website. The website’s owner is solely responsible for the content and functionality.

Except for separately identified third-party material, the project is available under the
[MIT License](LICENSE). See [NOTICE.md](NOTICE.md),
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and
[ASSET_PROVENANCE.md](ASSET_PROVENANCE.md) for the complete ownership, dependency, and artwork
records. Run `npm run check:licenses` after dependency changes to flag runtime packages whose
licenses have not been reviewed.
