-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('UYU', 'USD');

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('BANK', 'CASH', 'WALLET');

-- CreateEnum
CREATE TYPE "PaymentSource" AS ENUM ('ACCOUNT', 'CREDIT_CARD');

-- CreateEnum
CREATE TYPE "ExpenseOrigin" AS ENUM ('MANUAL', 'EMAIL', 'STATEMENT');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('CONFIRMED', 'NEEDS_REVIEW', 'DISCARDED');

-- CreateEnum
CREATE TYPE "IncomeKind" AS ENUM ('FIXED', 'VARIABLE');

-- CreateEnum
CREATE TYPE "Recurrence" AS ENUM ('MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL');

-- CreateEnum
CREATE TYPE "AmountType" AS ENUM ('FIXED', 'RANGE');

-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('PENDING', 'PAID');

-- CreateEnum
CREATE TYPE "StatementSource" AS ENUM ('PDF', 'TEXT', 'MANUAL');

-- CreateEnum
CREATE TYPE "StatementStatus" AS ENUM ('DRAFT', 'IMPORTED', 'FAILED');

-- CreateEnum
CREATE TYPE "GmailStatus" AS ENUM ('ACTIVE', 'REVOKED', 'ERROR');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('IMPORTED', 'NEEDS_REVIEW', 'SKIPPED_DUPLICATE', 'SKIPPED_SENDER', 'SKIPPED_IRRELEVANT', 'ERROR');

