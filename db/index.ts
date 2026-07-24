export type AppEnv = {
  DB: D1Database;
  TEAM_DOMAIN?: string;
  POLICY_AUD?: string;
  DEV_USER_EMAIL?: string;
  ENVIRONMENT?: string;
};

export const WORKSPACE_ID = "eco-main";

export async function ensureSchema(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 0,
      state_json TEXT,
      updated_at INTEGER NOT NULL,
      updated_by TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('owner','admin','editor','viewer')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_seen_at INTEGER
    )`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS members_workspace_email_idx ON members(workspace_id, email)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      actor_email TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      details TEXT,
      created_at INTEGER NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS activity_logs_workspace_created_idx ON activity_logs(workspace_id, created_at DESC)")
  ]);
  await db.prepare(
    "INSERT OR IGNORE INTO workspaces (id, name, version, state_json, updated_at) VALUES (?, ?, 0, NULL, ?)"
  ).bind(WORKSPACE_ID, "ECO 内容运营团队", Date.now()).run();
}
