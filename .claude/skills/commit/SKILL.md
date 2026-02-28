---
name: commit
description: Stage changes, generate a descriptive commit message, and commit
user-invocable: true
disable-model-invocation: true
---

# /commit — Smart Commit

Create a well-formed git commit for the current changes.

## Steps

1. Run `git status` (never use `-uall`) and `git diff --staged` to understand what changed
2. If nothing is staged, stage the relevant changed files by name (never `git add -A` — be selective)
3. Run `git log --oneline -5` to match the repo's commit message style
4. Analyze all staged changes and write a concise commit message:
   - First line: imperative mood, under 72 chars, describes the "why"
   - Use prefixes: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `style:`
   - Add body paragraph only if the change is non-obvious
5. Never commit files matching: `.env`, `*.env.*`, `credentials*`, `*.pem`, `*.key`
6. Commit using a HEREDOC for the message:
   ```bash
   git commit -m "$(cat <<'EOF'
   prefix: message here

   Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
   EOF
   )"
   ```
7. Run `git status` after to verify success
8. Show the user what was committed (files + message)

## Rules

- NEVER amend previous commits unless explicitly asked
- NEVER push unless explicitly asked
- NEVER use `--no-verify` — let pre-commit hooks run
- If hooks fail, fix the issue and create a NEW commit
- If there are no changes, tell the user and stop
