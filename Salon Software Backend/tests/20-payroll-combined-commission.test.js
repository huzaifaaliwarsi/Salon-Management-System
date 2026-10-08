import { describe, it, expect } from 'vitest';
import prisma from '../src/config/prisma.js';
import * as payroll from '../src/modules/payroll/payroll.service.js';
import * as commission from '../src/modules/commission/commission.service.js';
import { postInvoice } from '../src/modules/pos/pos.service.js';
import { refundInvoice } from '../src/modules/pos/pos.refund.js';
import { setSystemDate } from '../src/modules/settings/settings.service.js';
import { issueAdvance } from '../src/modules/payroll/payroll.extras.service.js';
import { staffSalaryReport, staffCommissionReport } from '../src/modules/reports/staffPay.report.js';
import { accountBalances } from '../src/lib/balances.js';
import { as } from './helpers.js';

const actor = { id: 'usr-super-01', name: 'Super Admin', role: 'SUPER_ADMIN' };
const DAY = '2026-06-10', MONTH = '2026-06';
let serial = 0;
const slipOf = (run, f) => run.payslips.find((p) => p.staffId === f.staff.id);
const balance = async (f) => Number((await accountBalances([f.account.id])).get(f.account.id));

// Each case owns a branch, account and real POS sale: no dependency on other tests' balances/events.
async function fixture(type = 'DAILY_PLUS_COMMISSION') {
  const n = ++serial;
  const branch = await prisma.branch.create({ data: { name: `Combined payroll ${n}`, code: `PC-${n}`, address: 'Test', city: 'Lahore', phone: '03000000000', taxEnabled: true, taxRate: 0.16 } });
  const account = await prisma.paymentAccount.create({ data: { branchId: branch.id, name: 'Payroll bank', accountType: 'BANK', providerName: 'Test', accountHolder: 'Salon', openingBalance: 100000 } });
  const staff = await prisma.staff.create({ data: { branchId: branch.id, name: 'Combined Staff', employeeCode: `PC-${n}`, phone: `030000000${String(n).padStart(2, '0')}`,
    roleTitle: 'Stylist', designation: 'Stylist', joiningDate: new Date('2026-01-01'), effectiveDate: new Date('2026-01-01'), compensationType: type,
    baseSalary: 1000, dailySalaryRate: 1000, commissionRate: 10, overtimeHourlyRate: 300,
    lateInDeduction: { mode: 'NONE' }, earlyExitDeduction: { mode: 'NONE' }, specialties: [] } });
  const category = await prisma.serviceCategory.create({ data: { branchId: branch.id, name: 'Hair' } });
  const service = await prisma.service.create({ data: { branchId: branch.id, categoryId: category.id, code: 'HAIR', name: 'Haircut', durationMinutes: 30, price: 1250 } });
  const isMonthly = type === 'MONTHLY_PLUS_COMMISSION';
  await prisma.attendanceRecord.createMany({ data: Array.from({ length: 30 }, (_, i) => ({ branchId: branch.id, staffId: staff.id, workDate: new Date(`${MONTH}-${String(i + 1).padStart(2, '0')}`),
    checkIn: '09:00 AM', checkOut: '06:00 PM', status: isMonthly || i === 9 ? 'PRESENT' : 'ABSENT', isFinalized: true })) });
  await prisma.overtimeRecord.create({ data: { branchId: branch.id, staffId: staff.id, workDate: new Date(DAY), overtimeNumber: `OT-PC-${n}`, minutes: 30, approvedMinutes: 30,
    hourlyRate: 300, amount: 150, status: 'APPROVED', reason: 'Approved OT', enteredByUserId: actor.id, enteredByName: actor.name } });
  await setSystemDate(DAY, actor);
  const invoice = await postInvoice({ branchId: branch.id, clientName: 'Payroll Test', clientPhone: `031000000${String(n).padStart(2, '0')}`,
    discountType: 'PERCENTAGE', discountValue: 20, tip: 500,
    cartItems: [{ type: 'SERVICE', item: { id: service.id, price: 1250 }, quantity: 1, staffId: staff.id }],
    payments: [{ method: 'ONLINE_ACCOUNT', paymentAccountId: account.id, amount: 1660, billAllocation: 1160, tipAllocation: 500 }],
  }, actor, `pc-sale-${n}`);
  const previewInput = { branchId: branch.id, month: MONTH, staffId: staff.id, ...(isMonthly ? {} : { startDate: DAY, endDate: DAY, runType: 'DAILY' }) };
  const preview = () => payroll.generatePreview(actor, previewInput);
  const finalize = async () => payroll.finalizeRun(actor, (await preview()).id);
  const pay = (run, amount, key) => payroll.recordPayment(actor, { payrollRunId: run.id, payslipId: slipOf(run, { staff }).id, amount, method: 'ONLINE', onlineAccountId: account.id, idempotencyKey: key });
  const cPreview = (startDate = DAY, endDate = DAY) => commission.generatePreview(actor, { branchId: branch.id, startDate, endDate });
  const refund = () => refundInvoice({ invoiceId: invoice.id, type: 'VOID', reason: 'Customer refund', refundMethod: 'ONLINE_ACCOUNT', paymentAccountId: account.id }, actor);
  return { branch, account, staff, invoice, preview, finalize, pay, cPreview, refund };
}

