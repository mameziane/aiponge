#!/usr/bin/env node
/**
 * i18n Cleanup Script
 *
 * Removes confirmed unused translation keys from all locale files.
 *
 * Usage:
 *   npx tsx scripts/i18n-cleanup.ts                # dry-run (preview changes)
 *   npx tsx scripts/i18n-cleanup.ts --dry-run       # explicit dry-run
 *   npx tsx scripts/i18n-cleanup.ts --apply          # apply changes (removes keys)
 */

import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const LOCALES_DIR = path.join(
  ROOT,
  "apps",
  "aiponge",
  "src",
  "i18n",
  "locales"
);
const REPORT_PATH = path.join(ROOT, "i18n-unused-keys-report.md");
const BACKUP_DIR = path.join(ROOT, "scripts", "i18n-backups");

const args = process.argv.slice(2);
const applyMode = args.includes("--apply");
const dryRun = !applyMode;

function parseUnusedKeysFromReport(reportPath: string): string[] {
  const content = fs.readFileSync(reportPath, "utf-8");
  const keys: string[] = [];

  const unusedSection = content.split(
    "## ❌ Unused Keys (Candidates for Removal)"
  )[1];
  if (!unusedSection) {
    console.error("Could not find unused keys section in report");
    process.exit(1);
  }

  const keyPattern = /^\| `([^`]+)` \|/gm;
  let match;
  while ((match = keyPattern.exec(unusedSection)) !== null) {
    if (match[1] !== "Key") {
      keys.push(match[1]);
    }
  }

  return keys;
}

function deleteNestedKey(obj: Record<string, unknown>, keyPath: string): boolean {
  const parts = keyPath.split(".");
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (
      typeof current[part] !== "object" ||
      current[part] === null ||
      Array.isArray(current[part])
    ) {
      return false;
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1];
  if (lastPart in current) {
    delete current[lastPart];
    return true;
  }
  return false;
}

function cleanEmptyObjects(obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    if (
      typeof obj[key] === "object" &&
      obj[key] !== null &&
      !Array.isArray(obj[key])
    ) {
      cleanEmptyObjects(obj[key] as Record<string, unknown>);
      if (Object.keys(obj[key] as Record<string, unknown>).length === 0) {
        delete obj[key];
      }
    }
  }
}

function countKeys(obj: Record<string, unknown>, prefix = ""): number {
  let count = 0;
  for (const key of Object.keys(obj)) {
    if (
      typeof obj[key] === "object" &&
      obj[key] !== null &&
      !Array.isArray(obj[key])
    ) {
      count += countKeys(obj[key] as Record<string, unknown>, `${prefix}${key}.`);
    } else {
      count++;
    }
  }
  return count;
}

function main() {
  console.log(`\n🌐 i18n Cleanup Script`);
  console.log(`   Mode: ${dryRun ? "DRY RUN (preview only)" : "APPLY (will modify files)"}\n`);

  if (!fs.existsSync(REPORT_PATH)) {
    console.error(`Report not found at: ${REPORT_PATH}`);
    console.error("Run the analysis script first to generate the report.");
    process.exit(1);
  }

  const unusedKeys = parseUnusedKeysFromReport(REPORT_PATH);
  console.log(`📋 Found ${unusedKeys.length} unused keys in report\n`);

  if (unusedKeys.length === 0) {
    console.log("No unused keys to remove. Exiting.");
    process.exit(0);
  }

  const localeFiles = fs
    .readdirSync(LOCALES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(LOCALES_DIR, f));

  console.log(`📁 Locale files to process: ${localeFiles.length}`);
  localeFiles.forEach((f) => console.log(`   - ${path.basename(f)}`));
  console.log("");

  if (!dryRun) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  for (const localeFile of localeFiles) {
    const basename = path.basename(localeFile);
    const raw = fs.readFileSync(localeFile, "utf-8");
    const data = JSON.parse(raw);
    const keysBefore = countKeys(data);

    let removedCount = 0;
    let skippedCount = 0;

    for (const key of unusedKeys) {
      const deleted = deleteNestedKey(data, key);
      if (deleted) {
        removedCount++;
      } else {
        skippedCount++;
      }
    }

    cleanEmptyObjects(data);
    const keysAfter = countKeys(data);

    console.log(`📄 ${basename}:`);
    console.log(`   Keys before: ${keysBefore}`);
    console.log(`   Keys removed: ${removedCount}`);
    console.log(`   Keys not found (already absent): ${skippedCount}`);
    console.log(`   Keys after: ${keysAfter}`);

    if (!dryRun && removedCount > 0) {
      const backupPath = path.join(BACKUP_DIR, `${basename}.backup`);
      fs.writeFileSync(backupPath, raw, "utf-8");
      console.log(`   Backup saved: ${backupPath}`);

      const output = JSON.stringify(data, null, 2) + "\n";
      fs.writeFileSync(localeFile, output, "utf-8");
      console.log(`   ✅ File updated`);
    } else if (dryRun) {
      console.log(`   (dry run — no changes made)`);
    }
    console.log("");
  }

  if (dryRun) {
    console.log("🔍 This was a dry run. To apply changes, run with --apply");
  } else {
    console.log("✅ Cleanup complete. Backups saved to scripts/i18n-backups/");
    console.log("   Review changes with: git diff apps/aiponge/src/i18n/locales/");
  }
}

main();
