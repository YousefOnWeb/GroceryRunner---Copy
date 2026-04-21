CREATE TABLE `personAliases` (
	`id` text PRIMARY KEY NOT NULL,
	`personId` text NOT NULL,
	`alias` text NOT NULL,
	FOREIGN KEY (`personId`) REFERENCES `persons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `deliveryPlace` text;--> statement-breakpoint
ALTER TABLE `persons` ADD `typicalPlace` text;