CREATE TABLE "member_profile_photos" (
    "memberId" UUID NOT NULL,
    "bytes" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "member_profile_photos_pkey" PRIMARY KEY ("memberId"),
    CONSTRAINT "member_profile_photos_bytes_check" CHECK (octet_length("bytes") BETWEEN 1 AND 262144),
    CONSTRAINT "member_profile_photos_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
