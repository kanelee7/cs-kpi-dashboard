CREATE TABLE IF NOT EXISTS voc_insights (
  id BIGSERIAL PRIMARY KEY,
  week_start_date DATE NOT NULL UNIQUE,
  week_end_date DATE NOT NULL,
  iso_week INTEGER NOT NULL,
  brand TEXT,
  week_label VARCHAR(16) NOT NULL,
  top_issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  ticket_summaries JSONB NOT NULL DEFAULT '[]'::jsonb,
  trend_changes TEXT,
  weekly_summary TEXT,
  ticket_count INTEGER NOT NULL DEFAULT 0,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE voc_insights
ADD COLUMN IF NOT EXISTS brand TEXT;

ALTER TABLE voc_insights
ADD COLUMN IF NOT EXISTS ticket_summaries JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE voc_insights
DROP CONSTRAINT IF EXISTS voc_insights_week_start_date_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_voc_insights_brand_week_start
ON voc_insights(brand, week_start_date);

CREATE INDEX IF NOT EXISTS idx_voc_brand ON voc_insights(brand);
CREATE INDEX IF NOT EXISTS idx_voc_insights_week_range ON voc_insights(week_start_date, week_end_date);
CREATE INDEX IF NOT EXISTS idx_voc_insights_last_updated ON voc_insights(last_updated DESC);
