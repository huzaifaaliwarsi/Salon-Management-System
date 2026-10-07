# SalonOS — Staff Payroll & Monthly Commission (Context + Formulas + Build Plan)

> Created: 2026-10-06 · Source: `SalonOS Reporting Inventory Financial Flow Specification.pdf` v1.0 (§2, §4, §10.2, §10.3, §13, §14) + current code.
> Backend: `src/modules/payroll`, `src/modules/commission`, `src/lib/calculations/payrollCalculations.js`
> Frontend: `src/features/payroll/PayrollPage.tsx`, `src/features/commission/StaffCommissionPage.tsx`

---

## 1. What the spec locks (must never break)

| # | Rule | Spec |
|---|---|---|
| 1 | **Payroll finalization = salary expense/liability snapshot.** Salary payment only settles the liability and must **not** expense salary a second time. | §2, §10.2 |
| 2 | Salary report uses **finalized payroll snapshots** only (drafts never count). Date basis = payroll period + finalized date; payment date shown separately. | §10.2 |
| 3 | Salary report KPIs: **Basic · Attendance Impact · Overtime · Allowances · Deductions · Gross · Net · Paid · Outstanding**. | §10.2 |
| 4 | Payroll snapshot (salary components/rates for the finalized period) is **immutable** after posting. Later staff-rate edits never rewrite history. | §13.3 |
| 5 | Commission comes from the **final posted invoice** only (never from appointments). Base = staff-attributed **net sales after discount**, **excluding tax and tips**. | §4 |
| 6 | Commission earn/reversal are **dated events**. An October refund → October reversal; September stays unchanged. | §4.3, §13 |
| 7 | Commission payout settles the liability; it is **not** a second expense. | §4.3 |
| 8 | Overtime is **manual/authorized only**. Biometric time alone never creates payable overtime. | §11.1 |
| 9 | Money in decimal (never float); package splits use remainder-to-last so parts add up exactly. | §8.3 |
| 10 | Reversals are dated events; nothing financial is deleted. | §13 |
| 11 | Access: Super Admin (all branches), Admin (own branch). **Accountant and Staff have no payroll/commission access**; Staff only sees own finalized payslips/statements. | §15.1 |

**Reconciliation (spec §14):**
- Salary payable = Σ finalized net − Σ completed salary payments (+ reversed payments restore it).
- Commission outstanding = Earned − Reversed − Paid.

---

## 2. Compensation types

| Type | Paid in Payroll | Paid in Commission |
|---|---|---|
| `MONTHLY_SALARY` | Fixed monthly base − absence − penalties + OT + allowances − deductions | — |
| `DAILY_SALARY` | Daily rate × paid days + OT + allowances − deductions | — |
| `MONTHLY_PLUS_COMMISSION` | Same as monthly | ✅ monthly commission run |
| `DAILY_PLUS_COMMISSION` | Same as daily | ✅ monthly commission run |
| `COMMISSION_ONLY` | Base 0 (OT/allowances only if any) | ✅ monthly commission run |

Salary and commission are **two separate liabilities** (two runs, two payments, two report lines). A combined **Monthly Earnings Summary** per staff shows both together (salary net + commission net = total take-home for the month), without merging the ledgers.

---

## 3. Payroll formulas

### 3.1 Day counts for the month (from finalized attendance)
```
Calendar Days     = days in month (28–31)
Working Days      = calendar days − weekly offs (Sunday) − branch holidays (from joining date onward)
Present Days      = PRESENT / LATE / HALF_DAY / ON_TIME records
Paid Leave Days   = PAID_LEAVE records
Unpaid Leave Days = UNPAID_LEAVE records
Absent Days       = ABSENT records
Exceptions        = MISSING_PUNCH + working days with no record   → block finalization
```

