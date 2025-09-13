# CS KPI Dashboard

A modern Customer Service KPI Dashboard built with Next.js, TypeScript, TailwindCSS, and Supabase.

## Features

- **Real-time KPI Metrics**: Weekly tickets, resolution rates, response times, and CSAT scores
- **Interactive Charts**: Weekly trends, FRT distribution, and performance analytics
- **Compact Mode**: Optimized for embedding in Notion or other platforms
- **Responsive Design**: Works on desktop and mobile devices
- **Live Data**: Connected to Supabase for real-time data updates

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript
- **Styling**: TailwindCSS
- **Database**: Supabase (PostgreSQL)
- **Icons**: Lucide React
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd cs-kpi-dashboard
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.local.example .env.local
```

4. Configure Supabase:
   - Create a new Supabase project
   - Run the SQL schema from `supabase-schema.sql` in your Supabase SQL editor
   - Update `.env.local` with your Supabase URL and anon key

5. Run the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Database Schema

The dashboard uses two main tables:

### `tickets`
- `id` (bigint, PK)
- `created_at` (timestamp)
- `resolved_at` (timestamp, nullable)
- `status` (text)
- `first_response_time` (int, minutes)
- `first_contact_resolved` (boolean)

### `csat_feedback`
- `id` (bigint, PK)
- `ticket_id` (FK → tickets.id)
- `rating` (int, 1-5)
- `comment` (text, nullable)
- `created_at` (timestamp)

## API Endpoints

- `GET /api/kpis` - Fetches all KPI data and trends

## Deployment

### Vercel Deployment

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Add environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL_2`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY_2`
4. Deploy!

### Manual Deployment

```bash
npm run build
npm start
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL_2` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY_2` | Your Supabase anonymous key |

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License