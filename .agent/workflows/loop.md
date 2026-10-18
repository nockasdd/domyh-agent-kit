---
description: "Autonomous dev loop: understand, implement, verify, de-sloppify, review, commit"
skills: { required: [coding-rules, testing], contextual: [auto] }
success_criteria: "All iterations complete: build+lint+test pass, zero code smells, review approved"
---

# /loop

## RULES

- L1: Max 5 loop iterations — then STOP and report
- L2: Max 3 retries per same failure — then ESCALATE
- L3: NEVER push to remote — commit only, user controls push
- L4: NEVER refactor code outside task scope; always modify at the **Producing Boundary**, never via defensive patches at the **Consuming Boundary**
- L5: ALWAYS run de-sloppify and read-back (`view_file`) before commit
- L6: Token budget >80% — summarize + persist + STOP
- L7: Enforce Unified Epistemic Quad-State (`[OBSERVATION]` Grade 1–2, `[DERIVATION]` Grade 3, `[INFERENCE]` Grade 4, `[UNKNOWN]` Grade 5) and Missing Coverage Invariant (untested paths = `[UNKNOWN]`)

## LOOP FLOW (7 Phases)

1. **UNDERSTAND** — Read task, `hsa_search` for related files, `hsa_trace_flow(entry, direction: "both")` for deps and **Producing Boundary**, classify SIZE (MICRO/SMALL/MEDIUM/LARGE). LARGE = STOP, break into sub-tasks.
2. **IMPLEMENT** — Follow `/code` canonical write: LOCATE > UNDERSTAND (**Producing Boundary**) > SIZE > WRITE > READ-BACK (`view_file`) > VERIFY. Max 1-3 files per iteration.
3. **VERIFY** — Type check > Lint > Build > Test across the **6-Axis Behavioral Obligation Ledger** (`structural`, `behavioral`, `boundary`, `state`, `error`, `resource`) to obtain `[OBSERVATION]` (Grade 1) proof. If FAIL: auto-fix (max 3). If 3 failures same issue: ESCALATE.
4. **DE-SLOPPIFY** — Remove: `console.log`/`debug`, `debugger`, `any` types, `@ts-ignore`, `eslint-disable` (without reason), unused imports.
5. **REVIEW** — If complexity >=6.5: delegate review to a subagent via `hsa_delegate` (enforce Anti-Authority-Laundering: verify subagent claims before promoting `[INFERENCE]` to `[OBSERVATION]`). Else: self-review across all 6 obligation axes and disclose any `[UNKNOWN]` (Grade 5) gaps.
6. **COMMIT** — `git add`, conventional commit. DO NOT push.
7. **LOOP or EXIT** — More tasks: goto 1. All done: persist + report. Budget >80%: STOP.

## COMMANDS

| Command | Description |
|:--------|:------------|
| `/loop [task]` | Full autonomous loop |
| `/loop fix [issue]` | Fix-only loop |
| `/loop continue` | Resume interrupted |
| `/loop status` | Show current state |

## EXIT CONDITIONS

| Condition | Action |
|:----------|:-------|
| All tasks complete | persist, success report |
| Max 5 iterations | summarize, STOP |
| 3 failures same issue | ESCALATE to user |
| Token >80% | summarize, persist, STOP |
| User "stop"/"done" | commit pending, persist, STOP |

## DE-SLOPPIFY DETAILS

Remove automatically:
- console.log/debug/warn (except logger files)
- debugger statements
- `: any` type annotations (replace with proper types)
- @ts-ignore/@ts-nocheck (except with documented reason)
- eslint-disable (except with inline reason)
- Unused imports

Flag only (user decides):
- TODO/FIXME/HACK markers
- Empty catch blocks

## CHECKPOINT

1. Verify `success_criteria` met with `[OBSERVATION]` (Grade 1) evidence and explicit `[UNKNOWN]` (Grade 5) disclosures
2. `hsa_session({action:'persist', task_summary:'...', files_touched:[...]})`
