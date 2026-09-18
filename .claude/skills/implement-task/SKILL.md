---
name: implement-task
description: Implement one task from docs/TASKS.md end to end (plan, code, tests, review, tick). Invoke as /implement-task T-XX.
disable-model-invocation: true
---

Implement task **$ARGUMENTS** from `docs/TASKS.md`.

1. **Load context.** Read the task line, its deps, and only the spec sections it needs (use the spec index in root CLAUDE.md). If a dep is unticked, stop and tell me.
2. **Clarify.** If the spec is silent or ambiguous on anything that affects a contract, ask me before coding (max 3 questions, each with your recommended answer).
3. **Plan.** Show a short plan: files to create/change, tests to add, human steps needed (phone checks, expo.dev/EAS logins), and how "Done when" will be verified. Wait for my OK.
4. **Implement** in small steps. Write or update tests first for Core logic, crypto, and API behaviour.
5. **Verify.** Run the area's test command(s) from the relevant CLAUDE.md. Fix until green. For app screens and interactions, list the exact on-phone checks for me (`npx expo start`) and what to look for.
6. **Review.** Run the `spec-reviewer` subagent on the diff. For crypto paths also run `crypto-reviewer`. Fix all Blockers.
7. **Close.** Tick the task in `docs/TASKS.md`; append any decision to `docs/DECISIONS.md`; if a follow-up is needed, add a new task line with the next free ID in the same milestone.
8. **Report** in 3 lines: what changed, how it was verified, what is left. Suggest the commit message `T-XX: ...`.
