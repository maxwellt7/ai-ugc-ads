CREATE TABLE `stitch_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`briefId` int NOT NULL,
	`userId` int NOT NULL,
	`shotstackRenderId` varchar(255),
	`status` enum('pending','queued','fetching','rendering','saving','done','failed') NOT NULL DEFAULT 'pending',
	`finalVideoUrl` text,
	`errorMessage` text,
	`segmentCount` int NOT NULL,
	`aspectRatio` varchar(20) NOT NULL DEFAULT '9:16',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stitch_jobs_id` PRIMARY KEY(`id`)
);
