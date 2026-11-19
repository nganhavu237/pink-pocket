CREATE TABLE "MySpacePhoto" (
 "userId" UUID NOT NULL,
 "data" BYTEA NOT NULL,
 "width" INTEGER NOT NULL,
 "height" INTEGER NOT NULL,
 "version" UUID NOT NULL,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "MySpacePhoto_pkey" PRIMARY KEY ("userId"),
 CONSTRAINT "MySpacePhoto_size" CHECK (octet_length("data") BETWEEN 1 AND 5242880),
 CONSTRAINT "MySpacePhoto_dimensions" CHECK ("width" BETWEEN 1 AND 1600 AND "height" BETWEEN 1 AND 1600)
);
ALTER TABLE "MySpacePhoto" ADD CONSTRAINT "MySpacePhoto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
