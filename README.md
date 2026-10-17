<img src="assets/icon.svg" width="64" height="64" alt="Half-Staff Icon">

# Half-Staff

A mobile-first, responsive web application that shows at a glance whether the American flag is flying at half-staff or full-staff—and why—using live federal and state proclamations.

## Features

- **Simple At-a-Glance Status**: Features an animated 50-star, 13-stripe U.S. flag on a flagpole that visually transitions between full-staff and half-staff, paired with a concise explanation and direct links to official primary sources.
- **Progressive Disclosure**: Keeps the initial view minimal while letting you expand full proclamation texts or browse recent state and federal orders on demand.
- **Real-Time Multi-Source Aggregation (`/api/flag-status`)**:
  - **Federal**: Live RSS feed from [White House Presidential Proclamations](https://www.whitehouse.gov/presidential-actions/proclamations/).
  - **National & 50-State Aggregation**: Live proclamations and official `.gov` / GovDelivery PDF links from [HalfStaff.org](https://halfstaff.org/).
  - **State Portals**: Direct links and scrapers for state flag status portals, including [Minnesota Governor's Flag Status](https://mn.gov/governor/newsroom/flag-status/), [Wisconsin Dept. of Military Affairs](https://dma.wi.gov/flag-lowering-orders/), [Maryland Secretary of State](https://sos.maryland.gov/Pages/Services/Flag-Status.aspx), and [Iowa Governor's Newsroom](https://governor.iowa.gov/newsroom).
- **State Selection & Auto-Locate**: Supports all 50 U.S. states, D.C., and U.S. territories with local storage persistence and one-tap geolocation.
- **Browser Alerts & Calendar Integration**: Subscribe to browser notifications for new half-staff orders, add any proclamation directly to **Google Calendar**, or download an `.ics` calendar file.

## Getting Started

### Prerequisites

- Node.js 20+ and npm

### Installation & Development

```bash
# Install dependencies
npm install

# Start the development server (runs both the React frontend and /api/flag-status middleware)
npm run dev
```

### Production Build

```bash
# Type-check and build for production
npm run build

# Preview the production build locally
npm run preview
```

## Deploying to Cloudflare

This project is pre-configured for **Cloudflare Workers + Static Assets** via [`server/worker.ts`](server/worker.ts) and [`wrangler.toml`](wrangler.toml) (and also includes [`functions/api/flag-status.ts`](functions/api/flag-status.ts) for Cloudflare Pages).

### Deploy via Cloudflare Workers Builds or CLI

- **Build command**: `npm run build`
- **Deploy command**: `npx wrangler deploy`

## Project Structure

- [`src/App.tsx`](src/App.tsx) — Main mobile-first UI, state selector, browser alerts, and progressive disclosure drawers.
- [`src/components/FlagpoleGraphic.tsx`](src/components/FlagpoleGraphic.tsx) — Animated 50-star, 13-stripe SVG flag and flagpole component.
- [`src/types.ts`](src/types.ts) — Shared TypeScript interfaces, date range helpers, Google Calendar URL builder, and `.ics` calendar generator.
- [`server/flagStatusCore.ts`](server/flagStatusCore.ts) — Runtime-agnostic fetcher, parser, and deduplicator for live federal and state half-staff proclamations (works in both Node and Cloudflare Workers/Pages).
- [`server/worker.ts`](server/worker.ts) — Cloudflare Worker entry point serving `/api/flag-status` and static assets.
- [`server/flagApiPlugin.ts`](server/flagApiPlugin.ts) — Local Vite dev/preview server middleware for `/api/flag-status`.
