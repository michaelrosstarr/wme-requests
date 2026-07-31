-- Per-user country access: a user is either "global" (sees/manages everything, the
-- previous behaviour for every existing account) or scoped to a specific set of countries.
-- Apply with: wrangler d1 migrations apply wme-requests

ALTER TABLE "user" ADD COLUMN "is_global" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS user_countries (
  user_id    TEXT    NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  country_id INTEGER NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, country_id)
);

CREATE INDEX IF NOT EXISTS idx_user_countries_user ON user_countries(user_id);
