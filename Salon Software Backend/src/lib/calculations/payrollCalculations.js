// Payroll engine (see payroll.md §3). Originally ported from frontend src/lib/payrollCalculations.ts;
// the backend version is now the source of truth and adds exit proration, daily holiday/weekly-off pay,
// allowances, one-off adjustments and salary-advance recovery. Output keeps the frontend PayslipRecord shape.
import { roundCurrency } from "./taxCalculations.js";
import { isWorkingDay } from "./attendanceCalculations.js";

const PRESENT_STATUSES = ["PRESENT", "ON_TIME", "LATE", "HALF_DAY", "COMPLETED"];

function getCalendarDaysInMonth(yearMonth) {
  const [yearStr, monthStr] = yearMonth.split("-");
  return new Date(parseInt(yearStr, 10), parseInt(monthStr, 10), 0).getDate();
}

const sum = (rows, f = (r) => r.amount) => roundCurrency(rows.reduce((s, r) => s + (Number(f(r)) || 0), 0));
const fmt = (n) => Number(n || 0).toLocaleString();

/**
 * @param staff        StaffMember DTO (pay terms already resolved for the month; may carry `exitDate`)
 * @param month        'YYYY-MM'
 * @param policy       PayrollPolicy DTO
 * @param attendanceRecords / overtimeRecords / branchHolidays  frontend DTO shapes
 * @param extras       { allowances: [{id,name,amount}], adjustments: [{id,type,title,amount}],
 *                       advances: [{id,advanceNumber,balance,recoveryPerMonth}] }
 */
