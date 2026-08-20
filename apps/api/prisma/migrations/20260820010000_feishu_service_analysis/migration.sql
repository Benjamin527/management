-- CreateTable
CREATE TABLE `FeishuServiceRecord` (
    `id` VARCHAR(191) NOT NULL,
    `externalRecordId` VARCHAR(191) NOT NULL,
    `serviceRecordNo` VARCHAR(191) NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NULL,
    `customerName` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NULL,
    `questionerRole` VARCHAR(191) NULL,
    `sourceType` VARCHAR(191) NULL,
    `feedbackTypeRaw` VARCHAR(191) NULL,
    `feedbackTypeNormalized` VARCHAR(191) NULL,
    `issueTypeRaw` VARCHAR(191) NULL,
    `issueTypeNormalized` VARCHAR(191) NULL,
    `deploymentType` VARCHAR(191) NULL,
    `ticketId` VARCHAR(191) NULL,
    `summary` TEXT NOT NULL,
    `conclusion` TEXT NULL,
    `satisfaction` INTEGER NULL,
    `sourceStatus` VARCHAR(191) NULL,
    `normalizedStatus` ENUM('RESOLVED', 'CLOSED', 'IN_PROGRESS', 'WAITING_REPLY', 'ESCALATED', 'UNKNOWN', 'OTHER') NOT NULL,
    `firstLineEngineer` VARCHAR(191) NULL,
    `secondLineEngineer` VARCHAR(191) NULL,
    `thirdLineEngineer` VARCHAR(191) NULL,
    `keyIssue` BOOLEAN NOT NULL DEFAULT false,
    `submittedByName` VARCHAR(191) NULL,
    `submittedByOpenId` VARCHAR(191) NULL,
    `submittedAt` DATETIME(3) NULL,
    `rawFields` JSON NOT NULL,
    `sourceCreatedAt` DATETIME(3) NULL,
    `sourceUpdatedAt` DATETIME(3) NULL,
    `syncedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FeishuServiceRecord_externalRecordId_key`(`externalRecordId`),
    INDEX `FeishuServiceRecord_startDate_deletedAt_idx`(`startDate`, `deletedAt`),
    INDEX `FeishuServiceRecord_normalizedStatus_startDate_idx`(`normalizedStatus`, `startDate`),
    INDEX `FeishuServiceRecord_customerId_startDate_idx`(`customerId`, `startDate`),
    INDEX `FeishuServiceRecord_customerName_startDate_idx`(`customerName`, `startDate`),
    INDEX `FeishuServiceRecord_issueTypeNormalized_startDate_idx`(`issueTypeNormalized`, `startDate`),
    INDEX `FeishuServiceRecord_firstLineEngineer_startDate_idx`(`firstLineEngineer`, `startDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ServiceSyncRun` (
    `id` VARCHAR(191) NOT NULL,
    `mode` ENUM('RECENT', 'FULL_YEAR') NOT NULL,
    `status` ENUM('RUNNING', 'SUCCESS', 'FAILED') NOT NULL,
    `rangeStart` DATETIME(3) NOT NULL,
    `rangeEnd` DATETIME(3) NOT NULL,
    `readCount` INTEGER NOT NULL DEFAULT 0,
    `createdCount` INTEGER NOT NULL DEFAULT 0,
    `updatedCount` INTEGER NOT NULL DEFAULT 0,
    `deletedCount` INTEGER NOT NULL DEFAULT 0,
    `failedCount` INTEGER NOT NULL DEFAULT 0,
    `errorSummary` TEXT NULL,
    `requestedById` VARCHAR(191) NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ServiceSyncRun_status_startedAt_idx`(`status`, `startedAt`),
    INDEX `ServiceSyncRun_mode_startedAt_idx`(`mode`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FeishuServiceRecord` ADD CONSTRAINT `FeishuServiceRecord_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
