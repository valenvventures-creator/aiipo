-- Provisions Netlify Database for this project on deploy (same convention as the other Thought
-- Authorities sites). The app creates and upgrades its remaining tables itself on first use (src/db.js).
CREATE TABLE IF NOT EXISTS "ta_meta" (
	"key" text PRIMARY KEY,
	"value" text NOT NULL
);
