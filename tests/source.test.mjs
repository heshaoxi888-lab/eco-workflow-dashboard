import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Cloudflare collaboration surface is wired", async () => {
  const html = await readFile(new URL("../public/dashboard.html", import.meta.url), "utf8");
  assert.match(html, /Cloudflare D1/);
  assert.match(html, /\/api\/bootstrap/);
  assert.doesNotMatch(html, /api\.jsonbin\.io/);
});

test("D1 bindings and schema are declared", async () => {
  const hosting = JSON.parse(await readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"));
  assert.equal(hosting.d1, "DB");
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  assert.match(schema, /activityLogs/);
  assert.match(schema, /members/);
});
