-- Run once in Cloudflare: D1 > workerpool-db > Console (adds resume fields to accounts)
ALTER TABLE users ADD COLUMN resume_key TEXT;
ALTER TABLE users ADD COLUMN resume_name TEXT;
ALTER TABLE users ADD COLUMN resume_size INTEGER;