### 3.2 Rate in effect (snapshot)
```
Pay terms used = the staff compensation version whose effectiveDate ≤ month end
                 (current staff row if its effectiveDate ≤ month end, otherwise the latest
                  StaffCompensationHistory snapshot with effectiveDate ≤ month end)
```
So a raise entered on 2026-11-01 never changes October payroll.

### 3.3 Divisor (daily value of a monthly salary)
```
Divisor = staff.payrollDivisor (if set)
        else policy.customDivisorDays
        else policy.monthlyAbsenceDivisor: 26 | 30 | CALENDAR_DAYS (28–31) | WORKING_DAYS
Per-Day Salary = Monthly Base ÷ Divisor
```

### 3.4 Monthly (MONTHLY_SALARY, MONTHLY_PLUS_COMMISSION)
```
Basic            = Monthly Base                                   (full month, any month length)
                 = Monthly Base × Employed Days ÷ Month Days      (joined/left mid-month — proration)
                   Employed Days/Month Days = calendar days  (policy CALENDAR_DAYS)
                                            or working days   (policy WORKING_DAYS)
Absence Deduction = Per-Day Salary × (Absent Days + Unpaid Leave Days)
Paid leave / holidays / weekly off → no deduction
```

### 3.5 Daily (DAILY_SALARY, DAILY_PLUS_COMMISSION)
```
Basic         = Daily Rate × Present Days
Leave Pay     = Daily Rate × Paid Leave Days            (if policy.dailyStaffPaidLeaveEligibility)
Holiday Pay   = Daily Rate × Holidays in employment     (if policy.nonWorkedHolidayPaid)
Weekly-off Pay= Daily Rate × Sundays in employment      (if policy.nonWorkedWeeklyOffPaid)
Absence Deduction = 0   (not paid in the first place — never double deduct)
```

### 3.6 Commission only
```
Basic = 0, Absence Deduction = 0 (salary deductions suppressed). OT/allowances still paid if any.
```

### 3.7 Common parts
```
Attendance Penalties = Σ late-in / early-exit deductions from finalized attendance snapshots
                       (staff.combinationPolicy BOTH | HIGHEST_ONLY)
Overtime             = Σ APPROVED, not-yet-locked OT in month: approvedMinutes ÷ 60 × hourly rate snapshot
Allowances           = recurring staff allowances + one-off ALLOWANCE/BONUS adjustments for the month
Other Deductions     = one-off DEDUCTION adjustments + Advance Recovery for the month

Attendance Impact = − (Absence Deduction + Attendance Penalties)      (report column)
Gross    = Basic + Leave/Holiday Pay + Overtime + Allowances
Total Deductions = Absence Deduction + Attendance Penalties + Other Deductions
Net      = Gross − Total Deductions        (never < 0 → finalization blocked with a clear reason)
Paid     = Σ COMPLETED payments
Outstanding = Net − Paid
```

### 3.8 Salary advance (common salon practice)
```
Advance given    → cash/online OUT now (custody: staff receivable, NOT an expense)
Advance recovery → deduction on a payslip (amount per month ≤ remaining advance)
Advance balance  = Σ advances given − Σ recovered in FINALIZED payslips
```
The expense is recognized only once — when payroll is finalized (gross salary). The advance is just early payment.

---

## 4. Monthly commission formulas (spec §4)

```
Line commission (service)    = Service line net sales (after discount) × rate snapshot
Package component commission = (Package net × component weight) × staff rate snapshot
Reversal (refund/void)       = Refunded attributed net × ORIGINAL rate snapshot, dated on refund date

Monthly run (period = 1st … last day of the month):
  Earned    = Σ EARN events dated in month, not yet consumed
  Reversed  = Σ REVERSAL events dated in month, not yet consumed
  Net Commission = max(0, Earned − Reversed)
  Paid / Outstanding as payroll
```
Example (spec): Package PKR 5,000 — Ali 60% @10% = 300; Ahmed 40% @15% = 300.
Tax and tips are never in the base. Dues collection never creates new commission.

---

