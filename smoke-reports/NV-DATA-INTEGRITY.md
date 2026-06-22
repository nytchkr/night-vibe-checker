# NV-DATA-INTEGRITY

Started: 2026-06-22T15:10:40.422Z
Completed: 2026-06-22T15:10:42.629Z
Stale signal cutoff: 2026-06-20T15:10:40.450Z

## Before Fixes

### venues

- OK: venues where lat IS NULL OR lng IS NULL: 0
- OK: venues where place_id IS NULL OR place_id = '': 0
- OK: venues where place_id LIKE 'fallback:%': 0
- OK: venues where name IS NULL OR name = '': 0
- OK: venues where category IS NULL: 0
- ISSUE: venues where photo_url IS NULL OR photo_url = '': 3
- ISSUE: venues where besttime_venue_id IS NULL: 16
- ISSUE: venues where opening_hours IS NULL: 7

### venue_signals

- OK: venue_signals where venue_id NOT IN venues: 0
- OK: venue_signals where updated_at < NOW() - INTERVAL '48 hours': 0
- OK: venue_signals where busyness_0_100 < 0 OR busyness_0_100 > 100: 0
- ISSUE: venue_signals where mf_ratio < 0 OR mf_ratio > 1: 37

### check_ins

- ISSUE: check_ins where venue_id NOT IN venues: 85
- ISSUE: check_ins where user_id IS NULL: 292
- OK: check_ins where created_at > NOW(): 0

## Auto-Fixes

- Deleted fallback venues: 0
- Deleted venue_signals attached to fallback venues before purge: 0
- Deleted check_ins attached to fallback venues before purge: 0
- Deleted orphaned venue_signals after fallback purge: 0
- Deleted orphaned check_ins after fallback purge: 85

## After Fixes

### venues

- OK: venues where lat IS NULL OR lng IS NULL: 0
- OK: venues where place_id IS NULL OR place_id = '': 0
- OK: venues where place_id LIKE 'fallback:%': 0
- OK: venues where name IS NULL OR name = '': 0
- OK: venues where category IS NULL: 0
- ISSUE: venues where photo_url IS NULL OR photo_url = '': 3
- ISSUE: venues where besttime_venue_id IS NULL: 16
- ISSUE: venues where opening_hours IS NULL: 7

### venue_signals

- OK: venue_signals where venue_id NOT IN venues: 0
- OK: venue_signals where updated_at < NOW() - INTERVAL '48 hours': 0
- OK: venue_signals where busyness_0_100 < 0 OR busyness_0_100 > 100: 0
- ISSUE: venue_signals where mf_ratio < 0 OR mf_ratio > 1: 37

### check_ins

- OK: check_ins where venue_id NOT IN venues: 0
- ISSUE: check_ins where user_id IS NULL: 207
- OK: check_ins where created_at > NOW(): 0
