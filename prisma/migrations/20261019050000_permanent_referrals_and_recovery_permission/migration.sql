INSERT INTO "permissions" (id, code, description) VALUES (gen_random_uuid(), 'member:cash:remit', 'Submit evidence for own previously collected Foundation funds') ON CONFLICT (code) DO NOTHING;
INSERT INTO "role_permissions" ("roleId", "permissionId") SELECT r.id, p.id FROM "roles" r CROSS JOIN "permissions" p WHERE r.code IN ('MEMBER', 'ADMIN') AND p.code = 'member:cash:remit' ON CONFLICT DO NOTHING;
CREATE FUNCTION foundation_permanent_referral() RETURNS trigger AS $$
BEGIN
 IF OLD."referralCode" IS DISTINCT FROM NEW."referralCode" THEN
  RAISE EXCEPTION 'Coordinator referral codes are permanent';
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER coordinator_permanent_referral BEFORE UPDATE OF "referralCode" ON "coordinators" FOR EACH ROW EXECUTE FUNCTION foundation_permanent_referral();
INSERT INTO "scheme_settings" (id, key) VALUES (gen_random_uuid(), 'planPaymentDueDays') ON CONFLICT (key) DO NOTHING;
INSERT INTO "scheme_setting_versions" (id, "settingId", value, "effectiveFrom", "createdAt") SELECT gen_random_uuid(), id, '30'::jsonb, '2026-01-01'::timestamp, CURRENT_TIMESTAMP FROM "scheme_settings" WHERE key = 'planPaymentDueDays' ON CONFLICT ("settingId", "effectiveFrom") DO NOTHING;
