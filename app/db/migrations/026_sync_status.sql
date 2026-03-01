CREATE TABLE IF NOT EXISTS sync_status (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sync_name VARCHAR(100) UNIQUE,
  status ENUM('pending', 'success', 'error') DEFAULT 'pending',
  message TEXT,
  last_run DATETIME,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
