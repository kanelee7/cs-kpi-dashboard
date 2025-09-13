# Deployment Guide

## Vercel Deployment

### Step 1: Prepare Your Supabase Database

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Go to the SQL Editor in your Supabase dashboard
3. Copy and paste the contents of `supabase-schema.sql` into the editor
4. Run the SQL to create the tables and sample data

### Step 2: Get Your Supabase Credentials

1. In your Supabase project dashboard, go to Settings > API
2. Copy your Project URL and anon/public key

### Step 3: Deploy to Vercel

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) and sign in
3. Click "New Project" and import your GitHub repository
4. In the Environment Variables section, add:
   - `NEXT_PUBLIC_SUPABASE_URL_2`: Your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY_2`: Your Supabase anon key
5. Click "Deploy"

### Step 4: Verify Deployment

1. Once deployed, visit your Vercel URL
2. The dashboard should load with sample data
3. Check the browser console for any errors

## Local Development

### Prerequisites
- Node.js 18+
- npm or yarn

### Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Create `.env.local` with your Supabase credentials:
   ```
   NEXT_PUBLIC_SUPABASE_URL_2=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY_2=your_supabase_anon_key
   ```
4. Run development server: `npm run dev`
5. Open [http://localhost:3000](http://localhost:3000)

## Troubleshooting

### Common Issues

1. **"Failed to load dashboard data"**
   - Check your Supabase credentials in `.env.local`
   - Verify your Supabase project is active
   - Check the browser console for specific error messages

2. **Database connection errors**
   - Ensure your Supabase project is not paused
   - Check that the database schema was created correctly
   - Verify your anon key has the correct permissions

3. **Build errors on Vercel**
   - Check that all environment variables are set
   - Ensure your `package.json` has the correct dependencies
   - Check the Vercel build logs for specific errors

### Environment Variables

Make sure these are set in both local development and production:

- `NEXT_PUBLIC_SUPABASE_URL_2`: Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY_2`: Your Supabase anonymous/public key

## Production Considerations

1. **Database Security**: The current setup uses the anon key, which is safe for public dashboards. For sensitive data, consider implementing Row Level Security (RLS) in Supabase.

2. **Performance**: The dashboard fetches data on every page load. For high-traffic applications, consider implementing caching or data refresh strategies.

3. **Monitoring**: Set up monitoring for your Supabase usage and Vercel deployment to track performance and costs.

## Support

If you encounter issues:
1. Check the browser console for errors
2. Verify your Supabase setup
3. Check the Vercel deployment logs
4. Review the Next.js documentation for any framework-specific issues
