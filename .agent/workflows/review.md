---
description: "👀 Code review for PRs: logic, quality, security, and tests verification"
skills: { required: [security], contextual: [auto] }
success_criteria: "All findings documented with file:line evidence"
---

# 👀 /review — Review Pro

> 5-Category AI-Powered Code Review
> 📚 Logic • Quality • Security • Performance • Tests • Auto-Diff

---

## ⛔ RULES (Always Apply)

| # | Rule | Category |
|:--|:-----|:---------|
| R1 | All findings MUST have `file:line` evidence and **Epistemic Quad-State** (`[OBSERVATION]`, `[DERIVATION]`, `[INFERENCE]`, `[UNKNOWN]`) ↔ Proof Grades (1–5) | Quality |
| R2 | Self-review own findings — remove false positives and prevent **Authority Laundering** (`[INFERENCE]`/`[UNKNOWN]` $\nrightarrow$ `[OBSERVATION]`) | Epistemic |
| R3 | Enforce **Producing Boundary** fixes — reject defensive workarounds at the consuming boundary | Architecture |
| R4 | Never approve without running tests and checking the **6-Axis Behavioral Obligation Ledger** (`structural`, `behavioral`, `boundary`, `state`, `error`, `resource`); **Missing coverage is unknown, not absence** | Safety |

---

## REVIEW FLOW

1. **CONTEXT** — Detect stack via HSA (`hsa_detect`), load review context (`hsa_search`), `hsa_prefetch` changed files. Auto-detect review scope: staged changes, uncommitted, or PR
2. **DIFF ANALYSIS** — Parse `git diff --staged` or PR diff, classify change types, identify high-risk areas (auth, payments, data). Use `hsa_trace_flow(detail:"summary")` to trace Producing vs Consuming Boundaries of changed functions. Show: `[Analyzing] 12 files changed, 3 high-risk`
3. **REVIEW** — Apply 5-category + 6-Axis Obligation checklist on changed code, inline comments with severity and Proof Grade
4. **SELF-REVIEW** — Agent re-reads own findings, removes false positives, verifies evidence accuracy
5. **REPORT** — Structured feedback with severity, Epistemic Quad-State tags, Producing Boundary remedies, and approve/comment/request changes decision
6. **PERSIST** — Save review findings to `.domyh/reviews/review_YYYY-MM-DD.md`
7. **SYNC** — `hsa_check_changes` to update index, `hsa_feedback` on reviewed files

---

## COMMANDS

| Command            | Description                       |
| ------------------ | --------------------------------- |
| `/review`          | Review staged/uncommitted changes |
| `/review [file]`   | Review specific file              |
| `/review pr #123`  | Review GitHub PR                  |
| `/review security` | Security-focused review           |
| `/review quick`    | Quick sanity check                |
| `/review --diff`   | Review only changed lines         |

---

## 5-CATEGORY & 6-AXIS CHECKLIST

### 1️⃣ Logic, Behavioral & Producing Boundary (`behavioral`, `boundary`, `state`)

- Fixed at the **Producing Boundary** (not patched at the consuming boundary)? Edge cases handled? Off-by-one errors? Null/nil safety? State transitions & race conditions? Error propagation (`error`)?

### 2️⃣ Code Quality & Structural (`structural`)

- DRY (no duplication)? Single responsibility? Clear naming? Zero redundant WHAT comments? Consistent style?

### 3️⃣ Security

- Input validation? SQL injection safe? XSS prevention? Auth/authz checked? Secrets in code? Untrusted content (`_meta.provenance.untrusted_content`) isolated?

### 4️⃣ Performance & Resource (`resource`)

- N+1 queries? Unnecessary computation? Large datasets handled? Caching considered? Memory, file handles, timers, and child processes cleaned up?

### 5️⃣ Tests & Epistemic Coverage

- Tests for new code (`[OBSERVATION]` Grade 1)? Edge cases covered? Untested paths explicitly disclosed as `[UNKNOWN]` (**Missing coverage is unknown, not absence**)?

---

## FEEDBACK TYPES

| Type          | Severity     | Action Required       |
| ------------- | ------------ | --------------------- |
| 🔴 Blocker    | Critical     | Must fix before merge |
| 🟠 Issue      | Important    | Should fix            |
| 🟡 Suggestion | Nice to have | Consider              |
| 🔵 Nitpick    | Style        | Optional              |
| 💡 Praise     | Positive     | None                  |

### Feedback Format

```
🟠 **Issue** `file.ts:42` (Confidence: 8/10)
**Finding:** Missing null check before accessing `user.id`
**Risk:** NullPointerException in production
**Fix:** `if (!user) return res.status(404).json({ error: 'User not found' })`
```

---

## GITHUB CLI

| Operation       | Command                                   |
| --------------- | ----------------------------------------- |
| List PRs        | `gh pr list`                              |
| View PR         | `gh pr view #123`                         |
| PR diff         | `gh pr diff #123`                         |
| Checkout        | `gh pr checkout #123`                     |
| Approve         | `gh pr review --approve`                  |
| Comment         | `gh pr review --comment -b "msg"`         |
| Request changes | `gh pr review --request-changes -b "msg"` |

---

## SAST TOOL INTEGRATION

> If available, run BEFORE AI review for higher accuracy:

```yaml
pre_review_tools:
  javascript: "npx eslint --format json {files}; npm audit --json"
  python: "ruff check {files} --output-format json; bandit -r {files} -f json"
  go: "go vet {files}; govulncheck ./..."
  general: "semgrep --config auto --json {files}"
```

---

## 🔄 DELEGATION (Recommended)

⚠️ **Evaluate before EXECUTE step** — see `delegation-intelligence` skill for scoring.

For deep code review, delegate to a review subagent:
```
hsa_delegate({action:'prepare', task_type:'review', task_description:'[detailed prompt]', focus_files:[...]})
→ dispatch via the platform's native subagent tool
```
**Auto-delegate** (weighted score ≥6.5): Security-critical (auth, payments), >20 files PR
**Suggest delegation** (weighted score 4.0-6.5): Architecture review, cross-cutting changes

---

## REFLECTION CHECKPOINT

⛔ **MANDATORY** — Execute before completing this workflow (SESSION_001):

1. **VERIFY** — Does output meet success_criteria (see YAML frontmatter)?
2. **PERSIST** (if HSA available — preferred, 1 tool call):
   - `hsa_session({action:'persist', task_summary:'[workflow] [summary]', files_touched:[...]})`
   - If key decision → `hsa_session({action:'anchor', content:'[decision]', category:'decision'})`
3. **PERSIST** (if HSA unavailable — manual fallback):
   - Append task summary to `memory/session.md`
   - If last task → Update `memory/CONTEXT_SNAPSHOT.md`

