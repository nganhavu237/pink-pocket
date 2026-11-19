CREATE TABLE "Task" (
 "id" UUID NOT NULL, "userId" UUID NOT NULL, "name" VARCHAR(200) NOT NULL,
 "dueDate" DATE, "dueTime" VARCHAR(5), "completed" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "Task_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "Task_name_nonempty" CHECK (length(btrim("name")) > 0),
 CONSTRAINT "Task_dueTime_valid" CHECK ("dueTime" IS NULL OR "dueTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
CREATE INDEX "Task_userId_completed_createdAt_idx" ON "Task"("userId", "completed", "createdAt");
ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
