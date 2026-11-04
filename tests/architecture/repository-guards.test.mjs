import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");

function walk(directory, predicate = () => true) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(path, predicate));
    else if (predicate(path)) files.push(path);
  }
  return files;
}

function source(path) {
  return readFileSync(path, "utf8");
}

const codeFile = (path) => [".ts", ".tsx"].includes(extname(path));

test("client bundles do not read server-only environment variables", () => {
  const violations = [];
  for (const file of walk(resolve(root, "src"), codeFile)) {
    const text = source(file);
    if (!/^\s*["']use client["'];?/m.test(text)) continue;
    const variables = [...text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)]
      .map((match) => match[1])
      .filter((name) => !name.startsWith("NEXT_PUBLIC_"));
    if (variables.length) violations.push(`${file}: ${variables.join(", ")}`);
  }
  assert.deepEqual(violations, [], `server secrets referenced by client code:\n${violations.join("\n")}`);
});

test("every admin API route enforces an admin or scoped permission guard", () => {
  const apiRoot = resolve(root, "src", "app", "api", "admin");
  const violations = walk(apiRoot, (path) => path.endsWith("route.ts"))
    .filter((file) => !/\brequireAdmin(?:Permission)?\s*\(/.test(source(file)));
  assert.deepEqual(violations, [], `admin routes without an admin permission guard:\n${violations.join("\n")}`);
});

test("admin API routes use canonical requireAdmin from @/lib/auth/requireAdmin", () => {
  const apiRoot = resolve(root, "src", "app", "api", "admin");
  const violations = walk(apiRoot, (path) => path.endsWith("route.ts")).filter((file) => {
    const text = source(file);
    return /\brequireAdmin\b/.test(text) && /from\s+["']@\/lib\/api\/eventAuth["']/.test(text);
  });
  assert.deepEqual(
    violations,
    [],
    `admin routes still import requireAdmin from eventAuth:\n${violations.join("\n")}`,
  );
});

test("open SSRF proxy-example route is removed", () => {
  assert.equal(
    walk(resolve(root, "src", "app", "api"), (path) => path.endsWith("route.ts")).some((file) =>
      file.includes(`${"proxy-example"}`),
    ),
    false,
  );
});

test("middleware attaches x-request-id and health route pings the database", () => {
  const middleware = source(resolve(root, "src", "middleware.ts"));
  const health = source(resolve(root, "src", "app", "api", "health", "route.ts"));
  assert.match(middleware, /x-request-id|REQUEST_ID_HEADER/);
  assert.match(health, /prisma\.\$queryRaw/);
  assert.match(health, /ok:\s*true/);
});

test("pages directly rendering useSearchParams clients provide Suspense", () => {
  const violations = [];
  const pages = walk(resolve(root, "src", "app"), (path) => path.endsWith("page.tsx"));
  for (const page of pages) {
    const pageText = source(page);
    const localImports = [...pageText.matchAll(/from\s+["'](\.\.?\/[^"']+)["']/g)];
    const importsSearchParamsClient = localImports.some((match) => {
      const base = resolve(dirname(page), match[1]);
      const candidates = [base, `${base}.ts`, `${base}.tsx`, resolve(base, "index.ts"), resolve(base, "index.tsx")];
      return candidates.some((candidate) => {
        try {
          return /\buseSearchParams\s*\(/.test(source(candidate));
        } catch {
          return false;
        }
      });
    });
    if (importsSearchParamsClient && !/<Suspense\b/.test(pageText)) violations.push(page);
  }
  assert.deepEqual(violations, [], `pages missing Suspense around useSearchParams clients:\n${violations.join("\n")}`);
});

test("production source contains no committed private-key blocks", () => {
  const productionRoots = ["src", "scripts", "prisma"].map((directory) => resolve(root, directory));
  const violations = productionRoots
    .flatMap((directory) => walk(directory, codeFile))
    .filter((file) => /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source(file)));
  assert.deepEqual(violations, [], `private keys found in source files:\n${violations.join("\n")}`);
});

test("tests do not depend on ignored machine-local runtime files", () => {
  const testFiles = walk(resolve(root, "src"), (path) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(path));
  const forbiddenPath = /["'](?:\.data|\.env(?:\.local)?)(?:[\\/][^"']*)?["']/;
  const violations = testFiles.filter((file) => forbiddenPath.test(source(file)));
  assert.deepEqual(
    violations,
    [],
    `tests reference ignored local files; use inline data or committed fixtures:\n${violations.join("\n")}`,
  );
});
