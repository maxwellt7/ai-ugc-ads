ALTER TABLE `video_jobs` MODIFY COLUMN `duration` int NOT NULL DEFAULT 15;--> statement-breakpoint
ALTER TABLE `video_jobs` ADD `feedback` text;