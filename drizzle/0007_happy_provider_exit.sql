ALTER TABLE `users` ADD `externalAuthProvider` varchar(32);--> statement-breakpoint
ALTER TABLE `users` ADD `externalAuthId` varchar(191);--> statement-breakpoint
CREATE UNIQUE INDEX `users_external_provider_id_idx` ON `users` (`externalAuthProvider`,`externalAuthId`);
--> statement-breakpoint
ALTER TABLE `video_jobs` ADD `idempotencyKey` varchar(128);--> statement-breakpoint
ALTER TABLE `stitch_jobs` ADD `idempotencyKey` varchar(128);
