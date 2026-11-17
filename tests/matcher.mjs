// Reference matcher for tests; the Android client's ChannelMatcher remains authoritative.
export function matchChannel(subscription, packageName, channelName, channelId) {
  if (!subscription.enabled) return null;
  const contains = (value, keyword) => value.toLowerCase().includes(keyword.toLowerCase());
  for (const group of subscription.groups) {
    if (!group.enabled) continue;
    for (const rule of group.rules) {
      if (!rule.enabled) continue;
      const inScope = rule.packages.length === 0 || rule.packages.some((pattern) =>
        pattern === "*" || pattern === packageName ||
        (pattern.endsWith(".*") && packageName.startsWith(pattern.slice(0, -1))));
      if (!inScope) continue;
      if (rule.excludeKeywords.some((keyword) => contains(channelName, keyword) || contains(channelId, keyword))) continue;
      const filtered = rule.channelNames.length > 0 || rule.channelIds.length > 0;
      const hit = filtered
        ? rule.channelNames.some((keyword) => contains(channelName, keyword)) ||
          rule.channelIds.some((keyword) => contains(channelId, keyword))
        : rule.matchAll;
      if (hit) return { groupKey: group.key, ruleKey: rule.key };
    }
  }
  return null;
}
