CREATE TABLE `briefs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`productName` varchar(255) NOT NULL,
	`productDescription` text NOT NULL,
	`targetAudienceAge` varchar(100) NOT NULL,
	`targetAudienceGender` varchar(100) NOT NULL,
	`targetAudienceLifestyle` varchar(255) NOT NULL,
	`adGoal` enum('awareness','conversion','retention') NOT NULL,
	`toneVibe` varchar(255) NOT NULL,
	`segmentCount` int NOT NULL,
	`scriptConcept` text NOT NULL,
	`productImageUrl` text,
	`imageAnalysis` text,
	`generatedBrief` text NOT NULL,
	`pinterestLinks` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `briefs_id` PRIMARY KEY(`id`)
);