describe('Combined payroll uses canonical commission, separate ledgers and atomic ownership', () => {
  it.each(['DAILY_PLUS_COMMISSION', 'MONTHLY_PLUS_COMMISSION'])('%s: 1000 salary + 150 OT + 100 commission = 1250; preview does not consume/pay', async (type) => {
    const f = await fixture(type);
    expect(f.invoice).toMatchObject({ netSales: 1000, tax: 160, tip: 500 });
    const before = await balance(f);
    const preview = await f.preview();
    expect(slipOf(preview, f)).toMatchObject({ baseEarnings: 1000, approvedOvertimeAmount: 150, salaryNetPayable: 1150, commissionPayable: 100, netPayable: 1250 });
    expect(await prisma.commissionStatement.count({ where: { staffId: f.staff.id } })).toBe(0);
    expect(await prisma.commissionEvent.findFirst({ where: { staffId: f.staff.id } })).toMatchObject({ consumedByRunId: null });
    await expect(f.pay(preview, 1250)).rejects.toMatchObject({ code: 'RUN_NOT_PAYABLE' });
    const run = await payroll.finalizeRun(actor, preview.id);
    const slip = slipOf(run, f);
    expect(slip.commissionLinks).toHaveLength(1);
    const st = await prisma.commissionStatement.findFirst({ where: { staffId: f.staff.id } });
    expect(st.payrollPayslipId).toBe(slip.id);
    expect(Number(st.netPayable)).toBe(100);
    expect(Number((await prisma.payslip.findUnique({ where: { id: slip.id } })).netPayable)).toBe(1150);
    expect(await balance(f)).toBe(before);
    await expect(commission.recordPayment(actor, { commissionRunId: st.runId, statementId: st.id, amount: 100, method: 'ONLINE', onlineAccountId: f.account.id })).rejects.toMatchObject({ code: 'COMMISSION_LINKED_TO_PAYROLL' });
    await expect(commission.cancelRun(actor, st.runId, 'Cannot unlink independently')).rejects.toMatchObject({ code: 'COMMISSION_LINKED_TO_PAYROLL' });
    const payment = await f.pay(run, 1250, `example-${type}`);
    expect(payment.payment).toMatchObject({ amount: 1250, salaryAmount: 1150, commissionAmount: 100 });
    expect(slipOf(payment.payrollRun, f)).toMatchObject({ status: 'PAID', outstandingAmount: 0 });
    expect(await balance(f)).toBe(before - 1250);
    const cp = await prisma.commissionPayment.findFirst({ where: { payrollPaymentId: payment.payment.id } });
    expect(Number(cp.amount)).toBe(100);
    await expect(commission.reversePayment(actor, cp.id, 'Wrong screen')).rejects.toMatchObject({ code: 'COMMISSION_LINKED_TO_PAYROLL' });
    const salaryReport = await staffSalaryReport(actor, { branchId: f.branch.id, month: MONTH });
    expect(salaryReport.totals).toMatchObject({ net: 1150, paid: 1150, outstanding: 0 });
    const commissionReport = await staffCommissionReport(actor, { branchId: f.branch.id, startDate: DAY, endDate: DAY });
    expect(commissionReport.totals).toMatchObject({ earned: 100, reversed: 0, paid: 100, outstanding: 0 });
    const summary = await payroll.monthlySummary(actor, { branchId: f.branch.id, month: MONTH });
    expect(summary.totals).toMatchObject({ salaryNet: 1150, salaryPaid: 1150, commissionNet: 100, commissionPaid: 100, totalPaid: 1250 });
    await payroll.reversePayment(actor, payment.payment.id, 'Reverse together');
    expect(await balance(f)).toBe(before);
    expect((await prisma.commissionPayment.findUnique({ where: { id: cp.id } })).status).toBe('REVERSED');
    await expect(payroll.reversePayment(actor, payment.payment.id, 'Retry')).rejects.toMatchObject({ code: 'ALREADY_REVERSED' });
    await payroll.cancelRun(actor, run.id, 'Release eligibility');
    expect((await prisma.commissionEvent.findFirst({ where: { staffId: f.staff.id } })).consumedByRunId).toBeNull();
    const regenerated = await f.finalize();
    expect(slipOf(regenerated, f).netPayable).toBe(1250);
  });

  it('re-evaluates commission at finalization and ignores stale previews after a refund', async () => {
    const f = await fixture();
    const draft = await f.preview();
    await f.refund();
    const run = await payroll.finalizeRun(actor, draft.id);
    expect(slipOf(run, f)).toMatchObject({ commissionPayable: 0, netPayable: 1150 });
    expect(await prisma.commissionEvent.count({ where: { staffId: f.staff.id, consumedByRunId: { not: null } } })).toBe(2);
  });

  it('a refund after finalization blocks obsolete commission payout and rolls back both money parts', async () => {
    const f = await fixture();
    const run = await f.finalize();
    await f.refund();
    const before = await balance(f);
    await expect(f.pay(run, 1250, 'refunded')).rejects.toMatchObject({ code: 'COMMISSION_REFUND_ADJUSTMENT' });
    expect(await balance(f)).toBe(before);
    expect(await prisma.payrollPayment.count({ where: { runId: run.id } })).toBe(0);
    await payroll.cancelRun(actor, run.id, 'Refresh refunded commission');
    expect(slipOf(await f.finalize(), f).netPayable).toBe(1150);
  });

  it('links only the unpaid balance of an already-finalized statement and releases it on cancel', async () => {
    const f = await fixture();
    const cr = await commission.finalizeRun(actor, (await f.cPreview()).id);
    const st = cr.statements[0];
    await commission.recordPayment(actor, { commissionRunId: cr.id, statementId: st.id, amount: 40, method: 'ONLINE', onlineAccountId: f.account.id });
    const run = await f.finalize();
    expect(slipOf(run, f)).toMatchObject({ commissionPayable: 60, netPayable: 1210 });
    expect(await prisma.commissionStatement.count({ where: { staffId: f.staff.id } })).toBe(1);
    await payroll.cancelRun(actor, run.id, 'Standalone instead');
    expect((await prisma.commissionRun.findUnique({ where: { id: cr.id } })).status).toBe('FINALIZED');
    await commission.recordPayment(actor, { commissionRunId: cr.id, statementId: st.id, amount: 60, method: 'ONLINE', onlineAccountId: f.account.id });
    expect(slipOf(await f.finalize(), f).commissionPayable).toBe(0);
  });

  it('concurrent retries of a partial payout create one record; salary-first split and commission-only remainder reverse correctly', async () => {
    const f = await fixture();
    const run = await f.finalize();
    const before = await balance(f);
    const [a, b] = await Promise.all([f.pay(run, 1175, 'same-key'), f.pay(run, 1175, 'same-key')]);
    expect(a.payment.id).toBe(b.payment.id);
    expect(a.payment).toMatchObject({ salaryAmount: 1150, commissionAmount: 25 });
    expect(await balance(f)).toBe(before - 1175);
    const tail = await f.pay(run, 75, 'tail');
    expect(tail.payment).toMatchObject({ amount: 75, salaryAmount: 0, commissionAmount: 75, onlineAccountId: f.account.id });
    await expect(f.pay(run, 1, 'extra')).rejects.toMatchObject({ code: 'OVERPAYMENT' });
    await payroll.reversePayment(actor, tail.payment.id, 'Reverse commission-only tail');
    expect(await balance(f)).toBe(before - 1175);
    await payroll.reversePayment(actor, a.payment.id, 'Reverse first part');
    expect(await balance(f)).toBe(before);
  });

  it('serializes overlapping commission/payroll finalizations and disallows duplicate payment paths', async () => {
    const f = await fixture();
    const cd = await f.cPreview(`${MONTH}-01`, `${MONTH}-30`);
    const pd = await f.preview();
    const [pr, cr] = await Promise.all([payroll.finalizeRun(actor, pd.id), commission.finalizeRun(actor, cd.id)]);
    const records = await prisma.commissionStatement.findMany({ where: { staffId: f.staff.id }, include: { payments: true } });
    expect(records.reduce((s, st) => s + Number(st.netPayable), 0)).toBe(100);
    expect(await prisma.commissionEvent.count({ where: { staffId: f.staff.id, consumedByRunId: { not: null } } })).toBe(1);
    const slip = slipOf(pr, f);
    await f.pay(pr, slip.netPayable, 'race-payroll');
    const standalone = cr.statements.find((s) => !s.payrollPayslipId && s.netCommissionPayable > 0);
    if (standalone) await commission.recordPayment(actor, { commissionRunId: cr.id, statementId: standalone.id, amount: 100, method: 'ONLINE', onlineAccountId: f.account.id });
    expect(Number((await prisma.commissionPayment.aggregate({ where: { staffId: f.staff.id, status: 'COMPLETED' }, _sum: { amount: true } }))._sum.amount)).toBe(100);
    await expect(payroll.finalizeRun(actor, pd.id)).rejects.toMatchObject({ code: 'NOT_DRAFT' });
    const overlap = await f.preview();
    await expect(payroll.finalizeRun(actor, overlap.id)).rejects.toMatchObject({ code: 'PAYROLL_BLOCKED' });
  });

  it('HTTP concurrent partial-payment retries are idempotent before the middleware cache exists', async () => {
    const f = await fixture();
    const run = await f.finalize();
    const body = { payrollRunId: run.id, payslipId: slipOf(run, f).id, amount: 500, method: 'ONLINE', onlineAccountId: f.account.id };
    const [a, b] = await Promise.all([as('super').post('/payroll/payments', body, { 'Idempotency-Key': 'combined-http-retry' }), as('super').post('/payroll/payments', body, { 'Idempotency-Key': 'combined-http-retry' })]);
    expect(a.status).toBe(201); expect(b.status).toBe(201);
    expect(a.body.data.payment.id).toBe(b.body.data.payment.id);
    expect(await prisma.payrollPayment.count({ where: { runId: run.id } })).toBe(1);
  });

  it('insufficient combined funds roll back salary movement, commission payment and payment records', async () => {
    const f = await fixture();
    const run = await f.finalize();
    await prisma.paymentAccount.update({ where: { id: f.account.id }, data: { openingBalance: -460 } }); // POS receipt 1660 leaves 1200.
    const before = await balance(f);
    expect(before).toBe(1200);
    await expect(f.pay(run, 1250, 'insufficient')).rejects.toMatchObject({ code: 'INSUFFICIENT_ACCOUNT_BALANCE' });
    expect(await balance(f)).toBe(before);
    expect(await prisma.payrollPayment.count({ where: { runId: run.id } })).toBe(0);
    expect(await prisma.commissionPayment.count({ where: { staffId: f.staff.id } })).toBe(0);
  });

  it('loan and other deductions remain salary lines; commission is added once after deductions', async () => {
    const f = await fixture();
    await issueAdvance(actor, { staffId: f.staff.id, amount: 100, recoveryPerMonth: 100, startMonth: MONTH, method: 'ONLINE', onlineAccountId: f.account.id, reason: 'Loan' });
    await prisma.payrollAdjustment.create({ data: { branchId: f.branch.id, staffId: f.staff.id, month: MONTH, type: 'DEDUCTION', title: 'Other deduction', amount: 50, createdByUserId: actor.id, createdByName: actor.name } });
    const run = await f.finalize();
    expect(slipOf(run, f)).toMatchObject({ advanceRecoveryAmount: 100, otherDeductions: 50, totalDeductions: 150, salaryNetPayable: 1000, commissionPayable: 100, netPayable: 1100 });
  });
});
