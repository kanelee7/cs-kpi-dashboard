CREATE TABLE IF NOT EXISTS dev_summary_cache (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL UNIQUE,
  brand TEXT,
  status TEXT NOT NULL,
  subject TEXT NOT NULL,
  one_line_summary TEXT NOT NULL,
  one_line_summary_ko TEXT NOT NULL,
  uid TEXT,
  wallet TEXT,
  skin_id TEXT,
  txh TEXT,
  merchant_id TEXT,
  drago_id TEXT,
  summary TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dev_summary_cache_brand ON dev_summary_cache(brand);
CREATE INDEX IF NOT EXISTS idx_dev_summary_cache_status ON dev_summary_cache(status);
CREATE INDEX IF NOT EXISTS idx_dev_summary_cache_updated ON dev_summary_cache(last_updated DESC);
