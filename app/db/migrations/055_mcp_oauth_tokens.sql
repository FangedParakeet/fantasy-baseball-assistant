CREATE TABLE IF NOT EXISTS mcp_oauth_tokens (
  id INT NOT NULL DEFAULT 1,
  access_token VARCHAR(128) NOT NULL,
  refresh_token VARCHAR(128) NOT NULL,
  access_token_expires_at DATETIME NOT NULL,
  refresh_token_expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY unique_access_token (access_token),
  UNIQUE KEY unique_refresh_token (refresh_token),
  CONSTRAINT chk_single_row CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
