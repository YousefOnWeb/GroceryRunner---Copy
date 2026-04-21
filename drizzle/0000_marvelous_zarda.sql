CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`defaultPrice` real,
	`source` text,
	`timing` text DEFAULT 'Fresh' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orderItems` (
	`id` text PRIMARY KEY NOT NULL,
	`orderId` text NOT NULL,
	`itemId` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unitPrice` real,
	FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`itemId`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`personId` text NOT NULL,
	`targetDate` text NOT NULL,
	`isPaid` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`personId`) REFERENCES `persons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `persons` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`balance` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`personId` text NOT NULL,
	`amount` real NOT NULL,
	`date` text NOT NULL,
	`type` text NOT NULL,
	FOREIGN KEY (`personId`) REFERENCES `persons`(`id`) ON UPDATE no action ON DELETE no action
);
