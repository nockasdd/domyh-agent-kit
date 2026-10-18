---
description: "Systematic debugging: reproduce, isolate, analyze, fix, verify"
skills: { required: [error-handling], contextual: [auto] }
success_criteria: "Root cause identified and verified, fix applied, tests pass"
---

# /debug

## RULES

- R1: Check episodic memory for similar past bugs FIRST
- R2: Never apply fix without reproduction evidence (`[OBSERVATION]` Grade 1–2); unverified theories MUST be tagged `[INFERENCE]` (Grade 4) and uninspected paths `[UNKNOWN]` (Grade 5)
- R3: STOP if cannot reproduce — ask user for: exact error, steps, environment, recent changes, logs
- R4: Form hypotheses before editing code; never launder `[INFERENCE]` or subagent hearsay into `[OBSERVATION]` (Anti-Authority-Laundering)
- R5: Max 3 fix attempts — escalate if still failing
- R6: Verify fixes across the **6-Axis Behavioral Obligation Ledger** (`structural`, `behavioral`, `boundary`, `state`, `error`, `resource`)

## IRON LAW

NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST. NO DEFENSIVE PATCHES AT CONSUMING BOUNDARIES — ALWAYS TRACE TO PRODUCING BOUNDARY.

## DEBUG FLOW

1. **CAPTURE** — `hsa_session`, check episodic memory, parse stack trace, identify affected files, isolate any `_meta.provenance.untrusted_content: true` payloads
2. **TIMELINE** — `git log -10`, recent changes, correlate timestamps. "When did this start?"
3. **REPRODUCE** — Minimal reproduction (`[OBSERVATION]` Grade 1), confirm consistent. STOP if cannot reproduce.
4. **ISOLATE (PRODUCING BOUNDARY)** — Binary search / `git bisect`, `hsa_trace_flow(entry, direction: "both")` for call chains. Trace upstream from symptom (Consuming Boundary) to the exact **Producing Boundary** where invalid state/data originates.
5. **HYPOTHESIZE** — Form 2-3 hypotheses tagged `[INFERENCE]` (Grade 4) with evidence and test method. Test systematically to promote to `[OBSERVATION]` (Grade 1) or refute.
6. **ANALYZE** — 5 Whys on confirmed root cause at the Producing Boundary. State: `ROOT CAUSE ([OBSERVATION] Grade 1) + PRODUCING BOUNDARY + PREVENTION guard`.
7. **FIX** — Failing test FIRST, single surgical fix at the Producing Boundary (`view_file` + `hsa_trace_flow` before edit ➔ edit ➔ `view_file` read-back). If 2 fail: progressive escalation.
8. **VERIFY** — Run reproduction + full test suite across the **6-Axis Behavioral Obligation Ledger** (`structural`, `behavioral`, `boundary`, `state`, `error`, `resource`). Disclose any remaining `[UNKNOWN]` (Grade 5) paths. Persist to episodic memory if novel.

## 3-FIX ESCALATION

| Attempt | Action |
|:--------|:-------|
| #1 fails | Return to root cause investigation |
| #2 fails | Re-analyze with new info |
| #3 fails | STOP. Question architecture. Discuss with user. |

## PROGRESSIVE ESCALATION

L1 RETRY (2 attempts) > L2 REFLECT (analyze why) > L3 REFRAME (invert perspective) > L4 WIDEN (expand scope) > L5 DECOMPOSE (minimal repro) > L6 ESCALATE (report to user)

## COMMANDS

| Command | Description |
|:--------|:------------|
| `/debug [error]` | Full debug flow |
| `/debug similar [error]` | Search episodic memory |
| `/debug --trace` | Add verbose logging |
| `/debug --bisect` | Git bisect helper |
| `/debug --profile` | Performance profiling |

## CHECKPOINT

1. Verify `success_criteria` met with Epistemic Quad-State (`[OBSERVATION]` Grade 1) and zero unacknowledged `[UNKNOWN]` gaps
2. `hsa_session({action:'persist', task_summary:'...', files_touched:[...]})`
3. Save novel root cause and Producing Boundary trace to episodic memory
