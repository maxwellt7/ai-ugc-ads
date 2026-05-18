ALTER TABLE `briefs` ADD `editedBrief` text;--> statement-breakpoint
ALTER TABLE `briefs` ADD `creatorImageUrl` text;--> statement-breakpoint
ALTER TABLE `briefs` ADD `intakeMode` enum('description','script') DEFAULT 'description' NOT NULL;