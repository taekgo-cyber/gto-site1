import path from "node:path";
import { config } from "dotenv";

config({ quiet: true });

function value(name) {
  return process.env[name]?.trim() ?? "";
}

function validUrl(raw, protocols, originOnly = false, allowCredentials = false) {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return (
      protocols.includes(url.protocol) &&
      (allowCredentials || (!url.username && !url.password)) &&
      (!originOnly || (url.pathname === "/" && !url.search && !url.hash))
    );
  } catch {
    return false;
  }
}

const databaseUrl = value("DATABASE_URL");
const authSecret = value("AUTH_SECRET");
const siteUrl = value("NEXT_PUBLIC_SITE_URL");
const unlockLimit = value("LEAD_MAX_CONTACT_UNLOCKS_PER_LEAD");
const storageProvider = value("STORAGE_PROVIDER");
const uploadDir = value("UPLOAD_DIR");
const cronSecret = value("BLOG_AUTOMATION_CRON_SECRET");
const launchBoundaryNames = [
  "LAUNCH_FREE_AT",
  "LAUNCH_PAID_PRENOTICE_AT",
  "LAUNCH_DISCOUNTED_PAID_AT",
  "LAUNCH_STANDARD_PAID_AT",
];
const launchBoundaryPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/;
const launchBoundaries = launchBoundaryNames.map((name) => value(name));
const launchBoundaryDates = launchBoundaries.map((raw) => new Date(raw));
const launchBoundariesValid = launchBoundaries.every((raw, index) =>
  launchBoundaryPattern.test(raw) && !Number.isNaN(launchBoundaryDates[index].getTime()),
);
const launchBoundaryOrderValid = launchBoundariesValid && launchBoundaryDates.every((date, index) =>
  index === 0 || date.getTime() > launchBoundaryDates[index - 1].getTime(),
);

const checks = [
  {
    name: "NODE_ENV",
    status: process.env.NODE_ENV === "production" ? "PASS" : "FAIL",
    message: "production runtime must set NODE_ENV=production",
  },
  {
    name: "DATABASE_URL",
    status: validUrl(databaseUrl, ["postgres:", "postgresql:"], false, true) ? "PASS" : "FAIL",
    message: "must be a configured PostgreSQL URL",
  },
  {
    name: "AUTH_SECRET",
    status: authSecret.length >= 32 ? "PASS" : "FAIL",
    message: "must contain at least 32 characters",
  },
  {
    name: "NEXT_PUBLIC_SITE_URL",
    status: validUrl(siteUrl, ["https:"], true) ? "PASS" : "FAIL",
    message: "must be an HTTPS origin without a path, query, or fragment",
  },
  {
    name: "SITE_AVAILABILITY",
    status: ["PUBLIC", "MAINTENANCE"].includes(value("SITE_AVAILABILITY").toUpperCase()) ? "PASS" : "FAIL",
    message: "must explicitly select PUBLIC or MAINTENANCE",
  },
  ...launchBoundaryNames.map((name, index) => ({
    name,
    status: launchBoundaryPattern.test(launchBoundaries[index]) && !Number.isNaN(launchBoundaryDates[index].getTime()) ? "PASS" : "FAIL",
    message: "must be an explicit Asia/Seoul boundary in YYYY-MM-DDTHH:mm:ss+09:00 format",
  })),
  {
    name: "LAUNCH_BOUNDARY_ORDER",
    status: launchBoundaryOrderValid ? "PASS" : "FAIL",
    message: "FREE < PRENOTICE < DISCOUNTED < STANDARD boundaries must be strictly ordered",
  },
  {
    name: "MONETIZATION_ACTIVATION_MODE",
    status: value("MONETIZATION_ACTIVATION_MODE") === "FREE_ONLY" ? "PASS" : "FAIL",
    message: "must remain FREE_ONLY until a separately approved payment provider is implemented",
  },
  {
    name: "LEAD_MAX_CONTACT_UNLOCKS_PER_LEAD",
    status: /^\d+$/.test(unlockLimit) && Number.isSafeInteger(Number(unlockLimit)) ? "PASS" : "FAIL",
    message: "must be an explicit non-negative safe integer",
  },
  {
    name: "BLOG_AI_BASE_URL",
    status: validUrl(value("BLOG_AI_BASE_URL"), ["https:"]) ? "PASS" : "FAIL",
    message: "must be a configured HTTPS provider endpoint",
  },
  {
    name: "BLOG_AI_API_KEY",
    status: value("BLOG_AI_API_KEY") ? "PASS" : "FAIL",
    message: "must be configured in the deployment secret store",
  },
  {
    name: "BLOG_AI_MODEL",
    status: value("BLOG_AI_MODEL") ? "PASS" : "FAIL",
    message: "must identify the approved provider model",
  },
  {
    name: "BLOG_AUTOMATION_CRON_SECRET",
    status: cronSecret.length >= 32 ? "PASS" : "FAIL",
    message: "must contain at least 32 characters",
  },
  {
    name: "SUPPORT_ABUSE_HASH_SECRET",
    status: value("SUPPORT_ABUSE_HASH_SECRET").length >= 32 ? "PASS" : "FAIL",
    message: "must be a dedicated secret with at least 32 characters",
  },
  {
    name: "OPS_AUTOMATION_CRON_SECRET",
    status: value("OPS_AUTOMATION_CRON_SECRET").length >= 32 ? "PASS" : "FAIL",
    message: "must contain at least 32 characters",
  },
  {
    name: "STORAGE_PROVIDER",
    status: storageProvider === "local" ? "PASS" : "FAIL",
    message: "the current application supports only local storage",
  },
  {
    name: "UPLOAD_DIR",
    status: uploadDir && path.isAbsolute(uploadDir) ? "PASS" : "FAIL",
    message: "production local storage must use an explicit absolute path",
  },
  {
    name: "DURABLE_UPLOAD_VERIFICATION",
    status: "MANUAL",
    message: "verify persistent-volume mapping, backup, restart persistence, and attachment restore",
  },
  {
    name: "BACKUP_RESTORE_REHEARSAL",
    status: "MANUAL",
    message: "record provider backup/PITR evidence and measured staging restore RPO/RTO",
  },
  {
    name: "ALERT_DESTINATION",
    status: "MANUAL",
    message: "connect and test-fire health/readiness alerts to at least one real destination",
  },
  {
    name: "TELEGRAM_ADMIN_OPS",
    status: "MANUAL",
    message: "configure bot/chat/user/webhook secrets and test-fire an authorized digest if Telegram ops is enabled",
  },
];

console.log("production_preflight");
for (const check of checks) {
  console.log(`${check.status.padEnd(6)} ${check.name}: ${check.message}`);
}

const failed = checks.filter((check) => check.status === "FAIL").length;
const manual = checks.filter((check) => check.status === "MANUAL").length;
console.log(`summary: ${failed} failed, ${manual} manual gates`);
if (failed > 0) process.exitCode = 1;
