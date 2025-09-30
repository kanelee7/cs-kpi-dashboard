# CS KPI Dashboard (Modular Architecture)

## Overview
- **Purpose:** Fetch Zendesk tickets, compute support KPIs (FRT, AHT, FCR, distributions), and persist the results in Supabase for dashboard consumption.
- **Refactor highlights:** The previous monolithic API route has been decomposed into reusable TypeScript services, utilities, and a focused Next.js API handler.

## Project Structure
```
services/
  zendeskClient.ts      // Zendesk API wrapper and ticket types
  kpiCalculator.ts      // KPI calculations and shared interfaces
  supabaseService.ts    // Supabase client factory and upsert helper
utils/
  dateUtils.ts          // Week/date helpers (KST aware)
pages/api/
  kpi-sync.ts           // Next.js API route orchestrating the sync job
legacy/
  zendeskKpiLegacy.ts   // Original implementation preserved for reference
```
## Installation
```bash
npm install
```
### Environment Variables (`.env.local`)
```
ZENDESK_SUBDOMAIN=your-subdomain
ZENDESK_EMAIL=agent@example.com
ZENDESK_API_TOKEN=your-zendesk-api-token
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```
## Usage
- **Run locally:** `npm run dev`
- **Manual KPI sync:** Send a `POST` request to `/api/kpi-sync`
- **Automated sync:** Schedule a weekly job (e.g., Vercel Cron, GitHub Actions) to call the same endpoint.

## Contribution Notes
- **Type safety:** Extend the existing interfaces in `services/` rather than introducing untyped objects.
- **Logging:** Use descriptive `console.log` statements for observability during sync operations.
- **Testing:** Add unit tests when enhancing utilities or KPI calculations (recommended).
- **Legacy reference:** The contents of `legacy/` are kept for historical context only—avoid importing them in new code.

Pull requests are welcome. Please keep changes scoped and consistent with the modular architecture.