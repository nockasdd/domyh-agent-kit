---
name: validation-framework
priority: 0
always_apply: true
category: quality
---

# ✅ Validation Framework

> 🌍 **Language / Ngôn ngữ**: English (default) | [Tiếng Việt](#tiếng-việt)
> 📝 **Note**: Consolidates `pre-check-validation.md` + `architecture-aware-implementation.md`

## Enforcement Level: BLOCK

## Description

Before creating or completing ANY new code, agent MUST pass 7-phase validation.

---

## 🔴 7-Phase Pre & Post Implementation Validation

```
┌──────────────────────────────────────────────────────────────┐
│ Phase 1: NECESSITY — Is it needed?                           │
│ → Check user request, YAGNI principle                        │
├──────────────────────────────────────────────────────────────┤
│ Phase 2: DISCOVERY — What exists?                            │
│ → Search for similar files, patterns, utilities              │
├──────────────────────────────────────────────────────────────┤
│ Phase 3: SCOPE — Does request cover this?                    │
│ → Verify against original request, avoid scope creep         │
├──────────────────────────────────────────────────────────────┤
│ Phase 4: PLACEMENT — Where does it fit?                      │
│ → Determine layer, file, module location                     │
├──────────────────────────────────────────────────────────────┤
│ Phase 5: CONNECTIVITY — How will it be used?                 │
│ → Trace imports, exports, consumers                          │
├──────────────────────────────────────────────────────────────┤
│ Phase 6: REGISTRATION — What needs update?                   │
│ → index.json, manifests, exports                             │
├──────────────────────────────────────────────────────────────┤
│ Phase 7: EPISTEMIC BOUNDING — What are the limits & risks?   │
│ → Disclose untested conditions, side-effects, residual risks │
└──────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Necessity (YAGNI)

| Question                   | If NO          |
| -------------------------- | -------------- |
| User explicitly requested? | ❌ STOP        |
| Will be used immediately?  | ❌ STOP        |
| No library solution?       | ⚠️ Use library |

```yaml
red_flags:
  - "Nice to have" features
  - "While I'm here..." changes
  - Building for hypothetical future
  - Adding unused dependencies
```

---

## Phase 2: Discovery

```yaml
search_checklist:
  - grep_search: similar function names
  - Check: utils/, shared/, lib/ directories
  - Review: index files for existing components
  - Verify: no deprecated/moved version exists
```

---

## Phase 3: Scope Validation

| Requested?            | Action     |
| --------------------- | ---------- |
| Explicitly in request | ✅ Proceed |
| Implied by request    | ⚠️ Clarify |
| Not mentioned         | ❌ STOP    |

---

## Phase 4: Placement

### Layer Decision

| Code Type      | Location                    |
| -------------- | --------------------------- |
| Shared utility | `utils/`, `lib/`, `shared/` |
| Domain logic   | `services/`, `domain/`      |
| API handler    | `handlers/`, `routes/`      |
| Data access    | `repositories/`, `store/`   |
| View/UI        | `components/`, `views/`     |

---

## Phase 5: Connectivity

Before creating file, trace:

```yaml
connectivity_check:
  imports:
    - What modules will import this?
    - Are import paths correct?
  exports:
    - What needs to be exported?
    - Default vs named exports?
  consumers:
    - Who will call these functions?
    - What parameters needed?
```

---

## Phase 6: Registration

After creating file, update:

```yaml
registration_checklist:
  - [ ] index.json or manifest.yaml
  - [ ] Export from parent module
  - [ ] Type definitions if TypeScript
  - [ ] README if significant
```

---

## Phase 7: Epistemic & Residual Risk Bounding

Before claiming completion, answer:

| Question | If NO / UNKNOWN |
| ---------------------------------------------------- | ---------------------- |
| Are all assumptions & boundary conditions declared?  | ⚠️ Disclose boundary   |
| Are side-effects & side-channels analyzed?           | ⚠️ Note residual risk  |
| Is Epistemic Quad-State & Proof Grade tagged?        | ❌ Retag state/grade   |
| Is fix applied at the Producing Boundary?            | ❌ Refactor to origin  |
| Is the 6-Axis Behavioral Obligation Ledger checked?  | ⚠️ Mark unverified axes |
| Did I omit superlatives ("100%", "perfect", "zero")? | ❌ Strip superlatives  |

### Unified Epistemic Quad-State ↔ Proof Grade Mapping

| Epistemic State | Proof Grade | Requirement |
| :--- | :--- | :--- |
| `[OBSERVATION]` | Grade 1 `[EMPIRICAL]` / Grade 2 `[STATIC-ANALYSIS]` | Runtime command/test output (exit code 0) or static typecheck/lint/AST check |
| `[DERIVATION]` | Grade 3 `[DEDUCTIVE-LOGIC]` | Direct structural/code deduction with `file:line` citations |
| `[INFERENCE]` | Grade 4 `[THEORETICAL-MODEL]` | Unverified hypothesis or spec extrapolation |
| `[UNKNOWN]` | Grade 5 `[RESIDUAL-RISK]` | Untested paths, missing coverage, external vectors |

### 6-Axis Behavioral Obligation Ledger

| Axis | Verification Obligation |
| :--- | :--- |
| `structural` | AST, types, signatures, and module exports/imports align |
| `behavioral` | Core logic satisfies functional contract on valid inputs |
| `boundary` | Producing boundary emits valid invariants; consuming boundaries are not defensively patched |
| `state` | State transitions, persistence, and caches remain consistent |
| `error` | Exceptions, non-zero exit codes, and fallback paths fail safely |
| `resource` | Memory, file handles, timers, and child processes are bounded and cleaned up |

```yaml
epistemic_checklist:
  - epistemic_quad_state: "[OBSERVATION] | [DERIVATION] | [INFERENCE] | [UNKNOWN]"
  - proof_grade: "[EMPIRICAL] | [STATIC-ANALYSIS] | [DEDUCTIVE-LOGIC] | [THEORETICAL-MODEL] | [RESIDUAL-RISK]"
  - missing_coverage_invariant: "Missing coverage is unknown, not absence"
  - producing_boundary: "Verified fix at producing boundary (not consuming workaround)"
  - obligation_ledger_6_axis: "structural | behavioral | boundary | state | error | resource"
  - negative_space: "What does this code NOT solve?"
  - residual_vectors: "What environmental or external factors remain unaddressed?"
  - humility_enforcement: "Zero ungrounded claims of absolute perfection or total stealth"
```

---

## 📋 Quick Checklist

- [ ] User requested this? (Phase 1)
- [ ] Searched for similar? (Phase 2)
- [ ] Within scope? (Phase 3)
- [ ] Know where to place? (Phase 4)
- [ ] Know who uses it? (Phase 5)
- [ ] Will update registry? (Phase 6)
- [ ] Tagged Epistemic Quad-State `[OBSERVATION/DERIVATION/INFERENCE/UNKNOWN]` & Proof Grade (1–5)? (Phase 7)
- [ ] Verified fix at the Producing Boundary & checked 6-Axis Obligation Ledger? (Phase 7)

---

## ❌ BLOCK Conditions

Agent MUST NOT proceed if:

```yaml
block_conditions:
  - No explicit user request
  - Similar code already exists
  - Out of scope for request
  - Placement unclear
  - YAGNI violation detected
  - Consuming-boundary workaround instead of Producing-boundary fix
  - Authority laundering (upgrading [INFERENCE]/[UNKNOWN] to [OBSERVATION] without proof)
```

---

# Tiếng Việt

> 🇻🇳 Phiên bản Tiếng Việt

## Mô Tả

Trước khi tạo hoặc hoàn tất BẤT KỲ code mới nào, agent PHẢI qua 7 phase validation.

## 7 Phase

1. **Necessity** — Có thực sự cần không? (YAGNI)
2. **Discovery** — Có gì tương tự chưa?
3. **Scope** — Có trong phạm vi yêu cầu không?
4. **Placement** — Đặt ở đâu?
5. **Connectivity** — Ai sẽ dùng?
6. **Registration** — Cần update index nào?
7. **Epistemic Bounding** — Giới hạn, rủi ro tồn đọng, Quad-State & 6-Axis Ledger là gì?

### Bảng Ánh Xạ Epistemic Quad-State ↔ Proof Grades (1–5)

| Trạng thái Nhận thức (Quad-State) | Cấp độ Bằng chứng (Proof Grade) | Yêu cầu Kiểm chứng |
| :--- | :--- | :--- |
| `[OBSERVATION]` | Grade 1 `[EMPIRICAL]` / Grade 2 `[STATIC-ANALYSIS]` | Kết quả chạy lệnh/test thực tế (exit code 0) hoặc typecheck/lint/AST |
| `[DERIVATION]` | Grade 3 `[DEDUCTIVE-LOGIC]` | Suy diễn trực tiếp từ cấu trúc code kèm trích dẫn `file:line` |
| `[INFERENCE]` | Grade 4 `[THEORETICAL-MODEL]` | Giả thuyết kỹ thuật hoặc ngoại suy chưa chạy kiểm chứng thực nghiệm |
| `[UNKNOWN]` | Grade 5 `[RESIDUAL-RISK]` | Nhánh chưa test, thiếu độ phủ (Missing coverage is unknown, not absence), yếu tố ngoại vi |

### Sổ cái Nghĩa vụ Hành vi 6 Trục (6-Axis Behavioral Obligation Ledger)

- `structural` (Cấu trúc): Kiểu dữ liệu, chữ ký hàm, import/export đồng nhất.
- `behavioral` (Hành vi): Logic cốt lõi đáp ứng đúng hợp đồng đầu vào/đầu ra.
- `boundary` (Ranh giới): Sửa tận gốc tại **Producing Boundary** (nơi sinh dữ liệu), không vá tạm tại nơi tiêu thụ (Consuming Boundary).
- `state` (Trạng thái): Chuyển đổi trạng thái, bộ nhớ đệm và lưu trữ nhất quán.
- `error` (Lỗi): Xử lý ngoại lệ, mã thoát và nhánh dự phòng an toàn.
- `resource` (Tài nguyên): Bộ nhớ, file descriptor, bộ đếm thời gian và tiến trình con được giải phóng đầy đủ.

## Checklist Nhanh

- [ ] User yêu cầu? (Phase 1)
- [ ] Đã tìm tương tự? (Phase 2)
- [ ] Trong scope? (Phase 3)
- [ ] Biết đặt ở đâu? (Phase 4)
- [ ] Biết ai dùng? (Phase 5)
- [ ] Sẽ update registry? (Phase 6)
- [ ] Minh bạch rủi ro tồn đọng, tuân thủ *"Missing coverage is unknown, not absence"* & gắn nhãn Quad-State `[OBSERVATION/DERIVATION/INFERENCE/UNKNOWN]` + Proof Grade (1–5)? (Phase 7)
- [ ] Đã sửa đúng ranh giới sinh dữ liệu (Producing Boundary) & đối chiếu đủ 6 trục (`structural`, `behavioral`, `boundary`, `state`, `error`, `resource`)? (Phase 7)

---