-- CreateEnum
CREATE TYPE "SyncKind" AS ENUM ('GMAIL', 'STATEMENT');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'OK', 'PARTIAL', 'ERROR');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "AccountKind" NOT NULL DEFAULT 'BANK',
    "currency" "Currency" NOT NULL,
    "openingBalance" DECIMAL(14,2) NOT NULL,
    "openingDate" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "last4" TEXT,
    "currency" "Currency" NOT NULL,
    "closingDay" INTEGER NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "merchant" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "categoryId" TEXT,
    "source" "PaymentSource" NOT NULL,
    "accountId" TEXT,
    "creditCardId" TEXT,
    "installments" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "origin" "ExpenseOrigin" NOT NULL DEFAULT 'MANUAL',
    "status" "ReviewStatus" NOT NULL DEFAULT 'CONFIRMED',
    "isEstimated" BOOLEAN NOT NULL DEFAULT false,
    "gmailMessageId" TEXT,
    "statementImportId" TEXT,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardInstallment" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "count" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "period" TEXT NOT NULL,
    "dueDate" DATE,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" DATE,
    "isEstimated" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cardId" TEXT,

    CONSTRAINT "CardInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardPayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "creditCardId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "paidAt" DATE NOT NULL,
    "accountId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Income" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "kind" "IncomeKind" NOT NULL DEFAULT 'FIXED',
    "recurrence" "Recurrence",
    "dayOfMonth" INTEGER,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "accountId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Income_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BalanceAdjustment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amountDelta" DECIMAL(14,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringBill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT,
    "amountType" "AmountType" NOT NULL DEFAULT 'FIXED',
    "amountFixed" DECIMAL(14,2),
    "amountMin" DECIMAL(14,2),
    "amountMax" DECIMAL(14,2),
    "currency" "Currency" NOT NULL,
    "frequency" "Recurrence" NOT NULL DEFAULT 'MONTHLY',
    "dueDay" INTEGER NOT NULL,
    "paymentSource" "PaymentSource" NOT NULL DEFAULT 'ACCOUNT',
    "accountId" TEXT,
    "creditCardId" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillOccurrence" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "amountMin" DECIMAL(14,2),
    "amountMax" DECIMAL(14,2),
    "amountActual" DECIMAL(14,2),
    "currency" "Currency" NOT NULL,
    "status" "BillStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" DATE,
    "accountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingsGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "targetAmount" DECIMAL(14,2) NOT NULL,
    "targetDate" DATE NOT NULL,
    "monthlyTarget" DECIMAL(14,2),
    "priority" INTEGER NOT NULL DEFAULT 3,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavingsGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingsContribution" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "accountId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavingsContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatementImport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "creditCardId" TEXT,
    "period" TEXT,
    "source" "StatementSource" NOT NULL,
    "status" "StatementStatus" NOT NULL DEFAULT 'DRAFT',
    "closingDate" DATE,
    "dueDate" DATE,
    "totalAmount" DECIMAL(14,2),
    "currency" "Currency",
    "fileName" TEXT,
    "fileHash" TEXT,
    "rowsParsed" INTEGER NOT NULL DEFAULT 0,
    "rowsImported" INTEGER NOT NULL DEFAULT 0,
    "needsReview" INTEGER NOT NULL DEFAULT 0,
    "importedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatementImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GmailConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accessToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT NOT NULL,
    "status" "GmailStatus" NOT NULL DEFAULT 'ACTIVE',
    "importFrom" DATE NOT NULL,
    "autoSync" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" "SyncStatus",
    "lastSyncError" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GmailConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedGmailMessage" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "threadId" TEXT,
    "subject" TEXT,
    "fromAddress" TEXT,
    "receivedAt" TIMESTAMP(3),
    "status" "MessageStatus" NOT NULL,
    "reason" TEXT,
    "expenseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedGmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "SyncKind" NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "imported" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "needsReview" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_isActive_idx" ON "Account"("userId", "isActive");

-- CreateIndex
CREATE INDEX "CreditCard_userId_isActive_idx" ON "CreditCard"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Category_userId_name_key" ON "Category"("userId", "name");

-- CreateIndex
CREATE INDEX "Expense_userId_date_idx" ON "Expense"("userId", "date");

-- CreateIndex
CREATE INDEX "Expense_userId_status_idx" ON "Expense"("userId", "status");

-- CreateIndex
CREATE INDEX "Expense_userId_creditCardId_idx" ON "Expense"("userId", "creditCardId");

-- CreateIndex
CREATE INDEX "Expense_userId_dedupeKey_idx" ON "Expense"("userId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_userId_gmailMessageId_key" ON "Expense"("userId", "gmailMessageId");

-- CreateIndex
CREATE INDEX "CardInstallment_cardId_period_idx" ON "CardInstallment"("cardId", "period");

-- CreateIndex
CREATE INDEX "CardInstallment_period_isPaid_idx" ON "CardInstallment"("period", "isPaid");

-- CreateIndex
CREATE UNIQUE INDEX "CardInstallment_expenseId_number_key" ON "CardInstallment"("expenseId", "number");

-- CreateIndex
CREATE INDEX "CardPayment_userId_paidAt_idx" ON "CardPayment"("userId", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "CardPayment_creditCardId_period_key" ON "CardPayment"("creditCardId", "period");

-- CreateIndex
CREATE INDEX "Income_userId_isActive_idx" ON "Income"("userId", "isActive");

-- CreateIndex
CREATE INDEX "BalanceAdjustment_userId_date_idx" ON "BalanceAdjustment"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantRule_userId_pattern_key" ON "MerchantRule"("userId", "pattern");

-- CreateIndex
CREATE INDEX "RecurringBill_userId_isActive_idx" ON "RecurringBill"("userId", "isActive");

-- CreateIndex
CREATE INDEX "BillOccurrence_userId_period_idx" ON "BillOccurrence"("userId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "BillOccurrence_billId_period_key" ON "BillOccurrence"("billId", "period");

-- CreateIndex
CREATE INDEX "SavingsGoal_userId_isActive_idx" ON "SavingsGoal"("userId", "isActive");

-- CreateIndex
CREATE INDEX "SavingsContribution_userId_goalId_idx" ON "SavingsContribution"("userId", "goalId");

-- CreateIndex
CREATE INDEX "StatementImport_userId_createdAt_idx" ON "StatementImport"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GmailConnection_userId_key" ON "GmailConnection"("userId");

-- CreateIndex
CREATE INDEX "ProcessedGmailMessage_connectionId_receivedAt_idx" ON "ProcessedGmailMessage"("connectionId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedGmailMessage_connectionId_messageId_key" ON "ProcessedGmailMessage"("connectionId", "messageId");

-- CreateIndex
CREATE INDEX "SyncLog_userId_startedAt_idx" ON "SyncLog"("userId", "startedAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_statementImportId_fkey" FOREIGN KEY ("statementImportId") REFERENCES "StatementImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardInstallment" ADD CONSTRAINT "CardInstallment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardInstallment" ADD CONSTRAINT "CardInstallment_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CreditCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardPayment" ADD CONSTRAINT "CardPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardPayment" ADD CONSTRAINT "CardPayment_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardPayment" ADD CONSTRAINT "CardPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceAdjustment" ADD CONSTRAINT "BalanceAdjustment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceAdjustment" ADD CONSTRAINT "BalanceAdjustment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantRule" ADD CONSTRAINT "MerchantRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantRule" ADD CONSTRAINT "MerchantRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringBill" ADD CONSTRAINT "RecurringBill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringBill" ADD CONSTRAINT "RecurringBill_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringBill" ADD CONSTRAINT "RecurringBill_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringBill" ADD CONSTRAINT "RecurringBill_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillOccurrence" ADD CONSTRAINT "BillOccurrence_billId_fkey" FOREIGN KEY ("billId") REFERENCES "RecurringBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillOccurrence" ADD CONSTRAINT "BillOccurrence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillOccurrence" ADD CONSTRAINT "BillOccurrence_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsContribution" ADD CONSTRAINT "SavingsContribution_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "SavingsGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsContribution" ADD CONSTRAINT "SavingsContribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsContribution" ADD CONSTRAINT "SavingsContribution_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementImport" ADD CONSTRAINT "StatementImport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementImport" ADD CONSTRAINT "StatementImport_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GmailConnection" ADD CONSTRAINT "GmailConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessedGmailMessage" ADD CONSTRAINT "ProcessedGmailMessage_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "GmailConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncLog" ADD CONSTRAINT "SyncLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

