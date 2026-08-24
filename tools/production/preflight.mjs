import path from "node:path";
import { config } from "dotenv";

config({ quiet: true });

function value(name) {
  return process.env[name]?.trim() ?? "";
}

function validUrl(raw, protocols, originOnly = false) {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return (
      protocols.includes(url.protocol) &&
      !url.username &&
      !url.password &&
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

const checks = [
  {
    name: "NODE_ENV",
    status: process.env.NODE_ENV === "production" ? "PASS" : "FAIL",
    message: "production runtime must set NODE_ENV=production",
  },
  {
    name: "DATABASE_URL",
    status: validUrl(databaseUrl, ["postgres:", "postgresql:"]) ? "PASS" : "FAIL",
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
];

console.log("production_preflight");
for (const check of checks) {
  console.log(`${check.status.padEnd(6)} ${check.name}: ${check.message}`);
}

const failed = checks.filter((check) => check.status === "FAIL").length;
const manual = checks.filter((check) => check.status === "MANUAL").length;
console.log(`summary: ${failed} failed, ${manual} manual gates`);
if (failed > 0) process.exitCode = 1;

