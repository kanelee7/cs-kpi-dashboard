-- Create tickets table
CREATE TABLE IF NOT EXISTS tickets (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'open',
  first_response_time INTEGER, -- in minutes
  first_contact_resolved BOOLEAN DEFAULT FALSE
);

-- Create csat_feedback table
CREATE TABLE IF NOT EXISTS csat_feedback (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT REFERENCES tickets(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_resolved_at ON tickets(resolved_at);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_csat_feedback_created_at ON csat_feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_csat_feedback_ticket_id ON csat_feedback(ticket_id);

-- Insert sample data for testing
INSERT INTO tickets (created_at, resolved_at, status, first_response_time, first_contact_resolved) VALUES
  -- Week -4 (4 weeks ago)
  (NOW() - INTERVAL '28 days', NOW() - INTERVAL '27 days', 'resolved', 45, true),
  (NOW() - INTERVAL '28 days', NOW() - INTERVAL '27 days', 'resolved', 120, false),
  (NOW() - INTERVAL '28 days', NOW() - INTERVAL '26 days', 'resolved', 30, true),
  (NOW() - INTERVAL '28 days', NOW() - INTERVAL '26 days', 'resolved', 90, true),
  (NOW() - INTERVAL '28 days', NOW() - INTERVAL '25 days', 'resolved', 60, false),
  
  -- Week -3 (3 weeks ago)
  (NOW() - INTERVAL '21 days', NOW() - INTERVAL '20 days', 'resolved', 35, true),
  (NOW() - INTERVAL '21 days', NOW() - INTERVAL '20 days', 'resolved', 75, true),
  (NOW() - INTERVAL '21 days', NOW() - INTERVAL '19 days', 'resolved', 50, false),
  (NOW() - INTERVAL '21 days', NOW() - INTERVAL '19 days', 'resolved', 25, true),
  (NOW() - INTERVAL '21 days', NOW() - INTERVAL '18 days', 'resolved', 100, false),
  
  -- Week -2 (2 weeks ago)
  (NOW() - INTERVAL '14 days', NOW() - INTERVAL '13 days', 'resolved', 40, true),
  (NOW() - INTERVAL '14 days', NOW() - INTERVAL '13 days', 'resolved', 65, true),
  (NOW() - INTERVAL '14 days', NOW() - INTERVAL '12 days', 'resolved', 55, false),
  (NOW() - INTERVAL '14 days', NOW() - INTERVAL '12 days', 'resolved', 20, true),
  (NOW() - INTERVAL '14 days', NOW() - INTERVAL '11 days', 'resolved', 80, true),
  
  -- Week -1 (1 week ago)
  (NOW() - INTERVAL '7 days', NOW() - INTERVAL '6 days', 'resolved', 30, true),
  (NOW() - INTERVAL '7 days', NOW() - INTERVAL '6 days', 'resolved', 70, true),
  (NOW() - INTERVAL '7 days', NOW() - INTERVAL '5 days', 'resolved', 45, false),
  (NOW() - INTERVAL '7 days', NOW() - INTERVAL '5 days', 'resolved', 15, true),
  (NOW() - INTERVAL '7 days', NOW() - INTERVAL '4 days', 'resolved', 90, true),
  
  -- Current week
  (NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days', 'resolved', 25, true),
  (NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days', 'resolved', 60, true),
  (NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', 'resolved', 35, false),
  (NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', 'resolved', 10, true),
  (NOW() - INTERVAL '1 day', NULL, 'open', NULL, false);

-- Insert sample CSAT feedback
INSERT INTO csat_feedback (ticket_id, rating, comment, created_at) VALUES
  (1, 5, 'Excellent service!', NOW() - INTERVAL '27 days'),
  (2, 4, 'Good support', NOW() - INTERVAL '27 days'),
  (3, 5, 'Very helpful', NOW() - INTERVAL '26 days'),
  (4, 3, 'Could be better', NOW() - INTERVAL '26 days'),
  (5, 4, 'Satisfied', NOW() - INTERVAL '25 days'),
  (6, 5, 'Outstanding!', NOW() - INTERVAL '20 days'),
  (7, 4, 'Good experience', NOW() - INTERVAL '20 days'),
  (8, 3, 'Average', NOW() - INTERVAL '19 days'),
  (9, 5, 'Perfect!', NOW() - INTERVAL '19 days'),
  (10, 2, 'Not satisfied', NOW() - INTERVAL '18 days'),
  (11, 4, 'Good', NOW() - INTERVAL '13 days'),
  (12, 5, 'Excellent', NOW() - INTERVAL '13 days'),
  (13, 3, 'Okay', NOW() - INTERVAL '12 days'),
  (14, 5, 'Amazing', NOW() - INTERVAL '12 days'),
  (15, 4, 'Good service', NOW() - INTERVAL '11 days'),
  (16, 5, 'Perfect resolution', NOW() - INTERVAL '6 days'),
  (17, 4, 'Satisfied', NOW() - INTERVAL '6 days'),
  (18, 3, 'Could improve', NOW() - INTERVAL '5 days'),
  (19, 5, 'Outstanding', NOW() - INTERVAL '5 days'),
  (20, 4, 'Good work', NOW() - INTERVAL '4 days'),
  (21, 5, 'Excellent!', NOW() - INTERVAL '2 days'),
  (22, 4, 'Good support', NOW() - INTERVAL '2 days'),
  (23, 3, 'Average', NOW() - INTERVAL '1 day'),
  (24, 5, 'Perfect!', NOW() - INTERVAL '1 day');