function evaluateEmployeePayroll(staff, month, policy, attendanceRecords, overtimeRecords, branchHolidays = [], extras = {}) {
  const totalCalendarDays = getCalendarDaysInMonth(month);
  const startDateStr = `${month}-01`;
  const endDateStr = `${month}-${String(totalCalendarDays).padStart(2, "0")}`;
  const exitDate = staff.exitDate || null;
  const employed = (d) => !(staff.joiningDate && staff.joiningDate > d) && !(exitDate && exitDate < d);

  const dates = Array.from({ length: totalCalendarDays }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  // Full-month schedule (ignores joining date) — the base for divisor WORKING_DAYS and proration.
  const fullMonthStaff = { ...staff, joiningDate: undefined };
  const workingDaysInMonth = dates.filter((d) => isWorkingDay(d, fullMonthStaff, branchHolidays).isWorking).length;

  const empAttendance = attendanceRecords.filter((a) => a.staffId === staff.id && a.date.startsWith(month));
  let presentDays = 0, paidLeaveDays = 0, unpaidLeaveDays = 0, absentDays = 0, missingPunchDays = 0, unrecordedDays = 0;
  let paidHolidayDays = 0, paidWeeklyOffDays = 0;
  const exceptionDetails = [];
  const consumedAttendanceDates = [];
  let attendancePenaltyDeductions = 0;

  for (const dateStr of dates) {
    if (!employed(dateStr)) continue;
    const check = isWorkingDay(dateStr, staff, branchHolidays);
    const att = empAttendance.find((a) => a.date === dateStr);
    if (check.isWorking) {
      if (!att) {
        unrecordedDays++;
        exceptionDetails.push(`Unrecorded attendance on ${dateStr}`);
        continue;
      }
      consumedAttendanceDates.push(dateStr);
      if (att.status === "MISSING_PUNCH" || att.isMissingPunch) {
        missingPunchDays++;
        exceptionDetails.push(`Missing Punch on ${dateStr} (In: ${att.checkIn || "none"}, Out: ${att.checkOut || "none"})`);
      } else if (att.status === "ABSENT") absentDays++;
      else if (att.status === "PAID_LEAVE") paidLeaveDays++;
      else if (att.status === "UNPAID_LEAVE") unpaidLeaveDays++;
      else {
        presentDays++;
        attendancePenaltyDeductions += att.calculationSnapshot?.totalDeductionAmount || 0;
      }
    } else if (att && att.status !== "HOLIDAY" && att.status !== "OFF_DAY") {
      // Worked (or took leave) on a holiday / weekly off.
      consumedAttendanceDates.push(dateStr);
      if (att.status === "PAID_LEAVE") paidLeaveDays++;
      else if (att.status === "UNPAID_LEAVE") unpaidLeaveDays++;
      else if (PRESENT_STATUSES.includes(att.status)) {
        presentDays++;
        attendancePenaltyDeductions += att.calculationSnapshot?.totalDeductionAmount || 0;
      }
    } else if (check.reason?.startsWith("Holiday")) paidHolidayDays++;
    else if (check.reason?.startsWith("Weekly off")) paidWeeklyOffDays++;
  }
  attendancePenaltyDeductions = roundCurrency(attendancePenaltyDeductions);

  // ── Overtime (approved, not yet locked by a finalized run) ──
  const empOvertime = overtimeRecords.filter(
    (ot) => ot.staffId === staff.id && ot.date.startsWith(month) && ot.status === "APPROVED" && !ot.payrollId
  );
  const hourlyRateSnapshot = staff.overtimeHourlyRate ?? 0;
  let approvedOvertimeMinutes = 0, approvedOvertimeAmount = 0;
  const consumedOvertimeIds = [];
  for (const ot of empOvertime) {
    const mins = ot.approvedMinutes || ot.minutes || 0;
    approvedOvertimeMinutes += mins;
    const rate = ot.hourlyRate ?? hourlyRateSnapshot;
    approvedOvertimeAmount += ot.amount ?? roundCurrency(mins / 60 * rate);
    consumedOvertimeIds.push(ot.id);
  }
  approvedOvertimeAmount = roundCurrency(approvedOvertimeAmount);

  // ── Divisor ──
  let divisorUsed;
  if (staff.payrollDivisor && staff.payrollDivisor > 0) divisorUsed = staff.payrollDivisor;
  else if (typeof policy.customDivisorDays === "number" && policy.customDivisorDays > 0) divisorUsed = policy.customDivisorDays;
  else if (policy.monthlyAbsenceDivisor === 26 || policy.monthlyAbsenceDivisor === 30) divisorUsed = policy.monthlyAbsenceDivisor;
  else if (policy.monthlyAbsenceDivisor === "WORKING_DAYS") divisorUsed = workingDaysInMonth || 26;
  else divisorUsed = totalCalendarDays;

  // ── Basic pay ──
  const isMonthly = staff.compensationType === "MONTHLY_SALARY" || staff.compensationType === "MONTHLY_PLUS_COMMISSION";
  const isDaily = staff.compensationType === "DAILY_SALARY" || staff.compensationType === "DAILY_PLUS_COMMISSION";
  let isProrated = false, prorationFormula = "";
  let baseEarnings = 0, leaveEarnings = 0, holidayEarnings = 0, absenceDeductions = 0;
  const joinedMidMonth = !!staff.joiningDate && staff.joiningDate > startDateStr && staff.joiningDate <= endDateStr;
  const leftMidMonth = !!exitDate && exitDate >= startDateStr && exitDate < endDateStr;

  if (isMonthly) {
    const fullMonthlyBase = staff.baseSalary || 0;
    if (joinedMidMonth || leftMidMonth) {
      isProrated = true;
      const span = dates.filter(employed);
      if (policy.prorationMethod === "WORKING_DAYS") {
        const workedSpan = span.filter((d) => isWorkingDay(d, staff, branchHolidays).isWorking).length;
        baseEarnings = roundCurrency(fullMonthlyBase * (workingDaysInMonth > 0 ? workedSpan / workingDaysInMonth : 1));
        prorationFormula = `Prorated by working days: ${workedSpan}/${workingDaysInMonth} of PKR ${fmt(fullMonthlyBase)}`;
      } else {
        baseEarnings = roundCurrency(fullMonthlyBase * span.length / totalCalendarDays);
        prorationFormula = `Prorated by calendar days: ${span.length}/${totalCalendarDays} of PKR ${fmt(fullMonthlyBase)}`;
      }
    } else {
      baseEarnings = fullMonthlyBase;
    }
    absenceDeductions = roundCurrency(roundCurrency(fullMonthlyBase / divisorUsed) * (absentDays + unpaidLeaveDays));
  } else if (isDaily) {
    const dailyRate = staff.dailySalaryRate || 0;
    baseEarnings = roundCurrency(dailyRate * presentDays);
    if (policy.dailyStaffPaidLeaveEligibility !== false && paidLeaveDays > 0) leaveEarnings = roundCurrency(dailyRate * paidLeaveDays);
    if (!policy.nonWorkedHolidayPaid) paidHolidayDays = 0;
    if (!policy.nonWorkedWeeklyOffPaid) paidWeeklyOffDays = 0;
    holidayEarnings = roundCurrency(dailyRate * (paidHolidayDays + paidWeeklyOffDays));
  }
  if (!isDaily) { paidHolidayDays = 0; paidWeeklyOffDays = 0; }

  // ── Allowances, one-off adjustments ──
  const allowanceLines = (extras.allowances || []).map((a) => ({ id: a.id, name: a.name, amount: roundCurrency(Number(a.amount)) }));
  const adjustments = (extras.adjustments || []).map((a) => ({ id: a.id, type: a.type, title: a.title, amount: roundCurrency(Number(a.amount)) }));
  const recurringAllowances = sum(allowanceLines);
  const oneOffAllowances = sum(adjustments.filter((a) => a.type === "ALLOWANCE"));
  const bonusAmount = sum(adjustments.filter((a) => a.type === "BONUS"));
  const otherDeductions = sum(adjustments.filter((a) => a.type === "DEDUCTION"));
  const allowancesTotal = roundCurrency(recurringAllowances + oneOffAllowances + bonusAmount);

  const grossPayable = roundCurrency(baseEarnings + leaveEarnings + holidayEarnings + approvedOvertimeAmount + allowancesTotal);
  const preAdvanceDeductions = roundCurrency(absenceDeductions + attendancePenaltyDeductions + otherDeductions);

  // ── Advance recovery: planned installment, never more than the balance or the remaining net ──
  let room = Math.max(0, roundCurrency(grossPayable - preAdvanceDeductions));
  const advanceRecoveries = [];
  for (const adv of extras.advances || []) {
    const planned = Math.min(Number(adv.recoveryPerMonth), Number(adv.balance));
    const amt = roundCurrency(Math.min(planned, room));
    if (amt > 0) {
      advanceRecoveries.push({ advanceId: adv.id, advanceNumber: adv.advanceNumber, amount: amt, balanceBefore: Number(adv.balance), balanceAfter: roundCurrency(Number(adv.balance) - amt) });
      room = roundCurrency(room - amt);
    }
  }
  const advanceRecoveryAmount = sum(advanceRecoveries);

  const totalDeductions = roundCurrency(preAdvanceDeductions + advanceRecoveryAmount);
  const netPayable = roundCurrency(grossPayable - totalDeductions);
  const attendanceImpact = roundCurrency(-(absenceDeductions + attendancePenaltyDeductions));

  let canFinalize = true, blockReason;
  const hasExceptions = exceptionDetails.length > 0;
  if (hasExceptions) {
    canFinalize = false;
    blockReason = `Unresolved attendance exceptions: ${exceptionDetails.slice(0, 2).join("; ")}${exceptionDetails.length > 2 ? ` (+${exceptionDetails.length - 2} more)` : ""}`;
  } else if (netPayable < 0) {
    canFinalize = false;
    blockReason = `Negative salary entitlement detected (PKR ${netPayable}). Deductions exceed gross earnings. Review penalties/adjustments before finalization.`;
  }

  const extrasText = ` + Allowances (PKR ${fmt(allowancesTotal)}) - Other Deductions (PKR ${fmt(otherDeductions)}) - Advance Recovery (PKR ${fmt(advanceRecoveryAmount)})`;
  let formula;
  if (isMonthly) {
    formula = `Base Salary (PKR ${fmt(baseEarnings)}) - Absences (${absentDays + unpaidLeaveDays}d @ PKR ${fmt(roundCurrency((staff.baseSalary || 0) / divisorUsed))}/d = PKR ${fmt(absenceDeductions)}) - Penalties (PKR ${fmt(attendancePenaltyDeductions)}) + Overtime (${approvedOvertimeMinutes}m @ PKR ${fmt(hourlyRateSnapshot)}/hr = PKR ${fmt(approvedOvertimeAmount)})${extrasText} = Net PKR ${fmt(netPayable)}`;
  } else if (isDaily) {
    formula = `Daily Rate (PKR ${fmt(staff.dailySalaryRate)} × ${presentDays} present days = PKR ${fmt(baseEarnings)}) + Paid Leave (${paidLeaveDays}d = PKR ${fmt(leaveEarnings)}) + Holidays/Weekly Off (${paidHolidayDays + paidWeeklyOffDays}d = PKR ${fmt(holidayEarnings)}) - Penalties (PKR ${fmt(attendancePenaltyDeductions)}) + Overtime (PKR ${fmt(approvedOvertimeAmount)})${extrasText} = Net PKR ${fmt(netPayable)}`;
  } else {
    formula = `Commission-Only Contract: Base Salary = PKR 0. Approved Overtime = PKR ${fmt(approvedOvertimeAmount)}${extrasText}. Net PKR ${fmt(netPayable)}. Commission earned is processed separately.`;
  }

  return {
    canFinalize,
    blockReason,
    payslip: {
      staffId: staff.id,
      staffName: staff.name,
      employeeCode: staff.employeeCode,
      designation: staff.designation || staff.roleTitle,
      branchId: staff.branchId,
      month,
      compensationType: staff.compensationType,
      effectiveBaseSalary: staff.baseSalary || 0,
      effectiveDailyRate: staff.dailySalaryRate || 0,
      termsEffectiveDate: staff.effectiveDate,
      exitDate: exitDate || undefined,
      workingDaysInMonth,
      calendarDaysInMonth: totalCalendarDays,
      presentDays,
      paidLeaveDays,
      unpaidLeaveDays,
      absentDays,
      paidHolidayDays,
      paidWeeklyOffDays,
      missingPunchDays,
      unrecordedDays,
      hasExceptions,
      exceptionDetails: hasExceptions ? exceptionDetails : void 0,
      baseEarnings,
      leaveEarnings,
      holidayEarnings,
      absenceDeductions,
      lateEarlyDeductions: attendancePenaltyDeductions,
      attendancePenaltyDeductions,
      attendanceImpact,
      approvedOvertimeMinutes,
      approvedOvertimeHourlyRate: hourlyRateSnapshot,
      approvedOvertimeAmount,
      consumedOvertimeIds,
      consumedAttendanceDates,
      allowanceLines,
      adjustments,
      recurringAllowances,
      oneOffAllowances,
      bonusAmount,
      allowancesTotal,
      otherDeductions,
      advanceRecoveries,
      advanceRecoveryAmount,
      grossPayable,
      totalDeductions,
      netPayable,
      paidAmount: 0,
      outstandingAmount: Math.max(0, netPayable),
      calculationDetails: {
        formula,
        divisorUsed,
        prorationApplied: isProrated,
        prorationFormula: isProrated ? prorationFormula : void 0,
        dailyRateUsed: roundCurrency((staff.baseSalary || 0) / divisorUsed),
        policyNotes: `Policy Divisor: /${divisorUsed}. Daily Leave Eligible: ${policy.dailyStaffPaidLeaveEligibility}. Holiday Paid (daily): ${!!policy.nonWorkedHolidayPaid}. Weekly Off Paid (daily): ${!!policy.nonWorkedWeeklyOffPaid}. Proration: ${policy.prorationMethod}.`
      }
    }
  };
}

/**
 * Pay terms in force on `onDate` (YYYY-MM-DD). `history` rows hold the PREVIOUS terms with the date
 * those terms started; the current staff row holds terms starting at `staff.effectiveDate`.
 */
function resolveTermsAt(staff, history, onDate) {
  if (!staff.effectiveDate || staff.effectiveDate <= onDate || !history?.length) return staff;
  const older = [...history].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  const hit = older.find((h) => h.effectiveDate <= onDate) || older[older.length - 1];
  return { ...staff, ...hit.snapshot, effectiveDate: hit.effectiveDate };
}

export {
  evaluateEmployeePayroll,
  getCalendarDaysInMonth,
  resolveTermsAt
};
