CREATE TABLE IF NOT EXISTS league_roster_slots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  league_id INT NOT NULL,

  slot_code VARCHAR(20) NOT NULL, -- C, 1B, 2B, 3B, SS, OF, UTIL, SP, RP, P, BN, IL, NA
  slot_count INT NOT NULL,
  slot_group ENUM('hitter','pitcher','bench','il','na') NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,

  -- Used for “roster spots remaining” + hard max bid.
  -- Set FALSE for IL/NA (and anything you don’t need to fill during the draft).
  counts_toward_remaining_roster BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_league_slot (league_id, slot_code),
  INDEX idx_league_slot_group (league_id, slot_group, sort_order),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
