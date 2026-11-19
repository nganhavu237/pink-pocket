CREATE TABLE "CategoryBudget" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "categoryId" UUID NOT NULL,
  "type" "TransactionType" NOT NULL DEFAULT 'EXPENSE',
  "amount" DECIMAL(19,2) NOT NULL,
  "month" SMALLINT NOT NULL,
  "year" SMALLINT NOT NULL,
  CONSTRAINT "CategoryBudget_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CategoryBudget_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "CategoryBudget_month_check" CHECK ("month" BETWEEN 1 AND 12),
  CONSTRAINT "CategoryBudget_year_check" CHECK ("year" BETWEEN 1 AND 9999),
  CONSTRAINT "CategoryBudget_type_check" CHECK ("type" = 'EXPENSE')
);
CREATE UNIQUE INDEX "CategoryBudget_userId_year_month_categoryId_key" ON "CategoryBudget"("userId", "year", "month", "categoryId");
CREATE INDEX "CategoryBudget_categoryId_userId_type_idx" ON "CategoryBudget"("categoryId", "userId", "type");
ALTER TABLE "CategoryBudget" ADD CONSTRAINT "CategoryBudget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CategoryBudget" ADD CONSTRAINT "CategoryBudget_categoryId_userId_type_fkey" FOREIGN KEY ("categoryId", "userId", "type") REFERENCES "Category"("id", "userId", "type") ON DELETE NO ACTION ON UPDATE NO ACTION;