## 5. Lifecycle (both runs)

```
Preview (DRAFT, recalculated any time, zero money)
   → Finalize (number PAY-/COM-, immutable snapshot, OT/events locked, liability recognized, zero money)
   → Pay (cash drawer OUT / account OUT, partial allowed, Idempotency-Key)
   → Reverse payment (dated IN, outstanding restored)
   → Cancel run (only if no completed payments; releases OT / commission events / advance recovery)
```
Finalize is blocked while any attendance exception exists or any payslip net < 0.

---

## 6. Scenarios (test cases)

| # | Scenario | Expected |
|---|---|---|
| S1 | Monthly 60,000, full attendance, Feb (28 days) | Net 60,000 (no month-length effect) |
| S2 | Monthly 60,000, divisor 30, 2 absent + 1 unpaid leave | Deduction 3 × 2,000 = 6,000 → 54,000 |
| S3 | Monthly 60,000, joined on 16th of 30-day month (calendar) | Basic 60,000 × 15/30 = 30,000 |
| S4 | Daily 2,000, 24 present + 1 paid leave (eligible) | 48,000 + 2,000 = 50,000 |
| S5 | Daily staff, policy holiday paid, 1 branch holiday | + 1 × daily rate |
| S6 | Approved OT 120 min @ 500/hr | + 1,000; OT locked on finalize; never in next month |
| S7 | Rejected / submitted (not approved) OT | Not in payroll |
| S8 | Late-in penalty 200 × 3 days | Penalties 600 |
| S9 | Allowance 3,000 (transport) + one-off bonus 5,000 | Gross +8,000 |
| S10 | Advance 10,000 given 10 Oct; recover 5,000 in Oct payroll | Oct net −5,000; balance 5,000 remains |
| S11 | Raise 60k → 70k effective 1 Nov, entered 25 Oct | October payroll still 60k |
| S12 | Missing punch on a working day | Finalize blocked with the date |
| S13 | Deductions > gross | Finalize blocked (negative net) |
| S14 | Pay 30,000 cash of 54,000 | PARTIALLY_PAID, drawer −30,000, outstanding 24,000 |
| S15 | Reverse that payment | Drawer +30,000, outstanding 54,000 |
| S16 | Cancel run with completed payment | 409 HAS_PAYMENTS |
| S17 | Monthly+Commission staff: 100,000 attributed net @10% | Salary payslip + commission statement 10,000 → summary total |
| S18 | Package commission split (spec example) | Ali 300, Ahmed 300 exactly |
| S19 | Sept sale, Oct refund | Oct run has reversal; Sept statement unchanged |
| S20 | Accountant opens payroll/commission | 403 |
| S21 | Staff portal | Only own FINALIZED payslips/statements |
| S22 | Staff deactivated on 20th (worked 1–19) | Still gets a prorated payslip for that month |

---

## 7. Current status (updated 2026-10-06)

