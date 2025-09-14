# KPI API Documentation

## Overview

The KPI API (`/api/kpis`) fetches customer service metrics from Zendesk and caches them in Supabase to minimize API calls and improve performance.

## Features

- ✅ **Zendesk Integration**: Fetches real-time KPI data from Zendesk API
- ✅ **Supabase Caching**: Stores data in Supabase for faster subsequent requests
- ✅ **Brand Filtering**: Supports filtering by brand (all, brand-a, brand-b, brand-c)
- ✅ **Rate Limiting**: Handles Zendesk API pagination and rate limits
- ✅ **Fallback Data**: Returns sample data when Zendesk is not configured
- ✅ **Cache Invalidation**: Automatically refreshes data after 1 hour

## API Endpoints

### GET /api/kpis

Fetches KPI data with optional brand filtering and cache control.

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `brand` | string | `all` | Brand filter: `all`, `brand-a`, `brand-b`, `brand-c` |
| `refresh` | boolean | `false` | Force refresh from Zendesk (bypass cache) |

#### Examples

```bash
# Get all brands data
GET /api/kpis

# Get Brand A data
GET /api/kpis?brand=brand-a

# Force refresh Brand B data
GET /api/kpis?brand=brand-b&refresh=true
```

#### Response Format

```json
{
  "weeklyTicketsIn": [980, 1120, 1050, 1180, 1247],
  "weeklyTicketsResolved": [950, 1080, 1020, 1150, 1189],
  "frtMedian": 2.4,
  "avgHandleTime": 18.5,
  "fcrRate": 78.2,
  "csatAverage": 4.2,
  "trends": {
    "frt": [3.2, 2.8, 3.1, 2.7, 2.4],
    "aht": [22.1, 20.8, 21.3, 19.2, 18.5],
    "fcr": [72.5, 75.1, 74.8, 76.9, 78.2],
    "csat": [4.0, 4.1, 4.0, 4.2, 4.2]
  },
  "ticketsIn": 1247,
  "ticketsResolved": 1189,
  "aht": 18.5,
  "fcrPercent": 78.2,
  "frtDistribution": {
    "0-1h": 45,
    "1-8h": 35,
    "8-24h": 15,
    ">24h": 4,
    "No Reply": 1
  },
  "fcrBreakdown": {
    "oneTouch": 892,
    "twoTouch": 178,
    "reopened": 119
  },
  "selectedBrand": "all"
}
```

## Environment Variables

### Required for Zendesk Integration

```bash
# .env.local
ZENDESK_SUBDOMAIN=your-subdomain
ZENDESK_EMAIL=your-email@company.com
ZENDESK_API_TOKEN=your-api-token
```

### Required for Supabase Caching

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL_2=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY_2=your-supabase-anon-key
```

## Supabase Setup

### 1. Create the KPI Metrics Table

Run the SQL script in `supabase-kpi-schema.sql` to create the required table:

```sql
-- This creates the kpi_metrics table with proper indexes and constraints
-- See supabase-kpi-schema.sql for the complete schema
```

### 2. Configure Brand Organizations

Update the brand organization IDs in the API code:

```typescript
// In app/api/kpis/route.ts, update the brandOrganizations object
const brandOrganizations: Record<string, number[]> = {
  'brand-a': [1, 2, 3], // Replace with actual Zendesk organization IDs
  'brand-b': [4, 5, 6], // Replace with actual Zendesk organization IDs
  'brand-c': [7, 8, 9]  // Replace with actual Zendesk organization IDs
}
```

## How It Works

### 1. Cache-First Strategy

1. **Check Cache**: First checks Supabase for recent data (< 1 hour old)
2. **Return Cached**: If recent data exists, returns it immediately
3. **Fetch Fresh**: If no cache or data is stale, fetches from Zendesk
4. **Update Cache**: Stores fresh data in Supabase for future requests

### 2. Brand Filtering

- **All Brands**: Returns aggregated data from all tickets
- **Specific Brand**: Filters tickets by organization ID before calculating KPIs
- **Sample Data**: Returns brand-specific sample data when Zendesk is not configured

### 3. Error Handling

- **Zendesk Errors**: Falls back to cached data if available
- **Supabase Errors**: Continues with Zendesk data if caching fails
- **No Configuration**: Returns sample data for development

## Performance Benefits

### Before (Direct Zendesk)
- Every request hits Zendesk API
- ~2-5 seconds response time
- Rate limit concerns
- No offline capability

### After (With Caching)
- First request: ~2-5 seconds (fetches from Zendesk)
- Subsequent requests: ~200-500ms (from Supabase cache)
- 90% reduction in Zendesk API calls
- Offline capability with cached data

## Monitoring

### Cache Hit Rate
Monitor the console logs to see cache performance:
- `"Returning cached KPI data for brand: X"` = Cache hit
- `"Fetching fresh KPI data from Zendesk for brand: X"` = Cache miss

### Data Freshness
- Cache expires after 1 hour
- Use `?refresh=true` to force fresh data
- Monitor `last_updated` field in Supabase

## Troubleshooting

### Common Issues

1. **"No cached data found"**
   - Normal for first request
   - Check Supabase connection if persistent

2. **"Cached data is too old"**
   - Data is older than 1 hour
   - Will automatically fetch fresh data

3. **"Error fetching Zendesk KPIs"**
   - Check Zendesk credentials
   - Verify API token permissions
   - Check rate limits

4. **"Error caching KPI data"**
   - Check Supabase credentials
   - Verify table exists
   - Check RLS policies

### Debug Mode

Add `?refresh=true` to any request to bypass cache and see fresh data from Zendesk.

## Security

- API tokens are stored in environment variables
- Supabase RLS policies control data access
- No sensitive data is logged
- Rate limiting prevents abuse

## Future Enhancements

- [ ] Real-time updates via Supabase subscriptions
- [ ] Historical data analysis
- [ ] Custom date ranges
- [ ] Advanced filtering options
- [ ] Data export functionality
