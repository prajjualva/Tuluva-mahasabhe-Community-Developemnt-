ALTER TABLE "cash_collections" ADD CONSTRAINT "cash_collections_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
