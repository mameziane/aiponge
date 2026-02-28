#!/usr/bin/env python3
"""
Analyze i18n translation key usage across the aiponge monorepo.
Produces a JSON report of used, possibly-dynamic, and unused keys.

The analysis runs in two phases:
1. Direct scan: Finds t('key'), i18n.t('key'), i18nKey="key", <Trans> usages
2. Deep scan: Finds i18n key strings referenced as variables in config objects
   (e.g., bookTypeConfig.generatorTitleKey = 'books.generator.title')
   by matching all quoted dot-notation strings against the defined key set.

Keys are classified as:
- USED: Found as exact t() call or i18nKey attribute
- POSSIBLY DYNAMIC: Matched by template literal prefix or deep-scan string reference
- UNUSED: No reference found anywhere
"""

import json
import os
import re
import sys
from pathlib import Path
from collections import defaultdict
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent
EN_US_PATH = ROOT / "apps" / "aiponge" / "src" / "i18n" / "locales" / "en-US.json"
SOURCE_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx"}
EXCLUDE_DIRS = {"node_modules", ".git", "dist", "build", ".expo", ".turbo", "__pycache__", ".next"}
TEST_INDICATORS = {"test", "__tests__", ".test.", ".spec.", "__mocks__"}


def flatten_keys(obj, prefix=""):
    keys = {}
    for k, v in obj.items():
        full_key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            keys.update(flatten_keys(v, full_key))
        else:
            keys[full_key] = str(v)
    return keys


def find_source_files(root):
    files = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        for f in filenames:
            ext = os.path.splitext(f)[1]
            if ext in SOURCE_EXTENSIONS:
                files.append(os.path.join(dirpath, f))
    return files


def is_test_file(rel_path):
    lower = rel_path.lower()
    return any(ind in lower for ind in TEST_INDICATORS)


def extract_t_calls(content):
    """Extract string arguments from t(), i18n.t(), i18nKey, and <Trans> usages."""
    keys = set()

    # t('key'), t("key"), t(`key`) — also matches i18n.t(...), i18next.t(...)
    for m in re.finditer(r"""(?:\bi18n(?:ext)?\.)?\bt\s*\(\s*['"`]([^'"`\$]+?)['"`]""", content):
        keys.add(m.group(1))

    # i18nKey="key" or i18nKey='key' (covers <Trans i18nKey="..."> and JSX props)
    for m in re.finditer(r"""i18nKey\s*=\s*['"]([^'"]+?)['"]""", content):
        keys.add(m.group(1))

    # <Trans>...</Trans> with i18nKey already covered above
    # Also check for id="key" in FormattedMessage-style (not used here but safe)
    for m in re.finditer(r"""<FormattedMessage\s+id\s*=\s*['"]([^'"]+?)['"]""", content):
        keys.add(m.group(1))

    return keys


def extract_dynamic_patterns(content, filepath):
    """Find dynamic t() calls using template literals or variables."""
    patterns = []

    # t(`prefix.${var}`) — template literals with interpolation
    for m in re.finditer(r"""(?:\bi18n(?:ext)?\.)?\bt\s*\(\s*`([^`]*\$\{[^`]*)`""", content):
        template = m.group(1)
        prefix_match = re.match(r'^([^$]+)\$\{', template)
        if prefix_match:
            prefix = prefix_match.group(1).rstrip('.')
            patterns.append({
                "pattern": template,
                "prefix": prefix,
                "file": filepath,
            })

    # t(variable) where variable is not a string literal
    for m in re.finditer(r"""(?:\bi18n(?:ext)?\.)?\bt\s*\(\s*([a-zA-Z_]\w*(?:\.\w+)*)\s*[,)]""", content):
        var_name = m.group(1)
        if var_name not in ("true", "false", "null", "undefined", "this"):
            patterns.append({
                "pattern": f"variable: {var_name}",
                "prefix": None,
                "file": filepath,
            })

    return patterns


def deep_scan_string_literals(source_files, root, defined_keys_set):
    """
    Phase 2: Scan all source files for quoted dot-notation strings that match
    defined translation keys. This catches keys passed through config objects,
    arrays, or variables that the direct t() scan misses.
    """
    recovered = set()
    recovery_locations = defaultdict(set)

    for filepath in source_files:
        try:
            with open(filepath, "r", errors="replace") as f:
                content = f.read()
        except Exception:
            continue

        rel_path = os.path.relpath(filepath, root)

        # Skip locale JSON files themselves
        if "/locales/" in filepath and filepath.endswith(".json"):
            continue

        # Find all quoted dot-notation strings (at least one dot)
        for m in re.finditer(r"""['"]([a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)+)['"]""", content):
            key = m.group(1)
            if key in defined_keys_set:
                recovered.add(key)
                recovery_locations[key].add(rel_path)

    return recovered, recovery_locations


