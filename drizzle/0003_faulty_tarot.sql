CREATE TABLE `itemAliases` (
	`id` text PRIMARY KEY NOT NULL,
	`itemId` text NOT NULL,
	`alias` text NOT NULL,
	FOREIGN KEY (`itemId`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `placeAliases` (
	`id` text PRIMARY KEY NOT NULL,
	`placeName` text NOT NULL,
	`alias` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sourceAliases` (
	`id` text PRIMARY KEY NOT NULL,
	`sourceName` text NOT NULL,
	`alias` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `note` text;