CREATE TABLE `_ConsumptionMigrationGuard` (`id` INT NOT NULL PRIMARY KEY);
INSERT INTO `_ConsumptionMigrationGuard` (`id`)
SELECT 1 FROM `ConsumptionDaily` LIMIT 1;
INSERT INTO `_ConsumptionMigrationGuard` (`id`) VALUES (1);
DROP TABLE `_ConsumptionMigrationGuard`;

DROP TABLE `ConsumptionDaily`;

CREATE TABLE `ConsumptionAccount` (
  `id` VARCHAR(191) NOT NULL,
  `source` ENUM('DOMESTIC', 'OVERSEAS') NOT NULL,
  `externalId` VARCHAR(191) NOT NULL,
  `displayName` VARCHAR(191) NOT NULL,
  `managerName` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ConsumptionAccount_source_externalId_key` (`source`, `externalId`),
  INDEX `ConsumptionAccount_displayName_idx` (`displayName`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ConsumptionDaily` (
  `id` VARCHAR(191) NOT NULL,
  `accountId` VARCHAR(191) NOT NULL,
  `date` DATE NOT NULL,
  `product` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(20, 4) NOT NULL,
  `unit` VARCHAR(191) NOT NULL DEFAULT 'CNY',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ConsumptionDaily_accountId_date_product_key` (`accountId`, `date`, `product`),
  INDEX `ConsumptionDaily_date_accountId_idx` (`date`, `accountId`),
  INDEX `ConsumptionDaily_date_product_idx` (`date`, `product`),
  CONSTRAINT `ConsumptionDaily_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `ConsumptionAccount` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ConsumptionSourceDay` (
  `id` VARCHAR(191) NOT NULL,
  `source` ENUM('DOMESTIC', 'OVERSEAS') NOT NULL,
  `date` DATE NOT NULL,
  `recordCount` INTEGER NOT NULL,
  `amount` DECIMAL(20, 4) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ConsumptionSourceDay_source_date_key` (`source`, `date`),
  INDEX `ConsumptionSourceDay_date_idx` (`date`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ConsumptionSyncRun` (
  `id` VARCHAR(191) NOT NULL,
  `status` ENUM('RUNNING', 'SUCCESS', 'FAILED') NOT NULL,
  `rangeStart` DATE NOT NULL,
  `rangeEnd` DATE NOT NULL,
  `readCount` INTEGER NOT NULL DEFAULT 0,
  `accountCount` INTEGER NOT NULL DEFAULT 0,
  `rowCount` INTEGER NOT NULL DEFAULT 0,
  `errorSummary` TEXT NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finishedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `ConsumptionSyncRun_status_startedAt_idx` (`status`, `startedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
