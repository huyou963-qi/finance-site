import assert from "node:assert/strict";
import { it } from "node:test";
import { GET, POST } from "@/app/api/user/event-packs/route";
import { POST as issue, DELETE as revoke } from "@/app/api/user/event-packs/credential/route";
it("retired private event and credential endpoints return 410 without account or database access", async () => {
  for (const handler of [GET, POST, issue, revoke]) {
    const result = handler();
    assert.equal(result.status, 410);
    assert.equal(result.headers.get("cache-control"), "private, no-store");
    assert.match((await result.json()).error, /云同步已取消/);
  }
});
