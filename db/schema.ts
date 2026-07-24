import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  version: integer("version").notNull().default(0),
  stateJson: text("state_json"),
  updatedAt: integer("updated_at").notNull(),
  updatedBy: text("updated_by")
});

export const members = sqliteTable(
  "members",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role", { enum: ["owner", "admin", "editor", "viewer"] }).notNull(),
    status: text("status", { enum: ["active", "disabled"] }).notNull().default("active"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    lastSeenAt: integer("last_seen_at")
  },
  (table) => [uniqueIndex("members_workspace_email_idx").on(table.workspaceId, table.email)]
);

export const activityLogs = sqliteTable("activity_logs", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  target: text("target"),
  details: text("details"),
  createdAt: integer("created_at").notNull()
});
