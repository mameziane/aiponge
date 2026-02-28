#!/usr/bin/env node
/**
 * Locale Parity Check Script
 *
 * This script ensures all locale files have the same translation keys.
 * Run as: node apps/aiponge/src/i18n/scripts/check-locale-parity.js
 *
 * Exit codes:
 *   0 - All locales have matching keys
 *   1 - Missing or extra keys detected
 */

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'locales');
const REFERENCE_LOCALE = 'en-US';

function getAllKeys(obj, prefix = '') {
  let keys = [];
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      keys = keys.concat(getAllKeys(obj[key], fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys.sort();
}

function loadLocale(filename) {
  const filepath = path.join(LOCALES_DIR, filename);
  try {
    const content = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error loading ${filename}:`, error.message);
    process.exit(1);
  }
}

function findDifferences(referenceKeys, compareKeys) {
  const missing = referenceKeys.filter(key => !compareKeys.includes(key));
  const extra = compareKeys.filter(key => !referenceKeys.includes(key));
  return { missing, extra };
}

function main() {
  console.log('🔍 Checking locale file parity...\n');

  const localeFiles = fs.readdirSync(LOCALES_DIR).filter(file => file.endsWith('.json'));

  if (localeFiles.length === 0) {
    console.error('No locale files found in', LOCALES_DIR);
    process.exit(1);
  }

  console.log(`Found ${localeFiles.length} locale files:`);
  localeFiles.forEach(file => console.log(`  - ${file}`));
  console.log();

  const referenceFile = `${REFERENCE_LOCALE}.json`;
  if (!localeFiles.includes(referenceFile)) {
    console.error(`Reference locale file ${referenceFile} not found`);
    process.exit(1);
  }

  const referenceData = loadLocale(referenceFile);
  const referenceKeys = getAllKeys(referenceData);

  console.log(`Reference locale (${REFERENCE_LOCALE}): ${referenceKeys.length} keys\n`);

  let hasErrors = false;
  const results = [];

  for (const file of localeFiles) {
    if (file === referenceFile) continue;

    const locale = file.replace('.json', '');
    const localeData = loadLocale(file);
    const localeKeys = getAllKeys(localeData);

    const { missing, extra } = findDifferences(referenceKeys, localeKeys);

    const status = {
      locale,
      totalKeys: localeKeys.length,
      missing,
      extra,
      isValid: missing.length === 0 && extra.length === 0,
    };

    results.push(status);

    if (!status.isValid) {
      hasErrors = true;
    }
  }

  console.log('Results:');
  console.log('─'.repeat(60));

  for (const result of results) {
    const icon = result.isValid ? '✅' : '❌';
    console.log(`\n${icon} ${result.locale} (${result.totalKeys} keys)`);

    if (result.missing.length > 0) {
      console.log(`   Missing ${result.missing.length} keys:`);
      result.missing.slice(0, 10).forEach(key => console.log(`     - ${key}`));
      if (result.missing.length > 10) {
        console.log(`     ... and ${result.missing.length - 10} more`);
      }
    }

    if (result.extra.length > 0) {
      console.log(`   Extra ${result.extra.length} keys:`);
      result.extra.slice(0, 10).forEach(key => console.log(`     + ${key}`));
      if (result.extra.length > 10) {
        console.log(`     ... and ${result.extra.length - 10} more`);
      }
    }
  }

  console.log('\n' + '─'.repeat(60));

  if (hasErrors) {
    console.log('\n❌ FAIL: Locale files have key mismatches');
    console.log('\nTo fix:');
    console.log('1. Add missing keys to the locale files listed above');
    console.log('2. Remove extra keys that are not in the reference locale');
    console.log(`3. Reference locale is: ${REFERENCE_LOCALE}`);
    process.exit(1);
  } else {
    console.log(`\n✅ PASS: All ${results.length} locales have matching keys (${referenceKeys.length} keys each)`);
    process.exit(0);
  }
}

main();
