import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NextRequest } from "next/server";
import { requireSameOrigin, SameOriginError } from "./sameOrigin";

function req(origin: string | null, url = "https://www.gekkotech.cn/api/tools/bookmarks") {
  const headers = new Headers();
  if (origin !== null) headers.set("origin", origin);
  return new NextRequest(url, { method: "PUT", headers });
}

describe("requireSameOrigin", () => {
  it("allows APP_BASE_URL and request origin", () => {
    const previous = process.env.APP_BASE_URL;
    process.env.APP_BASE_URL = "https://www.gekkotech.cn";
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.BILLING_ALLOWED_ORIGINS;
    try {
      requireSameOrigin(req("https://www.gekkotech.cn"));
      requireSameOrigin(req("https://www.gekkotech.cn", "https://www.gekkotech.cn/api/auth/login"));
    } finally {
      if (previous === undefined) delete process.env.APP_BASE_URL;
      else process.env.APP_BASE_URL = previous;
    }
  });

  it("allows configured aliases", () => {
    const previous = process.env.APP_BASE_URL;
    const previousAliases = process.env.BILLING_ALLOWED_ORIGINS;
    process.env.APP_BASE_URL = "https://www.gekkotech.cn";
    process.env.BILLING_ALLOWED_ORIGINS = "https://gekkotech.cn";
    try {
      requireSameOrigin(req("https://gekkotech.cn"));
    } finally {
      if (previous === undefined) delete process.env.APP_BASE_URL;
      else process.env.APP_BASE_URL = previous;
      if (previousAliases === undefined) delete process.env.BILLING_ALLOWED_ORIGINS;
      else process.env.BILLING_ALLOWED_ORIGINS = previousAliases;
    }
  });

  it("rejects missing or foreign origins", () => {
    const previous = process.env.APP_BASE_URL;
    process.env.APP_BASE_URL = "https://www.gekkotech.cn";
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.BILLING_ALLOWED_ORIGINS;
    try {
      assert.throws(() => requireSameOrigin(req(null)), SameOriginError);
      assert.throws(() => requireSameOrigin(req("https://evil.example")), SameOriginError);
      assert.throws(() => requireSameOrigin(req("https://www.gekkotech.cn.evil.example")), SameOriginError);
    } finally {
      if (previous === undefined) delete process.env.APP_BASE_URL;
      else process.env.APP_BASE_URL = previous;
    }
  });
});
