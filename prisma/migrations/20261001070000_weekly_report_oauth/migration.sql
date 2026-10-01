CREATE TABLE "public"."WeeklyOAuthConsent" (
  "nonceHash" VARCHAR(64) NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL,
  "sessionHash" VARCHAR(64) NOT NULL, "clientId" TEXT NOT NULL,
  "redirectUri" TEXT NOT NULL, "resource" TEXT NOT NULL, "scope" TEXT NOT NULL,
  "state" VARCHAR(512) NOT NULL, "codeChallenge" VARCHAR(43) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "WeeklyOAuthConsent_expiresAt_idx" ON "public"."WeeklyOAuthConsent"("expiresAt");
CREATE INDEX "WeeklyOAuthConsent_userId_idx" ON "public"."WeeklyOAuthConsent"("userId");
CREATE TABLE "public"."WeeklyOAuthGrant" (
  "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL, "resource" TEXT NOT NULL, "scope" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3),
  CONSTRAINT "WeeklyOAuthGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "WeeklyOAuthGrant_userId_idx" ON "public"."WeeklyOAuthGrant"("userId");
CREATE TABLE "public"."WeeklyOAuthCredential" (
  "hash" VARCHAR(64) NOT NULL PRIMARY KEY, "kind" VARCHAR(16) NOT NULL,
  "grantId" TEXT NOT NULL, "redirectUri" TEXT, "codeChallenge" VARCHAR(43),
  "expiresAt" TIMESTAMP(3) NOT NULL, "consumedAt" TIMESTAMP(3),
  CONSTRAINT "WeeklyOAuthCredential_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "public"."WeeklyOAuthGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WeeklyOAuthCredential_kind_check" CHECK ("kind" IN ('code', 'access', 'refresh'))
);
CREATE INDEX "WeeklyOAuthCredential_grantId_idx" ON "public"."WeeklyOAuthCredential"("grantId");
CREATE INDEX "WeeklyOAuthCredential_expiresAt_idx" ON "public"."WeeklyOAuthCredential"("expiresAt");
