CREATE TABLE IF NOT EXISTS ticket_overview_cache (
  id BIGSERIAL PRIMARY KEY,
  brand TEXT,
  payload JSONB NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE ticket_overview_cache
ADD COLUMN IF NOT EXISTS brand TEXT;

CREATE INDEX IF NOT EXISTS idx_ticket_overview_cache_brand ON ticket_overview_cache(brand);
CREATE INDEX IF NOT EXISTS idx_ticket_overview_cache_updated ON ticket_overview_cache(last_updated DESC);
