CREATE TABLE `admin_users` (
	`email` text PRIMARY KEY NOT NULL,
	`role` text DEFAULT 'administrator' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `inquiries` ADD `priority` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `media` ADD `title` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `media` ADD `caption` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `media` ADD `category` text DEFAULT 'photo' NOT NULL;