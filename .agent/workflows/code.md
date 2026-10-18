---
description: "Write production-ready code with double-ended rules, pre-read trace, post-read verification, and plan alignment"
skills: { required: [coding-rules], contextual: [auto, domyh-design, tailwind] }
success_criteria: "Pre-read verified, surgical change applied, post-read confirmed, build/tests passed, plan aligned"
---

# /code — Production Coding Workflow

## 🛡️ [GATE 0: PRE-FLIGHT HARD RULES — READ BEFORE CODING]

1. **NO BLIND WRITING**: NEVER write or modify code without reading the target file (`view_file` / `hsa_search`). Never act on assumptions.
2. **SURGICAL CHANGES & PRODUCING BOUNDARY**: Touch ONLY requested scope. Fix defects at the **Producing Boundary** (where invalid data/state originates), NEVER via defensive patches at the consuming boundary. Match existing style, syntax, and indentation 100%.
3. **SIZE SAFETY**: If changing >50 lines or creating >2 new files ➔ MUST STOP and confirm Implementation Plan with user.
4. **COMMENT POLICY**: Default NO comments describing WHAT (code explains itself). Only write concise comments for WHY (constraints, workarounds, surprises).
5. **READ-BACK MANDATE**: After EDITING any file, MUST read back the modified lines (`view_file`) to verify diff and syntax before proceeding.
6. **EPISTEMIC QUAD-STATE & HUMILITY**: Tag completion claims with **Epistemic Quad-State** (`[OBSERVATION]`, `[DERIVATION]`, `[INFERENCE]`, `[UNKNOWN]`) ↔ Proof Grades (1–5). **Missing coverage is unknown, not absence.** Never launder subagent `[INFERENCE]`/`[UNKNOWN]` into `[OBSERVATION]`.

---

## 🔄 6-PHASE SYSTEMATIC CODE FLOW

### PHASE 1: DISCOVER & ASSUMPTIONS
*   **Parse Intent**: Classify goal (`feature` | `bugfix` | `refactor` | `test` | `add`).
*   **Stack & Skill Detection**: Call `hsa_detect(stack)` and `hsa_search(query, action="skills")` to load appropriate patterns and rules.
*   **Standards On-Demand**: Call `hsa_search(action="skill_data", skill_id="coding-rules", section="naming-conventions")` or `section="error-handling"` for domain-specific formatting and conventions.
*   **UI Intent**: If UI-related:
    *   New (T1): Load UI design skill.
    *   Modify (T2): Run design analysis.
    *   Complex (T3): Redirect to `/visualize`.
*   **Surface Assumptions**: State scope, format, technology choices, and constraints explicitly. STOP if ambiguous.

### PHASE 2: PRE-READ & TRACE FLOW (DRY & Producing Boundary Enforcement)
*   **Locate Target**: Pin exact file and line ranges at the **Producing Boundary** to modify.
*   **Pre-Reading**: Call `view_file` to read full surrounding context (imports, interfaces, types, exports).
*   **Trace Flow**:
    *   If modifying function/class: Run `hsa_trace_flow(entry, direction:"both", detail:"summary")` (paginate via `view_id`/`page` if large) or grep callers to identify all dependents.
    *   If creating new code: Search `utils/`, `shared/`, `lib/` to reuse existing utilities before creating new ones.
*   **6-Axis Behavioral Obligation Ledger**: Identify obligations across `structural`, `behavioral`, `boundary`, `state`, `error`, and `resource` upfront.

### PHASE 3: SURGICAL IMPLEMENTATION & TDD
*   **TDD / Test-First**: For business logic or bug fixes, write reproducing test (RED) before implementation (GREEN) at the **Producing Boundary**.
*   **Precision Editing**:
    *   Use `replace_file_content` for localized chunk replacements.
    *   Use `write_to_file` when creating new standalone files.
*   **YAGNI & Simplicity**: Write minimum code that solves the problem. No speculative features.