def main():
    with open(EN_US_PATH) as f:
        en_data = json.load(f)

    all_keys = flatten_keys(en_data)
    defined_keys_set = set(all_keys.keys())
    print(f"Total defined keys: {len(all_keys)}", file=sys.stderr)

    source_files = find_source_files(ROOT)
    print(f"Source files to scan: {len(source_files)}", file=sys.stderr)

    # Phase 1: Direct t() calls and dynamic patterns
    used_keys = set()
    test_only_keys_candidates = set()
    dynamic_patterns = []
    key_usage_locations = defaultdict(set)

    for filepath in source_files:
        try:
            with open(filepath, "r", errors="replace") as f:
                content = f.read()
        except Exception:
            continue

        rel_path = os.path.relpath(filepath, ROOT)

        if "/locales/" in filepath and filepath.endswith(".json"):
            continue

        keys_found = extract_t_calls(content)
        is_test = is_test_file(rel_path)

        for key in keys_found:
            used_keys.add(key)
            key_usage_locations[key].add(rel_path)

        dyn = extract_dynamic_patterns(content, rel_path)
        dynamic_patterns.extend(dyn)

    print(f"Phase 1 — Direct key references: {len(used_keys)}", file=sys.stderr)
    print(f"Phase 1 — Dynamic patterns: {len(dynamic_patterns)}", file=sys.stderr)

    # Phase 2: Deep scan for string literal references
    # Only scan keys not already found by Phase 1
    remaining_keys = defined_keys_set - used_keys
    deep_recovered, deep_locations = deep_scan_string_literals(source_files, ROOT, remaining_keys)
    print(f"Phase 2 — Deep scan recovered: {len(deep_recovered)}", file=sys.stderr)

    # Classify keys
    used = {}
    possibly_dynamic = {}
    unused = {}

    for key, value in all_keys.items():
        if key in used_keys:
            used[key] = {
                "value": value,
                "locations": sorted(key_usage_locations[key]),
            }
        elif key in deep_recovered:
            possibly_dynamic[key] = {
                "value": value,
                "matched_pattern": "string literal reference in source",
                "pattern_file": ", ".join(sorted(deep_locations[key])),
            }
        else:
            # Check template literal prefix patterns
            matched_pattern = None
            for dp in dynamic_patterns:
                prefix = dp.get("prefix")
                if prefix and key.startswith(prefix):
                    matched_pattern = dp
                    break

            if matched_pattern:
                possibly_dynamic[key] = {
                    "value": value,
                    "matched_pattern": matched_pattern["pattern"],
                    "pattern_file": matched_pattern["file"],
                }
            else:
                unused[key] = {
                    "value": value,
                }

    # Identify test-only keys (used keys that only appear in test files)
    test_only = set()
    for key in used:
        locs = key_usage_locations[key]
        if all(is_test_file(loc) for loc in locs):
            test_only.add(key)

    print(f"\nFinal classification:", file=sys.stderr)
    print(f"  Used: {len(used)}", file=sys.stderr)
    print(f"  Possibly dynamic: {len(possibly_dynamic)}", file=sys.stderr)
    print(f"  Unused: {len(unused)}", file=sys.stderr)
    print(f"  Test-only (subset of used): {len(test_only)}", file=sys.stderr)

    result = {
        "generated": datetime.now().isoformat(),
        "total_defined": len(all_keys),
        "used_count": len(used),
        "possibly_dynamic_count": len(possibly_dynamic),
        "unused_count": len(unused),
        "test_only_count": len(test_only),
        "used": used,
        "possibly_dynamic": possibly_dynamic,
        "unused": unused,
        "test_only_keys": sorted(test_only),
        "dynamic_patterns": [
            {"pattern": dp["pattern"], "prefix": dp.get("prefix"), "file": dp["file"]}
            for dp in dynamic_patterns
        ],
    }

    json.dump(result, sys.stdout, indent=2)


if __name__ == "__main__":
    main()
