# EV Charging Coordinator

A small, honor-system web app for coordinating the shared EV charging spaces at ISO-NE.

Drivers can:

- Signal that they need a charging spot, which flips the day's status from **Slack** to **Congested**
- Post an offer to unplug and vacate a space at a specific time later today
- Claim someone else's offer so the two drivers can meet at the charger

Offers expire automatically once their scheduled time passes, and all state resets at the start of
each day. If the two drivers don't meet, the vacated space is first-come, first-served.

## Tech stack

- [React 19](https://react.dev/)
- [Vite 7](https://vite.dev/) for dev server and build
- [Tailwind CSS 4](https://tailwindcss.com/) for styling
- [Framer Motion](https://motion.dev/) for animation
- [Lucide](https://lucide.dev/) for icons

## Running locally

Requires Node.js 20.19+ (or 22.12+).

```bash
npm install
npm run dev
```

The dev server prints a local URL (default `http://localhost:5173`).

To produce a production build into `dist/`:

```bash
npm run build
npm run preview
```

## Project layout

```
index.html        Vite entry point
src/main.jsx      React root
src/App.jsx       The entire application
src/index.css     Tailwind import
vite.config.js    Vite + React + Tailwind plugins
```

## Status: prototype

**This is a single-browser prototype, not a working shared tool yet.**

All state lives in the visitor's own `localStorage` under the key `isone-ev-coordinator-v1`. There
is no backend, so two people opening the site each see their own private copy of the day's status
and offers — nothing is actually shared between drivers.

Because the app is purely client-side, it *would* deploy to GitHub Pages (or any static host) as-is.
Static hosting is not the limitation; the missing shared backend is. Making this genuinely useful
needs server-side state, for example:

- A small API plus database (offers, claims, today's status)
- Or a hosted realtime store such as Firebase, Supabase, or similar
- Plus some form of ISO-NE authentication so only staff can post and claim

## Privacy note

The app asks only for a first name, used to identify who is handing off a space on a given day.
Entries are discarded when the day rolls over.
