import assert from "node:assert/strict";
import test from "node:test";
import { decryptTotpSecret, encryptTotpSecret, newTotpSecret, totpCode, verifyTotp } from "./adminMfa";

// RFC 6238 SHA-1 test secret, six-digit display uses the last six digits of the RFC vector.
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

test("TOTP matches the published 59-second SHA-1 vector and accepts one time step of skew", () => {
  assert.equal(totpCode(RFC_SECRET, 59_000), "287082");
  assert.equal(verifyTotp(RFC_SECRET, "287082", 59_000), true);
  assert.equal(verifyTotp(RFC_SECRET, "287082", 89_000), true);
  assert.equal(verifyTotp(RFC_SECRET, "287082", 149_000), false);
  assert.equal(verifyTotp(RFC_SECRET, "12345", 59_000), false);
});

test("admin TOTP secret is encrypted at rest and can be read with the configured key", () => {
  const original = process.env.ADMIN_MFA_ENCRYPTION_KEY;
  process.env.ADMIN_MFA_ENCRYPTION_KEY = "01".repeat(32);
  try {
    const secret = newTotpSecret();
    assert.match(secret, /^[A-Z2-7]{32}$/);
    const encrypted = encryptTotpSecret(secret);
    assert.ok(!encrypted.includes(secret));
    assert.equal(decryptTotpSecret(encrypted), secret);
  } finally {
    if (original === undefined) delete process.env.ADMIN_MFA_ENCRYPTION_KEY;
    else process.env.ADMIN_MFA_ENCRYPTION_KEY = original;
  }
});
