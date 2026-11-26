import { test } from "node:test";
import assert from "node:assert/strict";
import { findArrivalPhrase, isDoorDashSender, parsePhrases, DEFAULT_PHRASES, DEFAULT_IGNORE } from "./matcher.ts";
import { inQuietHours } from "./quiet-hours.ts";
import { encrypt, decrypt, sign, unsign } from "./crypto.ts";

test("matches arrival phrases case-insensitively", () => {
  assert.equal(findArrivalPhrase("Your order from Chipotle HAS ARRIVED", DEFAULT_PHRASES, DEFAULT_IGNORE), "has arrived");
  assert.equal(findArrivalPhrase("Your Dasher’s here", ["your dasher's here"], []), "your dasher's here");
  assert.equal(findArrivalPhrase("Your order is being prepared", DEFAULT_PHRASES, DEFAULT_IGNORE), null);
});

test("ignore phrases suppress marketing mail", () => {
  assert.equal(findArrivalPhrase("40% off — groceries delivered fast", DEFAULT_PHRASES, DEFAULT_IGNORE), null);
});

test("sender check", () => {
  assert.ok(isDoorDashSender("DoorDash <no-reply@doordash.com>"));
  assert.ok(isDoorDashSender("orders@messages.doordash.com"));
  assert.ok(!isDoorDashSender("DoorDash <phish@doordash.com.evil.io>"));
  assert.ok(!isDoorDashSender("notdoordash.com <a@notdoordash.com>"));
});

test("parsePhrases dedupes and trims", () => {
  assert.deepEqual(parsePhrases(" Has Arrived \n\nis outside, has arrived"), ["has arrived", "is outside"]);
});

test("quiet hours wrap midnight", () => {
  const at = (iso: string) => new Date(iso);
  assert.ok(inQuietHours(at("2026-01-01T23:30:00Z"), "22:00", "07:00", "UTC"));
  assert.ok(inQuietHours(at("2026-01-01T06:59:00Z"), "22:00", "07:00", "UTC"));
  assert.ok(!inQuietHours(at("2026-01-01T07:00:00Z"), "22:00", "07:00", "UTC"));
  assert.ok(inQuietHours(at("2026-01-01T13:00:00Z"), "12:00", "14:00", "UTC"));
  assert.ok(!inQuietHours(at("2026-01-01T13:00:00Z"), "08:00", "08:00", "UTC"));
});

test("encrypt/decrypt and sign/unsign round-trip", () => {
  const k = Buffer.alloc(32, 7).toString("base64");
  const c = encrypt("secret-token", k);
  assert.notEqual(c, "secret-token");
  assert.equal(decrypt(c, k), "secret-token");
  const s = sign("me@example.com|123", "shh");
  assert.equal(unsign(s, "shh"), "me@example.com|123");
  assert.equal(unsign(s + "x", "shh"), null);
});
