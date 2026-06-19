-- Add crowd_feel for M/F ratio signal
ALTER TABLE check_ins
ADD COLUMN IF NOT EXISTS crowd_feel TEXT
CHECK (crowd_feel IN ('mostly_male', 'mostly_female', 'balanced', 'mixed'));

-- Add hidden flag for admin moderation
ALTER TABLE check_ins
ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for filtering hidden records in public queries
CREATE INDEX IF NOT EXISTS idx_check_ins_hidden ON check_ins(hidden) WHERE hidden = FALSE;
