CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`snapshot_json` text,
	`user_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cms_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text DEFAULT '{}' NOT NULL,
	`updated_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inquiries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`partner_name` text,
	`email` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`event_type` text NOT NULL,
	`event_date` text,
	`location` text DEFAULT '' NOT NULL,
	`guest_count` integer,
	`service` text DEFAULT '' NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`extra_json` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`follow_up_at` text,
	`handled` integer DEFAULT false NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inquiry_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`inquiry_id` integer NOT NULL,
	`note` text NOT NULL,
	`author_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`mime_type` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`alt_text` text DEFAULT '' NOT NULL,
	`original_key` text,
	`thumbnail_key` text,
	`mobile_key` text,
	`desktop_key` text,
	`external_url` text,
	`custom_thumbnail_media_id` integer,
	`width` integer,
	`height` integer,
	`duration` integer,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`project_id` integer,
	`visible` integer DEFAULT true NOT NULL,
	`deleted_at` text,
	`uploaded_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `project_sections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`section_key` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`intro` text DEFAULT '' NOT NULL,
	`media_json` text DEFAULT '[]' NOT NULL,
	`videos_json` text DEFAULT '[]' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`people_names` text DEFAULT '' NOT NULL,
	`slug` text NOT NULL,
	`category` text DEFAULT 'Autre' NOT NULL,
	`project_date` text,
	`location` text DEFAULT '' NOT NULL,
	`excerpt` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`cover_media_id` integer,
	`gallery_json` text DEFAULT '[]' NOT NULL,
	`videos_json` text DEFAULT '[]' NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`seo_title` text DEFAULT '' NOT NULL,
	`seo_description` text DEFAULT '' NOT NULL,
	`seo_image_media_id` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`deleted_at` text,
	`updated_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_slug_unique` ON `projects` (`slug`);--> statement-breakpoint
CREATE TABLE `services` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`image_media_id` integer,
	`cta` text DEFAULT 'Découvrir' NOT NULL,
	`cta_url` text DEFAULT '/contact' NOT NULL,
	`price` text,
	`price_prefix` text,
	`visible` integer DEFAULT true NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`deleted_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `team_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text DEFAULT '' NOT NULL,
	`role` text NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`photo_media_id` integer,
	`visible` integer DEFAULT true NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`deleted_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
