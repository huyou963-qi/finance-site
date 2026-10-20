import assert from "node:assert/strict";
import test from "node:test";
import { hasAdminPermission, isStaffRole, type AdminPermission } from "./types";

const permissions: AdminPermission[] = ["users:read", "users:write", "membership:write", "orders:write", "analytics:read", "users:export", "users:batch"];

test("staff roles cannot inherit the superadmin permission set", () => {
  assert.equal(isStaffRole("admin_support"), true);
  assert.equal(isStaffRole("admin_membership"), true);
  assert.equal(isStaffRole("admin_orders"), true);
  assert.deepEqual(permissions.filter((permission) => hasAdminPermission("admin_support", permission)), ["users:read", "analytics:read"]);
  assert.deepEqual(permissions.filter((permission) => hasAdminPermission("admin_membership", permission)), ["users:read", "membership:write", "analytics:read", "users:export", "users:batch"]);
  assert.deepEqual(permissions.filter((permission) => hasAdminPermission("admin_orders", permission)), ["users:read", "orders:write"]);
  assert.deepEqual(permissions.filter((permission) => hasAdminPermission("user", permission)), []);
  assert.deepEqual(permissions.filter((permission) => hasAdminPermission("admin", permission)), permissions);
});
