-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'MANAGER', 'AGENT', 'SALES') NOT NULL DEFAULT 'AGENT',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Customer` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `industry` VARCHAR(191) NULL,
    `level` VARCHAR(191) NULL,
    `status` ENUM('ONBOARDING', 'ACTIVE', 'AT_RISK', 'PAUSED', 'ENDED') NOT NULL DEFAULT 'ACTIVE',
    `ownerId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Customer_name_key`(`name`),
    INDEX `Customer_ownerId_status_idx`(`ownerId`, `status`),
    INDEX `Customer_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ServiceIssue` (
    `id` VARCHAR(191) NOT NULL,
    `serviceNo` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `solution` TEXT NULL,
    `channel` ENUM('FEISHU', 'WECHAT', 'DINGTALK', 'PHONE', 'EMAIL', 'FORM', 'OTHER') NOT NULL,
    `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
    `status` ENUM('PENDING', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_INTERNAL', 'RESOLVED', 'CLOSED') NOT NULL DEFAULT 'PENDING',
    `assigneeId` VARCHAR(191) NULL,
    `firstRespondedAt` DATETIME(3) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `slaDueAt` DATETIME(3) NULL,
    `externalSource` VARCHAR(191) NULL,
    `externalId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `ServiceIssue_serviceNo_key`(`serviceNo`),
    INDEX `ServiceIssue_customerId_status_idx`(`customerId`, `status`),
    INDEX `ServiceIssue_assigneeId_status_idx`(`assigneeId`, `status`),
    INDEX `ServiceIssue_slaDueAt_status_idx`(`slaDueAt`, `status`),
    INDEX `ServiceIssue_deletedAt_idx`(`deletedAt`),
    UNIQUE INDEX `ServiceIssue_externalSource_externalId_key`(`externalSource`, `externalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IssueActivity` (
    `id` VARCHAR(191) NOT NULL,
    `issueId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `type` ENUM('CREATED', 'ASSIGNED', 'STATUS_CHANGED', 'COMMENTED', 'UPDATED') NOT NULL,
    `content` TEXT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `IssueActivity_issueId_createdAt_idx`(`issueId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConsumptionDaily` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `product` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(20, 4) NOT NULL,
    `unit` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ConsumptionDaily_date_product_idx`(`date`, `product`),
    UNIQUE INDEX `ConsumptionDaily_customerId_date_product_key`(`customerId`, `date`, `product`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Customer` ADD CONSTRAINT `Customer_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceIssue` ADD CONSTRAINT `ServiceIssue_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceIssue` ADD CONSTRAINT `ServiceIssue_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IssueActivity` ADD CONSTRAINT `IssueActivity_issueId_fkey` FOREIGN KEY (`issueId`) REFERENCES `ServiceIssue`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IssueActivity` ADD CONSTRAINT `IssueActivity_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsumptionDaily` ADD CONSTRAINT `ConsumptionDaily_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
