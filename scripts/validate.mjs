const fields = {
  subscription: ["id", "name", "author", "version", "updateUrl", "updatedAt", "enabled", "groups"],
  group: ["key", "name", "description", "enabled", "rules"],
  rule: ["key", "name", "packages", "channelNames", "channelIds", "excludeKeywords", "matchAll", "enabled"],
};

const identifier = /^[a-z0-9][a-z0-9._-]*$/;
const packagePattern = /^(?:[A-Za-z_][A-Za-z0-9_]*\.)+[A-Za-z_][A-Za-z0-9_]*(?:\.\*)?$/;

export function validateSubscription(subscription) {
  const errors = [];
  const fail = (path, message) => errors.push(`${path}: ${message}`);

  function object(value, path, allowed) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      fail(path, "must be an object");
      return false;
    }
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) fail(`${path}.${key}`, "unknown field");
    }
    for (const key of allowed) {
      if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, "required field");
    }
    return true;
  }

  function text(value, path, isIdentifier = false) {
    if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
      fail(path, "must be a non-empty string without surrounding whitespace");
      return false;
    }
    if (isIdentifier && !identifier.test(value)) {
      fail(path, "must use lowercase letters, digits, dots, underscores or hyphens");
    }
    return true;
  }

  function boolean(value, path) {
    if (typeof value !== "boolean") fail(path, "must be a boolean");
  }

  function array(value, path, nonEmpty = false) {
    if (!Array.isArray(value)) {
      fail(path, "must be an array");
      return false;
    }
    if (nonEmpty && value.length === 0) fail(path, "must not be empty");
    return true;
  }

  function strings(value, path, packages = false) {
    if (!array(value, path, packages)) return [];
    const seen = new Set();
    value.forEach((entry, index) => {
      const entryPath = `${path}[${index}]`;
      if (!text(entry, entryPath)) return;
      const normalized = packages ? entry : entry.toLowerCase();
      if (seen.has(normalized)) fail(entryPath, "duplicate value");
      seen.add(normalized);
      if (packages && entry !== "*" && !packagePattern.test(entry)) {
        fail(entryPath, "must be a package name, a package prefix ending in .* or *");
      }
    });
    return value;
  }

  if (!object(subscription, "$", fields.subscription)) return errors;
  text(subscription.id, "$.id", true);
  text(subscription.name, "$.name");
  text(subscription.author, "$.author");
  boolean(subscription.enabled, "$.enabled");
  if (!Number.isInteger(subscription.version) || subscription.version < 1 || subscription.version > 2147483647) {
    fail("$.version", "must be a positive 32-bit integer");
  }
  const date = subscription.updatedAt;
  const timestamp = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? Date.parse(`${date}T00:00:00Z`) : NaN;
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) {
    fail("$.updatedAt", "must be a valid YYYY-MM-DD date");
  }
  if (subscription.updateUrl !== "") {
    try {
      const url = new URL(subscription.updateUrl);
      if (typeof subscription.updateUrl !== "string" || url.protocol !== "https:" || url.username || url.password) {
        throw new Error("Invalid URL");
      }
    } catch {
      fail("$.updateUrl", "must be empty or an absolute HTTPS URL without credentials");
    }
  }
  if (!array(subscription.groups, "$.groups", true)) return errors;

  const groupKeys = new Set();
  const ruleKeys = new Set();
  subscription.groups.forEach((group, groupIndex) => {
    const path = `$.groups[${groupIndex}]`;
    if (!object(group, path, fields.group)) return;
    text(group.key, `${path}.key`, true);
    text(group.name, `${path}.name`);
    text(group.description, `${path}.description`);
    boolean(group.enabled, `${path}.enabled`);
    if (groupKeys.has(group.key)) fail(`${path}.key`, "duplicate group key");
    groupKeys.add(group.key);
    if (!array(group.rules, `${path}.rules`)) return;

    group.rules.forEach((rule, ruleIndex) => {
      const rulePath = `${path}.rules[${ruleIndex}]`;
      if (!object(rule, rulePath, fields.rule)) return;
      text(rule.key, `${rulePath}.key`, true);
      text(rule.name, `${rulePath}.name`);
      boolean(rule.enabled, `${rulePath}.enabled`);
      boolean(rule.matchAll, `${rulePath}.matchAll`);
      if (ruleKeys.has(rule.key)) fail(`${rulePath}.key`, "duplicate rule key");
      ruleKeys.add(rule.key);
      const packages = strings(rule.packages, `${rulePath}.packages`, true);
      const names = strings(rule.channelNames, `${rulePath}.channelNames`);
      const ids = strings(rule.channelIds, `${rulePath}.channelIds`);
      strings(rule.excludeKeywords, `${rulePath}.excludeKeywords`);
      if (rule.enabled === true && names.length === 0 && ids.length === 0 && rule.matchAll !== true) {
        fail(rulePath, "enabled rule has no matching condition");
      }
      if (rule.matchAll === true && (packages.length === 0 || packages.includes("*"))) {
        fail(`${rulePath}.matchAll`, "matching all channels of all applications is forbidden");
      }
      if (group.key === "general" && (
        packages.length !== 1 || packages[0] !== "*" || ids.length !== 0 || rule.matchAll !== false
      )) {
        fail(rulePath, "general rules must use packages [*], channel names only and matchAll false");
      }
    });
  });
  return errors;
}
