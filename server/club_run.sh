#!/usr/bin/env bash
# Phoenix Finance Club: one run of the club fund with a safe save (used by .github/workflows/club.yml).
# 1) take the latest "data" branch into ./data (a git worktree), 2) run server/club.js on it (ORDER and CID come from the
# environment), 3) commit on top of that branch and push WITHOUT force. If another run pushed first, the push is refused:
# then everything is done again on the newer data. An order is never lost or applied twice (fund.done[CID]).
# The data branch keeps its history, so every change to the fund stays auditable (git log -p origin/data -- fund.json).
# env: REMOTE (default origin), BRANCH (default data), DATA_DIR (default data)
set -u
REMOTE="${REMOTE:-origin}"; BRANCH="${BRANCH:-data}"; DIR="${DATA_DIR:-data}"
NAME="phoenix-club-fund"; MAIL="phoenix-club-fund@users.noreply.github.com"
here="$(cd "$(dirname "$0")" && pwd)"
for try in 1 2 3 4 5 6 7 8; do
  git worktree remove --force "$DIR" >/dev/null 2>&1 || true
  git worktree prune
  if git fetch -q --depth=1 "$REMOTE" "+refs/heads/$BRANCH:refs/remotes/$REMOTE/$BRANCH" 2>/dev/null; then
    git worktree add -q --detach "$DIR" "refs/remotes/$REMOTE/$BRANCH"
  else
    # the very first run: an empty branch with no history
    git worktree add -q --detach "$DIR" HEAD
    git -C "$DIR" checkout -q --orphan "fund-new-$$-$try"
    git -C "$DIR" rm -rfq . >/dev/null 2>&1 || true
  fi
  node "$here/club.js" "$DIR" || exit 1
  git -C "$DIR" add -A
  if git -C "$DIR" diff --cached --quiet; then echo "nothing to save"; exit 0; fi
  msg="fund run $(date -u +%Y-%m-%dT%H:%M:%SZ)"; if [ -n "${CID:-}" ]; then msg="$msg order ${CID//[^A-Za-z0-9_-]/}"; fi
  git -C "$DIR" -c user.name="$NAME" -c user.email="$MAIL" commit -qm "$msg"
  if git -C "$DIR" push -q "$REMOTE" "HEAD:refs/heads/$BRANCH"; then echo "saved (try $try)"; exit 0; fi
  echo "another run saved first; doing this run again on the newer data (try $try)"
  sleep $(( (RANDOM % 5) + 2 ))
done
echo "could not save after 8 tries"; exit 1
