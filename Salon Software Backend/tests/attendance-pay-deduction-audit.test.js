import { describe, expect, it } from 'vitest';
import { evaluateEmployeePayroll } from '../src/lib/calculations/payrollCalculations.js';
import { calculateDeductionSnapshot } from '../src/lib/calculations/attendanceCalculations.js';

const staff = { id: 'audit-staff', branchId: 'audit-branch', name: 'Audit', compensationType: 'MONTHLY_SALARY', baseSalary: 30000, payrollDivisor: 30, joiningDate: '2025-01-01' };
const policy = { dailyStaffPaidLeaveEligibility: true, nonWorkedWeeklyOffPaid: false, nonWorkedHolidayPaid: false };
const run = (status, overrides = {}, snapshot) => evaluateEmployeePayroll(
  { ...staff, ...overrides }, '2026-10', policy,
  [{ staffId: staff.id, date: '2026-10-12', status, calculationSnapshot: snapshot }], [], [], {},
  { startDate: '2026-10-12', endDate: '2026-10-12', runType: 'DAILY' }
).payslip;

describe('Actual attendance salary deduction behavior', () => {
  it('monthly unpaid leave deducts salary / 30, paid leave preserves salary', () => {
    expect(run('UNPAID_LEAVE')).toMatchObject({ baseEarnings: 1000, absenceDeductions: 1000, netPayable: 0 });
    expect(run('PAID_LEAVE')).toMatchObject({ baseEarnings: 1000, absenceDeductions: 0, netPayable: 1000 });
  });
  it('daily unpaid leave earns zero, eligible paid leave earns the daily rate', () => {
    const daily = { compensationType: 'DAILY_SALARY', baseSalary: 0, dailySalaryRate: 1000 };
    expect(run('UNPAID_LEAVE', daily)).toMatchObject({ baseEarnings: 0, leaveEarnings: 0, netPayable: 0 });
    expect(run('PAID_LEAVE', daily)).toMatchObject({ baseEarnings: 0, leaveEarnings: 1000, netPayable: 1000 });
  });
  it('HALF_DAY alone currently earns a full day for monthly and daily staff', () => {
    const snapshot = calculateDeductionSnapshot(staff, false, 0, true, 240);
    expect(snapshot.totalDeductionAmount).toBe(0);
    expect(run('HALF_DAY', {}, snapshot).netPayable).toBe(1000);
    expect(run('HALF_DAY', { compensationType: 'DAILY_SALARY', baseSalary: 0, dailySalaryRate: 1000 }, snapshot).netPayable).toBe(1000);
  });
  it('half-day attendance applies a configured early-exit penalty once', () => {
    const configured = { ...staff, earlyExitDeduction: { enabled: true, type: 'PERCENTAGE', amount: 50 } };
    const snapshot = calculateDeductionSnapshot(configured, false, 0, true, 240);
    expect(snapshot.totalDeductionAmount).toBe(500);
    expect(run('HALF_DAY', configured, snapshot)).toMatchObject({ absenceDeductions: 0, attendancePenaltyDeductions: 500, netPayable: 500 });
  });
});
