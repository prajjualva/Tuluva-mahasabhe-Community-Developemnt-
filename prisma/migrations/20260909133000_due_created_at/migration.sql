-- FIFO contribution settlement requires a durable creation order, not a browser timestamp.
ALTER TABLE "dues" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
