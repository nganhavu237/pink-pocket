ALTER TABLE "Category" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Category" SET "isDefault" = true WHERE
 ("type" = 'EXPENSE' AND "name" IN ('Food','Shopping','Transportation','Bills','Entertainment','Health','Other'))
 OR ("type" = 'INCOME' AND "name" = 'Salary');
-- Keep legacy IDs, transactions and recurring schedules intact; hide from new selections.
UPDATE "Category" SET "isArchived" = true WHERE "type" = 'INCOME' AND "name" = 'Other Income';
