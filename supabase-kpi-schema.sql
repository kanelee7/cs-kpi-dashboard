-- Raw Zendesk Tickets Table for storing actual ticket data
CREATE TABLE IF NOT EXISTS zendesk_tickets (
  id BIGINT PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status VARCHAR(50) NOT NULL,
  first_response_time INTEGER,
  solved_at TIMESTAMP WITH TIME ZONE,
  requester_id BIGINT,
  assignee_id BIGINT,
  group_id BIGINT,
  organization_id BIGINT,
  tags TEXT[],
  custom_fields JSONB,
  subject TEXT,
  description TEXT,
  priority VARCHAR(20),
  type VARCHAR(20),
  raw_data JSONB NOT NULL,
  last_synced TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at_sync TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- KPI Metrics Table for caching calculated data
CREATE TABLE IF NOT EXISTS kpi_metrics (
  id SERIAL PRIMARY KEY,
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  brand VARCHAR(50) DEFAULT 'all',
  
  -- Core KPIs
  tickets_in INTEGER NOT NULL DEFAULT 0,
  tickets_resolved INTEGER NOT NULL DEFAULT 0,
  frt_median DECIMAL(10,2) NOT NULL DEFAULT 0,
  avg_handle_time DECIMAL(10,2) NOT NULL DEFAULT 0,
  fcr_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  csat_average DECIMAL(3,2) NOT NULL DEFAULT 0,
  
  -- Distribution data (JSON)
  frt_distribution JSONB NOT NULL DEFAULT '{}',
  fcr_breakdown JSONB NOT NULL DEFAULT '{}',
  
  -- Weekly trends (JSON arrays)
  weekly_tickets_in JSONB NOT NULL DEFAULT '[]',
  weekly_tickets_resolved JSONB NOT NULL DEFAULT '[]',
  frt_trend JSONB NOT NULL DEFAULT '[]',
  aht_trend JSONB NOT NULL DEFAULT '[]',
  fcr_trend JSONB NOT NULL DEFAULT '[]',
  csat_trend JSONB NOT NULL DEFAULT '[]',
  
  -- Metadata
  data_source VARCHAR(20) NOT NULL DEFAULT 'zendesk',
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(week_start_date, week_end_date, brand)
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_kpi_metrics_week ON kpi_metrics(week_start_date, week_end_date);
CREATE INDEX IF NOT EXISTS idx_kpi_metrics_brand ON kpi_metrics(brand);
CREATE INDEX IF NOT EXISTS idx_kpi_metrics_updated ON kpi_metrics(last_updated);

-- Indexes for zendesk_tickets table
CREATE INDEX IF NOT EXISTS idx_zendesk_tickets_created ON zendesk_tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_zendesk_tickets_solved ON zendesk_tickets(solved_at);
CREATE INDEX IF NOT EXISTS idx_zendesk_tickets_org ON zendesk_tickets(organization_id);
CREATE INDEX IF NOT EXISTS idx_zendesk_tickets_status ON zendesk_tickets(status);
CREATE INDEX IF NOT EXISTS idx_zendesk_tickets_synced ON zendesk_tickets(last_synced);

-- Drop existing kpis table if it exists
DROP TABLE IF EXISTS kpis;

-- Simple kpis table for storing processed KPI data by brand
CREATE TABLE kpis (
  id SERIAL PRIMARY KEY,
  brand VARCHAR(50) NOT NULL,
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  week_label VARCHAR(20) NOT NULL,
  tickets_in INTEGER NOT NULL,
  tickets_resolved INTEGER NOT NULL,
  frt_median DECIMAL(10,2) NOT NULL,
  aht DECIMAL(10,2) NOT NULL,
  fcr_percent DECIMAL(5,2) NOT NULL,
  frt_distribution JSONB NOT NULL,
  fcr_breakdown JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(brand, week_start_date, week_end_date)
);

-- Index for kpis table
CREATE INDEX IF NOT EXISTS idx_kpis_brand_created_at ON kpis(brand, created_at DESC);

-- RLS (Row Level Security) - adjust as needed
ALTER TABLE kpi_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpis ENABLE ROW LEVEL SECURITY;

-- Allow all operations for now (adjust based on your security needs)
CREATE POLICY "Allow all operations on kpi_metrics" ON kpi_metrics
  FOR ALL USING (true);

CREATE POLICY "Allow all operations on kpis" ON kpis
  FOR ALL USING (true);
