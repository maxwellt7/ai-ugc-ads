CREATE TABLE `video_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`briefId` int NOT NULL,
	`userId` int NOT NULL,
	`segmentIndex` int NOT NULL,
	`prompt` text NOT NULL,
	`wavespeedTaskId` varchar(255),
	`status` enum('pending','created','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`videoUrl` text,
	`errorMessage` text,
	`aspectRatio` varchar(20) NOT NULL DEFAULT '9:16',
	`resolution` varchar(10) NOT NULL DEFAULT '720p',
	`duration` int NOT NULL DEFAULT 5,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `video_jobs_id` PRIMARY KEY(`id`)
);
