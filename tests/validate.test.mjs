import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateSubscription } from "../scripts/validate.mjs";

const subscription = JSON.parse(await readFile(new URL("../subscription.json", import.meta.url), "utf8"));
const invalid = [
  ["missing identifier", (s) => { delete s.id; }, "$.id"],
  ["blank identifier", (s) => { s.id = " "; }, "$.id"],
  ["wrong identifier type", (s) => { s.id = 72; }, "$.id"],
  ["invalid identifier characters", (s) => { s.groups[0].rules[0].key = "Bad Key"; }, ".key"],
  ["missing name", (s) => { delete s.groups[0].name; }, ".name"],
  ["non-boolean enabled", (s) => { s.groups[0].enabled = "true"; }, ".enabled"],
  ["non-boolean matchAll", (s) => { s.groups[0].rules[0].matchAll = "false"; }, ".matchAll"],
  ["zero version", (s) => { s.version = 0; }, "$.version"],
  ["fractional version", (s) => { s.version = 1.5; }, "$.version"],
  ["overflowing Android integer", (s) => { s.version = 2147483648; }, "$.version"],
  ["string version", (s) => { s.version = "2"; }, "$.version"],
  ["impossible date", (s) => { s.updatedAt = "2026-02-30"; }, "$.updatedAt"],
  ["non-ISO date", (s) => { s.updatedAt = "2026/11/17"; }, "$.updatedAt"],
  ["relative update URL", (s) => { s.updateUrl = "./subscription.json"; }, "$.updateUrl"],
  ["insecure update URL", (s) => { s.updateUrl = "http://example.com/subscription.json"; }, "$.updateUrl"],
  ["non-string update URL", (s) => { s.updateUrl = 42; }, "$.updateUrl"],
  ["missing groups", (s) => { delete s.groups; }, "$.groups"],
  ["empty groups", (s) => { s.groups = []; }, "$.groups"],
  ["null group", (s) => { s.groups.push(null); }, "$.groups"],
  ["duplicate group key", (s) => { s.groups.push(structuredClone(s.groups[1])); }, "duplicate group key"],
  ["duplicate rule key across groups", (s) => { s.groups[1].rules.push(structuredClone(s.groups[0].rules[0])); }, "duplicate rule key"],
  ["null rule", (s) => { s.groups[0].rules.push(null); }, ".rules"],
  ["wrong rules type", (s) => { s.groups[1].rules = {}; }, ".rules"],
  ["misspelled field", (s) => { s.groups[0].rules[0].channelName = ["营销"]; }, "unknown field"],
  ["empty keyword", (s) => { s.groups[0].rules[0].channelNames = [""]; }, ".channelNames"],
  ["keyword with surrounding whitespace", (s) => { s.groups[0].rules[0].channelNames = [" 营销"]; }, ".channelNames"],
  ["non-string exclusion", (s) => { s.groups[0].rules[0].excludeKeywords.push(1); }, ".excludeKeywords"],
  ["duplicate keyword ignoring case", (s) => { s.groups[0].rules[0].excludeKeywords.push("PAYMENT"); }, "duplicate value"],
  ["invalid wildcard", (s) => { s.groups[0].rules[0].packages = ["com.*.shop"]; }, ".packages"],
  ["implicit global package scope", (s) => { s.groups[0].rules[0].packages = []; }, ".packages"],
  ["non-array packages", (s) => { s.groups[0].rules[0].packages = "*"; }, ".packages"],
  ["enabled rule without filters", (s) => { s.groups[0].rules[0].channelNames = []; }, "no matching condition"],
  ["global all-channel rule", (s) => {
    s.groups[0].rules[0].matchAll = true;
    s.groups[0].rules[0].channelNames = [];
  }, "all channels of all applications is forbidden"],
  ["general channel ID filter", (s) => { s.groups[0].rules[0].channelIds = ["promo"]; }, "general rules"],
];

for (const [name, mutate, expected] of invalid) {
  test(`rejects ${name}`, () => {
    const changed = structuredClone(subscription);
    mutate(changed);
    const errors = validateSubscription(changed);
    assert.ok(errors.some((error) => error.includes(expected)), errors.join("\n"));
  });
}

test("rejects non-object roots without throwing", () => {
  for (const value of [null, [], "rules", 42]) {
    assert.ok(validateSubscription(value).includes("$: must be an object"));
  }
});

test("accepts a valid leap day, HTTPS URL and empty reserved group", () => {
  const changed = structuredClone(subscription);
  changed.updatedAt = "2028-02-29";
  changed.updateUrl = "https://example.com/subscription.json";
  assert.deepEqual(validateSubscription(changed), []);
});
