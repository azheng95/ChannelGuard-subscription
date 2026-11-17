import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateSubscription } from "../scripts/validate.mjs";
import { matchChannel } from "./matcher.mjs";

const subscription = JSON.parse(await readFile(new URL("../subscription.json", import.meta.url), "utf8"));
const cases = JSON.parse(await readFile(new URL("./match-cases.json", import.meta.url), "utf8"));
const general = subscription.groups.find((group) => group.key === "general");
const extended = subscription.groups.find((group) => group.key === "extended");

test("published subscription preserves its identity and group defaults", () => {
  assert.deepEqual(validateSubscription(subscription), []);
  assert.equal(subscription.id, "channelguard-default");
  assert.equal(subscription.name, "ChannelGuard 通知频道规则");
  assert.equal(subscription.author, "azheng95");
  assert.equal(subscription.updateUrl, "");
  assert.equal(subscription.enabled, true);
  assert.deepEqual(subscription.groups.map((group) => group.key), ["general", "extended"]);
  assert.equal(general.enabled, true);
  assert.equal(extended.enabled, false);
});

test("general rules keep their four stable keys and narrow channel-name filters", () => {
  const definitions = [
    ["general-marketing", "营销"],
    ["general-promotion", "推广"],
    ["general-sale", "促销"],
    ["general-advertising", "广告"],
  ];
  assert.equal(general.rules.length, definitions.length);
  for (const [index, [key, name]] of definitions.entries()) {
    const rule = general.rules[index];
    assert.equal(rule.key, key);
    assert.equal(rule.name, name);
    assert.deepEqual(rule.packages, ["*"]);
    assert.deepEqual(rule.channelNames, [name]);
    assert.deepEqual(rule.channelIds, []);
    assert.equal(rule.matchAll, false);
    assert.equal(rule.enabled, true);
    assert.deepEqual(rule.excludeKeywords, general.rules[0].excludeKeywords);
  }
});

test("all general rules retain required Chinese and English exclusions", () => {
  const required = [
    "订单", "支付", "交易", "退款", "物流", "验证码", "登录", "安全",
    "通话", "下载", "上传", "同步", "前台服务", "常驻", "广告拦截", "广告过滤",
    "order", "payment", "transaction", "refund", "logistics", "verification", "login",
    "security", "call", "download", "upload", "sync", "foreground", "persistent", "adblock", "ad filter",
  ];
  for (const rule of general.rules) {
    for (const keyword of required) assert.ok(rule.excludeKeywords.includes(keyword), `${rule.key}: ${keyword}`);
  }
});

for (const fixture of cases) {
  test(fixture.name, () => {
    const result = matchChannel(subscription, fixture.packageName, fixture.channelName, fixture.channelId);
    assert.equal(result?.ruleKey ?? null, fixture.expectedRule);
  });
}

test("every enabled published rule has a positive regression fixture", () => {
  for (const group of subscription.groups.filter((entry) => entry.enabled)) {
    for (const rule of group.rules.filter((entry) => entry.enabled)) {
      assert.ok(cases.some((fixture) => fixture.expectedRule === rule.key), `Missing positive fixture: ${rule.key}`);
    }
  }
});

test("every exclusion takes precedence in channel names and IDs, ignoring case", () => {
  for (const rule of general.rules) {
    for (const keyword of rule.excludeKeywords) {
      const upper = keyword.toUpperCase();
      assert.equal(matchChannel(subscription, "com.example.shop", `${rule.name} ${upper}`, "business"), null);
      assert.equal(matchChannel(subscription, "com.example.shop", rule.name, `business_${upper}`), null);
    }
  }
});

test("subscription, group and rule switches independently prevent matching", () => {
  const changed = structuredClone(subscription);
  changed.enabled = false;
  assert.equal(matchChannel(changed, "com.example.shop", "营销", "business"), null);
  changed.enabled = true;
  changed.groups[0].enabled = false;
  assert.equal(matchChannel(changed, "com.example.shop", "营销", "business"), null);
  changed.groups[0].enabled = true;
  changed.groups[0].rules[0].enabled = false;
  assert.equal(matchChannel(changed, "com.example.shop", "营销", "business"), null);
});

test("empty extended group has no matching effect", () => {
  const withEmptyExtended = structuredClone(subscription);
  withEmptyExtended.groups[1].rules = [];
  const withoutExtended = structuredClone(withEmptyExtended);
  withoutExtended.groups = [withoutExtended.groups[0]];
  for (const fixture of cases) {
    assert.deepEqual(
      matchChannel(withEmptyExtended, fixture.packageName, fixture.channelName, fixture.channelId),
      matchChannel(withoutExtended, fixture.packageName, fixture.channelName, fixture.channelId),
    );
  }
});

test("extended rules remain inactive until the group is explicitly enabled", () => {
  const changed = structuredClone(subscription);
  changed.groups[1].rules.push({
    key: "fixture-specific", name: "Fixture only", packages: ["com.example.shop"],
    channelNames: ["campaign"], channelIds: [], excludeKeywords: [],
    matchAll: false, enabled: true,
  });
  assert.equal(matchChannel(changed, "com.example.shop", "campaign", "business"), null);
  changed.groups[1].enabled = true;
  assert.equal(matchChannel(changed, "com.example.shop", "campaign", "business")?.ruleKey, "fixture-specific");
});

test("an extended rule supports exact packages, prefixes and name OR ID matching", () => {
  const changed = structuredClone(subscription);
  changed.groups[1].enabled = true;
  const rule = {
    key: "fixture-specific", name: "Fixture only", packages: ["com.example.shop", "org.example.*"],
    channelNames: ["campaign"], channelIds: ["sale_notice"], excludeKeywords: ["payment"],
    matchAll: false, enabled: true,
  };
  changed.groups[1].rules.push(rule);
  assert.deepEqual(validateSubscription(changed), []);
  for (const [pkg, name, id] of [
    ["com.example.shop", "CAMPAIGN notices", "business"],
    ["org.example.reader", "普通通知", "SALE_NOTICE"],
  ]) {
    assert.equal(matchChannel(changed, pkg, name, id)?.ruleKey, rule.key);
  }
  for (const [pkg, name, id] of [
    ["com.other.shop", "campaign", "business"],
    ["com.example.shop.extra", "campaign", "business"],
    ["org.examples.reader", "campaign", "business"],
    ["org.example", "campaign", "business"],
    ["COM.EXAMPLE.SHOP", "campaign", "business"],
    ["com.example.shop", "campaign payment", "business"],
    ["com.example.shop", "普通通知", "business"],
  ]) {
    assert.equal(matchChannel(changed, pkg, name, id), null);
  }
});

test("the first matching rule wins, and matchAll only applies without channel filters", () => {
  assert.equal(matchChannel(subscription, "com.example.shop", "营销推广", "business")?.ruleKey, "general-marketing");
  const changed = structuredClone(subscription);
  changed.groups[0].enabled = false;
  changed.groups[1].enabled = true;
  const rule = structuredClone(general.rules[0]);
  rule.packages = ["com.example.shop"];
  rule.channelNames = [];
  changed.groups[1].rules.push(rule);
  assert.equal(matchChannel(changed, "com.example.shop", "一般通知", "business"), null);
  rule.matchAll = true;
  assert.equal(matchChannel(changed, "com.example.shop", "一般通知", "business")?.ruleKey, rule.key);
  assert.equal(matchChannel(changed, "com.other.shop", "一般通知", "business"), null);
  rule.channelNames = ["营销"];
  assert.equal(matchChannel(changed, "com.example.shop", "一般通知", "business"), null);
});
