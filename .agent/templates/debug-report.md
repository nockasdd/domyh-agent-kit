---
name: debug-report
type: report
triggers: ["/debug"]
---

# Debug Report Template

## {BUG_TITLE}

### Problem

**Error:** `{ERROR_MESSAGE}`
**Symptom File (Consuming Boundary):** `{FILE_PATH}:{LINE}`
**Root Origin (Producing Boundary):** `{PRODUCER_FILE_PATH}:{PRODUCER_LINE}`
**Reproduce (`[OBSERVATION]` Grade 1 `[EMPIRICAL]`):** {STEPS}

### Investigation

| #   | Hypothesis (`[INFERENCE]`) | Test     | Result (`[OBSERVATION]`) |
| --- | -------------------------- | -------- | ------------------------ |
| 1   | {THEORY_1}                 | {TEST_1} | ✅/❌                    |
| 2   | {THEORY_2}                 | {TEST_2} | ✅/❌                    |
| 3   | {THEORY_3}                 | {TEST_3} | ✅/❌                    |

### Root Cause (Producing Boundary)

**Cause:** {EXPLANATION}
**Epistemic State & Proof Grade:** `[OBSERVATION]` (Grade 1 `[EMPIRICAL]`) / `[DERIVATION]` (Grade 3 `[DEDUCTIVE-LOGIC]`)
**Evidence:** {PROOF}

### Fix (Applied at Producing Boundary)

```{LANG}
{FIXED_CODE}
```

### Verification (6-Axis Behavioral Obligation Ledger)

- [ ] `structural`: Types, signatures, imports/exports valid
- [ ] `behavioral`: Reproduction test and unit suite passing (`[OBSERVATION]` Grade 1)
- [ ] `boundary`: Fixed at Producing Boundary (no defensive consuming patch)
- [ ] `state`: State transitions and persistence consistent
- [ ] `error`: Failure modes handled cleanly
- [ ] `resource`: No leaked handles, timers, or child processes

### Residual Risks & Unverified Scope (`[UNKNOWN]` / Grade 5 `[RESIDUAL-RISK]`)

- **Missing Coverage Invariant** (*"Missing coverage is unknown, not absence"*): {UNTESTED_PATHS}

### Prevention

- [ ] Regression test case added at Producing Boundary
- [ ] Docs/episodic memory updated

---
