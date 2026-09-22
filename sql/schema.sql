-- PostgreSQL / Supabase 建表脚本（部署时用）
-- 本地开发默认使用 SQLite（backend 自动建表）

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(20) UNIQUE NOT NULL,
  phone VARCHAR(20) NOT NULL,
  password_hash TEXT NOT NULL,
  nickname VARCHAR(50),
  credit_score INT DEFAULT 100,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id),
  courier_id INT REFERENCES users(id),
  pickup_code VARCHAR(50) NOT NULL,
  phone_last4 CHAR(4) NOT NULL,
  dorm_building VARCHAR(20) NOT NULL,
  express_company VARCHAR(20),
  package_size VARCHAR(10) DEFAULT 'small',
  reward DECIMAL(5,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  paid_offline BOOLEAN DEFAULT FALSE,
  pickup_photo_url TEXT,
  delivery_photo_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  accepted_at TIMESTAMP,
  picked_at TIMESTAMP,
  delivered_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id),
  from_user_id INT NOT NULL REFERENCES users(id),
  to_user_id INT NOT NULL REFERENCES users(id),
  rating INT CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_courier ON orders(courier_id);
