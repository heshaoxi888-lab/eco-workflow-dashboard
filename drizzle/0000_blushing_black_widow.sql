CREATE TABLE `activity_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`target` text,
	`details` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_seen_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_workspace_email_idx` ON `members` (`workspace_id`,`email`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`state_json` text,
	`updated_at` integer NOT NULL,
	`updated_by` text
);
