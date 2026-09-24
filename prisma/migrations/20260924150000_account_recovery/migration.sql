-- 邮箱找回用户名 / 重置密码。令牌仅以 SHA-256 保存，且每用户每种用途只保留一个有效请求。
CREATE TABLE "public"."account_recovery_request" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_recovery_request_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_recovery_request_token_hash_key"
ON "public"."account_recovery_request"("token_hash");

CREATE UNIQUE INDEX "account_recovery_request_userId_kind_key"
ON "public"."account_recovery_request"("userId", "kind");

CREATE INDEX "account_recovery_request_expires_at_idx"
ON "public"."account_recovery_request"("expires_at");

ALTER TABLE "public"."account_recovery_request"
ADD CONSTRAINT "account_recovery_request_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