| Area | Status |
|---|---|
| Preview / finalize / pay / reverse / cancel, OT lock, exceptions gate, negative-net block | ✅ |
| Monthly / daily / commission-only base, divisor policy | ✅ |
| Mid-month **join and exit** proration (`Staff.exitDate`, set on deactivate; ex-staff still get the exit-month payslip) | ✅ P1 |
| **Pay terms in force** on the last employed day of the month (`StaffCompensationHistory`) | ✅ P1 |
| **Daily staff holiday / weekly-off pay** per policy flags | ✅ P1 |
| **Recurring allowances** (`/payroll/allowances`) | ✅ P2 |
| **One-off adjustments** ALLOWANCE / BONUS / DEDUCTION per month, locked on finalize (`/payroll/adjustments`) | ✅ P2 |
| **Salary advance** issue (cash/online OUT, `SALARY_ADVANCE` movement) → installment recovery on payslip → released on run cancel; reverse only before any recovery (`/payroll/advances`) | ✅ P2 |
| **Monthly commission run** — `POST /commission/preview { month }` + month picker on the Commission page | ✅ P3 |
| **Monthly Earnings Summary** (salary + commission + pending commission + advance balance) — `GET /payroll/monthly-summary` | ✅ P3 |
| `/reports/staff-salary` (§10.2) and `/reports/staff-commission` (§10.3) APIs | ✅ P4 |
| Payroll page: tabs (Runs · Monthly Summary · Allowances & Adjustments · Salary Advances), new payslip columns, details, print, CSV | ✅ P5 |
| UI bug fixed: late/early penalty was shown twice (`lateEarlyDeductions + attendancePenaltyDeductions`) | ✅ |
| Staff Salary (`/reports/staff-salary`) and Staff Commission (`/reports/staff-commission`) **report pages** — filter row, KPI strip, dense table, totals, Excel (CSV) + Print; read-only | ✅ |
| Staff portal payslip: allowances / adjustments / advance lines; base shows amount actually earned (prorated) | ✅ |
| Payroll runs list: draft shows **Review & Finalize** (no payment on drafts); monthly summary shows a draft only as `est.` (not outstanding); staff who joined after the month are not listed | ✅ |

**Rule notes**
- Pay terms: the version in force on the **last employed day of the month** applies to the whole month (a raise effective 15 Oct applies to all of October; one effective 1 Nov does not touch October).
- Advance recovery is capped so net never goes below 0 because of an advance; the remainder carries to the next month.
- An advance is a custody receivable, never an expense. Salary expense is recognized once — on payroll finalization.

**Tests:** backend 165/165 (new: `15-payroll-engine.test.js` = 14 engine scenarios, `16-payroll-extras.test.js` = 12 API flows incl. reports). Frontend `tsc` clean.

**Browser QA (2026-10-06):** ran against the test DB. As Admin: add an allowance, add a bonus, issue an advance, preview, finalize. Payslip = 85,000 + 2,000 + 3,000 − 3,000 (advance) = **87,000**, and the details, print, monthly summary, salary report and the Zara staff-portal payslip all match. A read-only sweep of the live DB had 0 API errors.
## 8. Build steps (in order)

**Step P1 — Engine correctness**
1. Resolve pay terms effective at month end from `StaffCompensationHistory`.
2. Daily staff: pay holidays / weekly offs per policy flags.
3. Add `Staff.exitDate`; deactivate sets it; payroll includes staff whose employment overlaps the month and prorates exit like join.
4. Tests S1–S8, S11, S22.

**Step P2 — Allowances, deductions, advances**
1. `StaffAllowance { staffId, name, amount, isActive }` (recurring monthly).
2. `PayrollAdjustment { branchId, staffId, month, type ALLOWANCE|BONUS|DEDUCTION, title, amount, status }` (one-off, editable until finalized).
3. `SalaryAdvance { advanceNumber, staffId, amount, method, drawer/account, recoveryPerMonth, status }` + recovery lines on payslip.
4. Engine adds Allowances / Other Deductions / Advance Recovery to the payslip snapshot.
5. APIs + tests S9, S10, S13.

**Step P3 — Monthly commission + combined summary**
1. `POST /commission/preview` accepts `{ month }` → period 1st..last.
2. `GET /payroll/monthly-summary?month=` → per staff: salary net/paid + commission net/paid + total.
3. Tests S17–S19.

**Step P4 — Reports**
1. `/reports/staff-salary` (spec §10.2 columns/KPIs) and `/reports/staff-commission` (§10.3).
2. Reconciliation tests (§14 salary + commission).

**Step P5 — Frontend**
1. Payroll page: allowances/adjustments editor, advance tab, new payslip columns, monthly summary tab.
2. Commission page: month picker.
3. Payslip print: Basic · Attendance Impact · OT · Allowances · Deductions · Advance · Gross · Net.
4. Browser test as Super Admin / Admin / Accountant (403) / Staff (portal).
