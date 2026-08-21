-- CreateTable
CREATE TABLE `FeishuHandoffProfile` (
    `id` VARCHAR(191) NOT NULL,
    `externalRecordId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NULL,
    `customerName` VARCHAR(191) NOT NULL,
    `normalizedCustomerName` VARCHAR(191) NOT NULL,
    `deploymentType` VARCHAR(191) NULL,
    `deploymentChecklistMasked` TEXT NULL,
    `saasSites` JSON NULL,
    `featureUsage` JSON NULL,
    `logCollection` JSON NULL,
    `apmProbes` JSON NULL,
    `rumApps` JSON NULL,
    `handoffPeople` JSON NULL,
    `logCollectionNotes` TEXT NULL,
    `apmNotes` TEXT NULL,
    `rumNotes` TEXT NULL,
    `customFeatures` TEXT NULL,
    `importantIssues` TEXT NULL,
    `legacyIssues` TEXT NULL,
    `communicationChannel` TEXT NULL,
    `contactInfo` TEXT NULL,
    `handoffAt` DATETIME(3) NULL,
    `handoffStatus` VARCHAR(191) NULL,
    `rawFieldsMasked` JSON NOT NULL,
    `sourceCreatedAt` DATETIME(3) NULL,
    `sourceUpdatedAt` DATETIME(3) NULL,
    `syncedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FeishuHandoffProfile_externalRecordId_key`(`externalRecordId`),
    UNIQUE INDEX `FeishuHandoffProfile_customerId_key`(`customerId`),
    INDEX `FeishuHandoffProfile_customerId_deletedAt_idx`(`customerId`, `deletedAt`),
    INDEX `FeishuHandoffProfile_normalizedCustomerName_deletedAt_idx`(`normalizedCustomerName`, `deletedAt`),
    INDEX `FeishuHandoffProfile_handoffStatus_handoffAt_idx`(`handoffStatus`, `handoffAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FeishuHandoffSecret` (
    `id` VARCHAR(191) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `fieldName` VARCHAR(191) NOT NULL,
    `ciphertext` LONGTEXT NOT NULL,
    `iv` VARCHAR(191) NOT NULL,
    `authTag` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FeishuHandoffSecret_profileId_fieldName_key`(`profileId`, `fieldName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SensitiveAccessAudit` (
    `id` VARCHAR(191) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `customerIdSnapshot` VARCHAR(191) NULL,
    `customerNameSnapshot` VARCHAR(191) NOT NULL,
    `externalRecordIdSnapshot` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `fieldName` VARCHAR(191) NOT NULL,
    `ipAddress` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SensitiveAccessAudit_profileId_createdAt_idx`(`profileId`, `createdAt`),
    INDEX `SensitiveAccessAudit_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HandoffSyncRun` (
    `id` VARCHAR(191) NOT NULL,
    `status` ENUM('RUNNING', 'SUCCESS', 'FAILED') NOT NULL,
    `readCount` INTEGER NOT NULL DEFAULT 0,
    `createdCount` INTEGER NOT NULL DEFAULT 0,
    `updatedCount` INTEGER NOT NULL DEFAULT 0,
    `unlinkedCount` INTEGER NOT NULL DEFAULT 0,
    `deletedCount` INTEGER NOT NULL DEFAULT 0,
    `failedCount` INTEGER NOT NULL DEFAULT 0,
    `errorSummary` TEXT NULL,
    `requestedById` VARCHAR(191) NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `HandoffSyncRun_status_startedAt_idx`(`status`, `startedAt`),
    INDEX `HandoffSyncRun_startedAt_idx`(`startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FeishuHandoffProfile` ADD CONSTRAINT `FeishuHandoffProfile_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FeishuHandoffSecret` ADD CONSTRAINT `FeishuHandoffSecret_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `FeishuHandoffProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SensitiveAccessAudit` ADD CONSTRAINT `SensitiveAccessAudit_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `FeishuHandoffProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SensitiveAccessAudit` ADD CONSTRAINT `SensitiveAccessAudit_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
