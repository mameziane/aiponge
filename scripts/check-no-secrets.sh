#!/bin/bash
# Pre-commit hook: Prevent committing .env files or hardcoded secrets
#
# Blocked patterns and rationale:
# ---------------------------------------------------------------
# Pattern                        | Reason
# ---------------------------------------------------------------
# .env / .env.*                  | Runtime env files must never be committed
# JWT_SECRET=                    | Auth signing secret
# aiponge-dev-secret-1759653153  | Known compromised dev secret (rotated Feb 2026)
# OPENAI_API_KEY=sk-             | OpenAI keys always start with sk-
# ANTHROPIC_API_KEY=sk-ant-      | Anthropic keys always start with sk-ant-
# AWS_SECRET_ACCESS_KEY=         | AWS secret access key
# ELEVENLABS_API_KEY=            | ElevenLabs voice API key
# MUSICAPI_API_KEY=              | MusicAPI.ai key
# ENTRY_ENCRYPTION_KEY=          | AES-256-GCM encryption key
# INTERNAL_SERVICE_SECRET=       | Service-to-service auth secret
# ---------------------------------------------------------------
# After rotation, run git filter-repo or BFG Repo-Cleaner to purge
# old credentials from history, then force-push.

set -euo pipefail

BLOCKED=0

# Check for .env files being committed (excluding .env.example)
ENV_FILES=$(git diff --cached --name-only | grep -E '\.env$|\.env\.' | grep -v '\.example$' || true)
if [ -n "$ENV_FILES" ]; then
  echo "ERROR: Attempting to commit .env files:"
  echo "$ENV_FILES"
  echo "Remove them with: git reset HEAD <file>"
  BLOCKED=1
fi

# Check for JWT_SECRET values being committed (excluding examples and docs)
SECRET_FILES=$(git diff --cached -S 'JWT_SECRET=' --name-only | grep -v '\.example$' | grep -v '\.md$' || true)
if [ -n "$SECRET_FILES" ]; then
  echo "ERROR: Attempting to commit a file containing JWT_SECRET value:"
  echo "$SECRET_FILES"
  BLOCKED=1
fi

# Check for the known compromised secret
COMPROMISED=$(git diff --cached -S 'aiponge-dev-secret-1759653153' --name-only || true)
if [ -n "$COMPROMISED" ]; then
  echo "ERROR: Attempting to commit the compromised JWT_SECRET:"
  echo "$COMPROMISED"
  BLOCKED=1
fi

# Check for OpenAI API keys (sk-...)
OPENAI_LEAK=$(git diff --cached -S 'OPENAI_API_KEY=sk-' --name-only | grep -v '\.example$' | grep -v '\.md$' | grep -v 'check-no-secrets' || true)
if [ -n "$OPENAI_LEAK" ]; then
  echo "ERROR: Attempting to commit an OpenAI API key:"
  echo "$OPENAI_LEAK"
  BLOCKED=1
fi

# Check for Anthropic API keys (sk-ant-...)
ANTHROPIC_LEAK=$(git diff --cached -S 'ANTHROPIC_API_KEY=sk-ant-' --name-only | grep -v '\.example$' | grep -v '\.md$' | grep -v 'check-no-secrets' || true)
if [ -n "$ANTHROPIC_LEAK" ]; then
  echo "ERROR: Attempting to commit an Anthropic API key:"
  echo "$ANTHROPIC_LEAK"
  BLOCKED=1
fi

# Check for AWS secret access keys
AWS_LEAK=$(git diff --cached -S 'AWS_SECRET_ACCESS_KEY=' --name-only | grep -v '\.example$' | grep -v '\.md$' | grep -v 'check-no-secrets' | grep -v 'docker-compose' || true)
if [ -n "$AWS_LEAK" ]; then
  echo "ERROR: Attempting to commit an AWS secret access key:"
  echo "$AWS_LEAK"
  BLOCKED=1
fi

# Check for ElevenLabs API keys
ELEVENLABS_LEAK=$(git diff --cached -S 'ELEVENLABS_API_KEY=' --name-only | grep -v '\.example$' | grep -v '\.md$' | grep -v 'check-no-secrets' | grep -v 'docker-compose' || true)
if [ -n "$ELEVENLABS_LEAK" ]; then
  echo "ERROR: Attempting to commit an ElevenLabs API key:"
  echo "$ELEVENLABS_LEAK"
  BLOCKED=1
fi

# Check for MusicAPI keys
MUSICAPI_LEAK=$(git diff --cached -S 'MUSICAPI_API_KEY=' --name-only | grep -v '\.example$' | grep -v '\.md$' | grep -v 'check-no-secrets' | grep -v 'docker-compose' || true)
if [ -n "$MUSICAPI_LEAK" ]; then
  echo "ERROR: Attempting to commit a MusicAPI key:"
  echo "$MUSICAPI_LEAK"
  BLOCKED=1
fi

# Check for encryption keys
ENCRYPTION_LEAK=$(git diff --cached -S 'ENTRY_ENCRYPTION_KEY=' --name-only | grep -v '\.example$' | grep -v '\.md$' | grep -v 'check-no-secrets' | grep -v 'docker-compose' || true)
if [ -n "$ENCRYPTION_LEAK" ]; then
  echo "ERROR: Attempting to commit an encryption key:"
  echo "$ENCRYPTION_LEAK"
  BLOCKED=1
fi

# Check for internal service secrets
INTERNAL_LEAK=$(git diff --cached -S 'INTERNAL_SERVICE_SECRET=' --name-only | grep -v '\.example$' | grep -v '\.md$' | grep -v 'check-no-secrets' | grep -v 'docker-compose' || true)
if [ -n "$INTERNAL_LEAK" ]; then
  echo "ERROR: Attempting to commit an internal service secret:"
  echo "$INTERNAL_LEAK"
  BLOCKED=1
fi

if [ "$BLOCKED" -eq 1 ]; then
  exit 1
fi

exit 0
