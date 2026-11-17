import { readFile } from "node:fs/promises";
import { validateSubscription } from "./validate.mjs";

try {
  const subscription = JSON.parse(await readFile(new URL("../subscription.json", import.meta.url), "utf8"));
  const errors = validateSubscription(subscription);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    const count = subscription.groups.reduce((total, group) => total + group.rules.length, 0);
    console.log(`Valid subscription: ${subscription.id} v${subscription.version}; ${subscription.groups.length} groups, ${count} rules.`);
  }
} catch (error) {
  console.error(`Cannot read subscription.json: ${error.message}`);
  process.exitCode = 1;
}
