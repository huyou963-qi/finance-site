ALTER TABLE "public"."User"
  ADD COLUMN "status" VARCHAR(16) NOT NULL DEFAULT 'active',
  ADD COLUMN "suspended_at" TIMESTAMP(3),
  ADD COLUMN "suspension_reason" VARCHAR(500),
  ADD COLUMN "admin_totp_secret" TEXT;

ALTER TABLE "public"."User" ADD COLUMN "last_login_at" TIMESTAMP(3);

CREATE INDEX "User_status_createdAt_idx" ON "public"."User"("status", "createdAt");
CREATE INDEX "User_role_createdAt_idx" ON "public"."User"("role", "createdAt");
CREATE INDEX "User_plan_plan_expires_at_idx" ON "public"."User"("plan", "plan_expires_at");

CREATE TABLE "public"."admin_mfa_challenge" (
  "token_hash" VARCHAR(64) NOT NULL,
  "user_id" TEXT NOT NULL,
  "secret" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "admin_mfa_challenge_pkey" PRIMARY KEY ("token_hash")
);
CREATE INDEX "admin_mfa_challenge_user_id_idx" ON "public"."admin_mfa_challenge"("user_id");
CREATE INDEX "admin_mfa_challenge_expires_at_idx" ON "public"."admin_mfa_challenge"("expires_at");
ALTER TABLE "public"."admin_mfa_challenge" ADD CONSTRAINT "admin_mfa_challenge_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "public"."admin_mfa_recovery_code" (
  "code_hash" VARCHAR(64) NOT NULL,
  "user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_mfa_recovery_code_pkey" PRIMARY KEY ("code_hash")
);
CREATE INDEX "admin_mfa_recovery_code_user_id_idx" ON "public"."admin_mfa_recovery_code"("user_id");
ALTER TABLE "public"."admin_mfa_recovery_code" ADD CONSTRAINT "admin_mfa_recovery_code_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "public"."account_auth_event" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "kind" VARCHAR(32) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "account_auth_event_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "account_auth_event_user_id_created_at_idx" ON "public"."account_auth_event"("user_id", "created_at" DESC);
ALTER TABLE "public"."account_auth_event" ADD CONSTRAINT "account_auth_event_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "public"."auth_attempt" (
  "key_hash" VARCHAR(64) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "window_start" TIMESTAMP(3) NOT NULL,
  "locked_until" TIMESTAMP(3),
  CONSTRAINT "auth_attempt_pkey" PRIMARY KEY ("key_hash")
);
CREATE INDEX "auth_attempt_locked_until_idx" ON "public"."auth_attempt"("locked_until");
CREATE INDEX "auth_attempt_window_start_idx" ON "public"."auth_attempt"("window_start");

CREATE TABLE "public"."admin_user_audit" (
  "id" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "actor_username" VARCHAR(64) NOT NULL,
  "target_user_id" TEXT NOT NULL,
  "target_username" VARCHAR(64) NOT NULL,
  "action" VARCHAR(48) NOT NULL,
  "reason" VARCHAR(500),
  "before" JSONB,
  "after" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_user_audit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "admin_user_audit_target_user_id_created_at_idx" ON "public"."admin_user_audit"("target_user_id", "created_at" DESC);
CREATE INDEX "admin_user_audit_actor_id_created_at_idx" ON "public"."admin_user_audit"("actor_id", "created_at" DESC);
