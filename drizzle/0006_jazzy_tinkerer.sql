ALTER TABLE `briefs` ADD `adStyle` enum('ugc','animated','direct_response') DEFAULT 'ugc' NOT NULL;--> statement-breakpoint
ALTER TABLE `stitch_jobs` ADD `thumbstopperUrl` text;--> statement-breakpoint
ALTER TABLE `stitch_jobs` ADD `thumbstopperText` text;--> statement-breakpoint
ALTER TABLE `video_jobs` ADD `audioQcStatus` enum('pending','passed','failed','skipped') DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `video_jobs` ADD `audioQcTranscript` text;