### PHASE 4: POST-EDIT READ-BACK & DIFF VERIFICATION
*   **Mandatory Read-Back**: Call `view_file` on modified line ranges immediately after edit.
*   **Diff Quality & 6-Axis Checklist**:
    *   [ ] Syntax, brackets, and indentation match existing file 100% (`structural`)?
    *   [ ] Fix applied at the **Producing Boundary** without defensive consuming-boundary patches (`boundary`)?
    *   [ ] Core logic, state transitions, error paths, and resource cleanup verified (`behavioral`, `state`, `error`, `resource`)?
    *   [ ] Comment Policy respected (no redundant comments or version tags)?

### PHASE 5: RUN EVIDENCE & TEST LOOP
*   **Execution Evidence**: Run project test and build commands (`pnpm test`, `tsc --noEmit`, `pnpm build`, etc.) to obtain `[OBSERVATION]` (Grade 1 `[EMPIRICAL]` / Grade 2 `[STATIC-ANALYSIS]`).
*   **Auto Test Loop**: Edit ➔ Read-Back ➔ Test (Max 3 iterations).
*   **Escalation Gate**: If still failing after 3 attempts ➔ STOP immediately, analyze root cause via SCAMPER, and escalate to user.

### PHASE 6: PLAN & RULES PRE-REPORT AUDIT
*   **Plan Alignment**: Cross-check implemented code against every item in user request / approved Plan.
*   **Index Refresh**: Run `hsa_check_changes` to update Merkle tree and BM25F search index.
*   **Session Persistence**: Persist task summary via `hsa_session(action="persist")`.

---

## ⚡ SUB-COMMANDS

| Command | Mode | Description |
|:--------|:-----|:------------|
| `/code [task]` | Create / General | Implement new features or full module development |
| `/code fix [issue]` | Bugfix | Fix bugs: Reproduce ➔ Trace Producing Boundary ➔ Surgical Fix ➔ Verify |
| `/code improve [area]` | Refactor | Code refactoring (requires 100% existing test pass) |
| `/code add [feature]` | Feature Extension | Add new endpoint, component, or sub-module |
| `/code test [feature]` | Test Suite | Write unit, integration, or E2E tests |

---

## 🤝 SUBAGENT DELEGATION

*   **Auto delegate** (Complexity Score $\ge$ 6.5 or scope > 200 lines): Decompose and dispatch to the platform's native subagent tool. Require `epistemic_state` and `unverified_unknowns` in handoffs (Anti-Authority-Laundering).
*   **Suggest delegation** (Score 4.0 – 6.5 or scope 100 – 200 lines): Propose the decomposition to the user before dispatching.

---

## 🎯 [GATE 9: POST-FLIGHT CLOSING CHECKLIST — VERIFY BEFORE REPORTING]

Before sending final response to user, MUST self-audit these 7 golden questions:
1.  ✅ **Did I read target file BEFORE modifying and fix at the Producing Boundary?** *(With concrete file:line citations)*
2.  ✅ **Did I read back file AFTER modifying?** *(Confirmed clean diff and valid syntax)*
3.  ✅ **Did I execute real test/build commands for `[OBSERVATION]` evidence?** *(Never say "should work")*
4.  ✅ **Did I verify the 6-Axis Behavioral Obligation Ledger (`structural`, `behavioral`, `boundary`, `state`, `error`, `resource`)?**
5.  ✅ **Were Surgical Change and Comment Policy strictly respected?**
6.  ✅ **Did I tag Epistemic Quad-State (`[OBSERVATION]`, `[DERIVATION]`, `[INFERENCE]`, `[UNKNOWN]`) ↔ Proof Grades (1–5) and avoid superlatives?**
7.  ✅ **Did I enforce `"Missing coverage is unknown, not absence"` and disclose untested paths / residual risks as `[UNKNOWN]`?**
