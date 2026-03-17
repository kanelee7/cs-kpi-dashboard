CREATE TABLE IF NOT EXISTS sync_job_runs (
  id BIGSERIAL PRIMARY KEY,
  job_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_job_runs_job_name ON sync_job_runs(job_name);
CREATE INDEX IF NOT EXISTS idx_sync_job_runs_status ON sync_job_runs(status);
CREATE INDEX IF NOT EXISTS idx_sync_job_runs_started_at_desc ON sync_job_runs(started_at DESC);
