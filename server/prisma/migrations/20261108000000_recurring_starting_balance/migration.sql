ALTER TABLE "User" ADD COLUMN "startingBalance" DECIMAL(19,2) NOT NULL DEFAULT 0;
CREATE TABLE "RecurringRule" (
 "id" UUID NOT NULL, "userId" UUID NOT NULL, "categoryId" UUID NOT NULL,
 "amount" DECIMAL(19,2) NOT NULL, "type" "TransactionType" NOT NULL,
 "description" VARCHAR(500), "day" SMALLINT NOT NULL, "nextDate" DATE NOT NULL,
 "active" BOOLEAN NOT NULL DEFAULT true,
 CONSTRAINT "RecurringRule_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "RecurringRule_amount_positive" CHECK ("amount" > 0),
 CONSTRAINT "RecurringRule_day_valid" CHECK ("day" BETWEEN 1 AND 31)
);
CREATE UNIQUE INDEX "RecurringRule_id_userId_key" ON "RecurringRule"("id", "userId");
CREATE INDEX "RecurringRule_active_nextDate_idx" ON "RecurringRule"("active", "nextDate");
CREATE INDEX "RecurringRule_userId_idx" ON "RecurringRule"("userId");
CREATE INDEX "RecurringRule_categoryId_userId_type_idx" ON "RecurringRule"("categoryId", "userId", "type");
ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_categoryId_userId_type_fkey" FOREIGN KEY ("categoryId", "userId", "type") REFERENCES "Category"("id", "userId", "type") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Transaction" ADD COLUMN "recurringId" UUID, ADD COLUMN "occurrenceMonth" DATE;
CREATE UNIQUE INDEX "Transaction_recurringId_occurrenceMonth_key" ON "Transaction"("recurringId", "occurrenceMonth");
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_recurringId_userId_fkey" FOREIGN KEY ("recurringId", "userId") REFERENCES "RecurringRule"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_recurring_pair" CHECK (("recurringId" IS NULL) = ("occurrenceMonth" IS NULL));

CREATE TABLE "RecurringOccurrence" (
 "recurringId" UUID NOT NULL, "month" DATE NOT NULL,
 CONSTRAINT "RecurringOccurrence_pkey" PRIMARY KEY ("recurringId", "month"),
 CONSTRAINT "RecurringOccurrence_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "RecurringRule"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
