INSERT INTO ai_context (key_name, content) VALUES
('opponent_analysis', 'You are analysing a fantasy baseball opponent''s team for the upcoming 7-day scoring period.

Given an opponent''s roster, identify:
- Their strongest and weakest positions
- Potential streaming opportunities they might exploit
- Players who could have breakout weeks
- Matchup advantages/disadvantages

Provide actionable insights for setting your lineup against this opponent.')
ON DUPLICATE KEY UPDATE content = VALUES(content);
