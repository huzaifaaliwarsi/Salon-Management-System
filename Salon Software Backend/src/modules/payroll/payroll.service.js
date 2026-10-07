// src/modules/payroll/payroll.service.js
// Payroll (spec §10.2): preview (DRAFT, recalculated any time) → finalize (immutable payslip snapshots,
// overtime locked, salary liability recognised — NO money moves) → payments (cash/online, money moves)
// → reversal (dated, money comes back). Uses the same calculation engine as the frontend.

import prisma from '../../config/prisma.js';
import { auditLog } from '../../lib/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/AppError.js';
import { assertBranchAccess, resolveReadBranch, resolveWriteBranch } from '../../lib/scope.js';
import { getBusinessDate, dateOnly, ymd } from '../../lib/dates.js';
import { round2, toDec } from '../../lib/money.js';
import { nextSequence, nextPeriodSequence } from '../../lib/sequence.js';
import { num, opt, iso } from '../../lib/dto.js';
import { evaluateEmployeePayroll, getCalendarDaysInMonth, resolveTermsAt } from '../../lib/calculations/payrollCalculations.js';
import { advanceBalance, loadPayrollExtras, lockPayrollExtras, releasePayrollExtras } from './payroll.extras.service.js';
import { payoutMoney, reverseMoney } from '../cash/cash.service.js';
import { getPayrollPolicy } from '../settings/settings.service.js';
import { toStaffDTO } from '../staff/staff.mapper.js';
import { toAttendanceDTO } from '../attendance/attendance.service.js';
import { toOvertimeDTO } from '../attendance/overtime.service.js';

const runInclude = { payslips: { include: { payments: true } } };
const noAccountant = (actor) => {
  if (actor.role === 'ACCOUNTANT') throw forbidden('FORBIDDEN', 'Access Denied: Accountants are not authorized to access confidential payroll.');
  if (actor.role === 'STAFF') throw forbidden('FORBIDDEN', 'Access Denied: Staff members cannot access payroll run management.');
};

export const toPaymentDTO = (p) => ({
  id: p.id, paymentNumber: p.paymentNumber, payrollRunId: p.runId, payslipId: p.payslipId, staffId: p.staffId, staffName: p.staffName,
  branchId: p.branchId, amount: num(p.amount), method: p.method, cashDrawerId: opt(p.cashDrawerId), onlineAccountId: opt(p.onlineAccountId),
  onlineAccountName: opt(p.onlineAccountName), paidAt: iso(p.paidAt), paidByUserId: p.paidByUserId, paidByName: p.paidByName,
  reference: p.reference, notes: opt(p.notes), status: p.status, reversedAt: iso(p.reversedAt), reversedByUserId: opt(p.reversedByUserId),
  reversedByName: opt(p.reversedByName), reversalReason: opt(p.reversalReason),
});

/** Payslip DTO: frozen calculation snapshot + live payment state. */
const toPayslipDTO = (ps, run) => {
  const completed = (ps.payments ?? []).filter((p) => p.status === 'COMPLETED');
  const paid = round2(completed.reduce((s, p) => s.plus(p.amount), toDec(0)));
  const net = toDec(ps.netPayable);
  const outstanding = round2(net.minus(paid));
  const status = run.status === 'DRAFT' || run.status === 'CANCELLED' ? run.status
    : outstanding.lessThanOrEqualTo(0) && net.greaterThan(0) ? 'PAID' : paid.greaterThan(0) ? 'PARTIALLY_PAID' : 'FINALIZED';
  return {
    ...ps.snapshot, id: ps.id, payrollRunId: ps.runId, payslipNumber: ps.payslipNumber, netPayable: net.toNumber(),
    paidAmount: paid.toNumber(), outstandingAmount: outstanding.toNumber(), status,
    payments: (ps.payments ?? []).sort((a, b) => a.paidAt - b.paidAt).map(toPaymentDTO),
  };
};

export const toRunDTO = (run, branchName) => {
  const payslips = run.payslips.map((ps) => toPayslipDTO(ps, run));
  const totalPayable = round2(payslips.reduce((s, p) => s.plus(p.netPayable), toDec(0)));
  const totalPaid = round2(payslips.reduce((s, p) => s.plus(p.paidAmount), toDec(0)));
  const outstanding = round2(totalPayable.minus(totalPaid));
  const status = ['DRAFT', 'CANCELLED'].includes(run.status) ? run.status
    : outstanding.lessThanOrEqualTo(0) && totalPayable.greaterThan(0) ? 'PAID' : totalPaid.greaterThan(0) ? 'PARTIALLY_PAID' : 'FINALIZED';
  return {
    id: run.id, payrollNumber: run.payrollNumber, branchId: run.branchId, branchName, month: run.month, status,
    totalPayable: totalPayable.toNumber(), totalPaid: totalPaid.toNumber(), totalOutstanding: outstanding.toNumber(),
    employeeCount: payslips.length, payslips, policySnapshot: run.policySnapshot, generatedAt: iso(run.generatedAt),
    generatedByUserId: run.generatedByUserId, generatedByName: run.generatedByName, finalizedAt: iso(run.finalizedAt),
    finalizedByUserId: opt(run.finalizedByUserId), finalizedByName: opt(run.finalizedByName), cancelledAt: iso(run.cancelledAt),
    cancelledByUserId: opt(run.cancelledByUserId), cancelledByName: opt(run.cancelledByName), cancellationReason: opt(run.cancellationReason),
    notes: opt(run.notes),
  };
};

const runDTO = async (tx, id) => {
  const run = await tx.payrollRun.findUnique({ where: { id }, include: runInclude });
  const branch = await tx.branch.findUnique({ where: { id: run.branchId } });
  return toRunDTO(run, branch?.name);
};

/**
 * Evaluate everyone employed in the branch during the month with the shared engine: active staff who
 * joined on/before month end, plus staff who left during the month (exitDate ≥ month start). Pay terms
 * are the ones in force on the last employed day of the month (StaffCompensationHistory).
 */
const evaluateBranchMonth = async (tx, actor, branchId, month, staffId) => {
  const monthEnd = `${month}-${String(getCalendarDaysInMonth(month)).padStart(2, '0')}`;
  const from = dateOnly(`${month}-01`);
  const to = dateOnly(monthEnd);
  const policy = await getPayrollPolicy({ ...actor, role: 'SUPER_ADMIN' }, branchId);
  const staffRows = await tx.staff.findMany({
    where: {
      branchId, joiningDate: { lte: to }, ...(staffId ? { id: staffId } : {}),
      OR: [{ isActive: true }, { exitDate: { gte: from } }],
    },
    include: { compensationHistory: true },
    orderBy: { employeeCode: 'asc' },
  });
  const attendanceRows = await tx.attendanceRecord.findMany({ where: { branchId, workDate: { gte: from, lte: to } }, include: { punches: true, corrections: true } });
  const otRows = await tx.overtimeRecord.findMany({ where: { branchId, workDate: { gte: from, lte: to }, status: 'APPROVED', payrollRunId: null } });
  const holidays = (await tx.branchHoliday.findMany({ where: { branchId: { in: ['ALL', branchId] } } }))
    .map((h) => ({ id: h.id, branchId: h.branchId, date: h.date.toISOString().slice(0, 10), title: h.title }));
  const extras = await loadPayrollExtras(tx, branchId, month, staffRows.map((s) => s.id));

  const byId = new Map(staffRows.map((s) => [s.id, s]));
  const attendance = attendanceRows.map((a) => toAttendanceDTO(a, byId.get(a.staffId)));
  const overtime = otRows.map((o) => toOvertimeDTO(o, byId.get(o.staffId)));
  return {
    policy,
    results: staffRows.map((s) => {
      const dto = toStaffDTO(s);
      const lastDay = dto.exitDate && dto.exitDate < monthEnd ? dto.exitDate : monthEnd;
      const history = s.compensationHistory.map((h) => ({ effectiveDate: ymd(h.effectiveDate), snapshot: h.snapshot }));
      const terms = resolveTermsAt(dto, history, lastDay);
      return { staff: s, ...evaluateEmployeePayroll(terms, month, policy, attendance, overtime, holidays, extras.get(s.id)) };
    }),
  };
};
// ── Queries ──────────────────────────────────────────────────────────────────

export const listRuns = async (actor, { branchId, month } = {}) => {
  noAccountant(actor);
  const b = resolveReadBranch(actor, branchId);
  const runs = await prisma.payrollRun.findMany({
    where: { ...(b ? { branchId: b } : {}), ...(month ? { month } : {}) }, include: runInclude, orderBy: [{ month: 'desc' }, { generatedAt: 'desc' }],
  });
  const branches = new Map((await prisma.branch.findMany()).map((x) => [x.id, x.name]));
  return runs.map((r) => toRunDTO(r, branches.get(r.branchId)));
};

// ── Preview / finalize / cancel ──────────────────────────────────────────────

export const generatePreview = async (actor, { branchId: requested, month, staffId }) => {
  noAccountant(actor);
  const branchId = resolveWriteBranch(actor, requested, 'Access Denied: Cannot generate payroll for another branch.');
  return prisma.$transaction(async (tx) => {
    const { policy, results } = await evaluateBranchMonth(tx, actor, branchId, month, staffId);
    // One DRAFT per branch+month: a new preview replaces the previous one.
    await tx.payrollRun.deleteMany({ where: { branchId, month, status: 'DRAFT' } });
    const run = await tx.payrollRun.create({
      data: {
        branchId, month, status: 'DRAFT', policySnapshot: policy, generatedByUserId: actor.id, generatedByName: actor.name,
        payslips: {
          create: results.map((r) => ({
            staffId: r.staff.id, snapshot: { ...r.payslip, canFinalize: r.canFinalize, blockReason: r.blockReason },
            netPayable: round2(r.payslip.netPayable), grossPayable: round2(r.payslip.grossPayable),
          })),
        },
      },
    });
    return runDTO(tx, run.id);
  });
};

export const finalizeRun = async (actor, runId) => {
  noAccountant(actor);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "PayrollRun" WHERE id = ${runId} FOR UPDATE`;
    const draft = await tx.payrollRun.findUnique({ where: { id: runId } });
    if (!draft) throw notFound('PAYROLL_NOT_FOUND', `Payroll run '${runId}' not found. Please generate a preview first.`);
    assertBranchAccess(actor, draft.branchId, 'Access Denied: Cannot finalize payroll for another branch.');
    if (draft.status !== 'DRAFT') throw conflict('NOT_DRAFT', `Payroll run is already in status '${draft.status}' and cannot be finalized.`);
    const existing = await tx.payrollRun.findFirst({ where: { branchId: draft.branchId, month: draft.month, status: { notIn: ['DRAFT', 'CANCELLED'] } } });
    if (existing) throw conflict('ALREADY_FINALIZED', `A finalized payroll run already exists for ${draft.month} in this branch (${existing.payrollNumber}).`);

    // Re-evaluate at finalization so the frozen snapshot reflects the latest approved data.
    const { policy, results } = await evaluateBranchMonth(tx, actor, draft.branchId, draft.month);
    const blocked = results.find((r) => !r.canFinalize);
    if (blocked) throw conflict('PAYROLL_BLOCKED', `Cannot finalize payroll: ${blocked.blockReason}`);

    const branch = await tx.branch.findUnique({ where: { id: draft.branchId } });
    await tx.payslip.deleteMany({ where: { runId } });
    for (const r of results) {
      await tx.payslip.create({
        data: {
          runId, staffId: r.staff.id, payslipNumber: await nextPeriodSequence(tx, branch.code, 'PS', draft.month),
          snapshot: { ...r.payslip, canFinalize: true, blockReason: undefined }, netPayable: round2(r.payslip.netPayable), grossPayable: round2(r.payslip.grossPayable),
        },
      });
      // Lock the overtime consumed by this payslip so it can never be paid twice.
      if (r.payslip.consumedOvertimeIds?.length) {
        await tx.overtimeRecord.updateMany({ where: { id: { in: r.payslip.consumedOvertimeIds } }, data: { payrollRunId: runId } });
      }
      // Freeze one-off adjustments and book advance recoveries against this run.
      await lockPayrollExtras(tx, runId, draft.month, r.payslip);
    }
    await tx.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'FINALIZED', payrollNumber: await nextPeriodSequence(tx, branch.code, 'PAY', draft.month), policySnapshot: policy,
        finalizedAt: new Date(), finalizedByUserId: actor.id, finalizedByName: actor.name,
      },
    });
    await auditLog(tx, { userId: actor.id, userName: actor.name, action: 'PAYROLL_FINALIZED', entity: 'PayrollRun', entityId: runId, branchId: draft.branchId, after: { month: draft.month } });
    return runDTO(tx, runId);
  });
};

export const cancelRun = async (actor, runId, reason) => {
  noAccountant(actor);
  return prisma.$transaction(async (tx) => {
    const run = await tx.payrollRun.findUnique({ where: { id: runId }, include: { payments: true } });
    if (!run) throw notFound('PAYROLL_NOT_FOUND', `Payroll run '${runId}' not found.`);
    assertBranchAccess(actor, run.branchId, 'Access Denied: Cannot cancel payroll run for another branch.');
    if (run.status === 'CANCELLED') throw conflict('ALREADY_CANCELLED', 'This payroll run is already cancelled.');
    if (run.payments.some((p) => p.status === 'COMPLETED')) {
      throw conflict('HAS_PAYMENTS', 'Runs with payments cannot be cancelled until all payments are properly reversed.');
    }
    await tx.overtimeRecord.updateMany({ where: { payrollRunId: runId }, data: { payrollRunId: null } });
    await releasePayrollExtras(tx, runId);
    await tx.payrollRun.update({
      where: { id: runId },
      data: { status: 'CANCELLED', cancellationReason: reason, cancelledAt: new Date(), cancelledByUserId: actor.id, cancelledByName: actor.name },
    });
    await auditLog(tx, { userId: actor.id, userName: actor.name, action: 'PAYROLL_CANCELLED', entity: 'PayrollRun', entityId: runId, branchId: run.branchId, after: { reason } });
    return runDTO(tx, runId);
  });
};

// ── Payments ─────────────────────────────────────────────────────────────────

export const recordPayment = async (actor, input) => {
  noAccountant(actor);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "Payslip" WHERE id = ${input.payslipId} FOR UPDATE`;
    const run = await tx.payrollRun.findUnique({ where: { id: input.payrollRunId }, include: runInclude });
    if (!run) throw notFound('PAYROLL_NOT_FOUND', `Payroll run '${input.payrollRunId}' not found.`);
    assertBranchAccess(actor, run.branchId, 'Access Denied: Cannot record payment for another branch.');
    if (['DRAFT', 'CANCELLED'].includes(run.status)) throw conflict('RUN_NOT_PAYABLE', `Cannot record payment on a payroll run in '${run.status}' status.`);
    const ps = run.payslips.find((p) => p.id === input.payslipId);
    if (!ps) throw notFound('PAYSLIP_NOT_FOUND', `Payslip '${input.payslipId}' not found in this payroll run.`);
    const slip = toPayslipDTO(ps, run);
    const amount = round2(input.amount);
    if (amount.greaterThan(slip.outstandingAmount)) {
      throw badRequest('OVERPAYMENT', `Payment amount (${amount}) exceeds outstanding payslip balance (${slip.outstandingAmount}).`);
    }
    const branch = await tx.branch.findUnique({ where: { id: run.branchId } });
    const paymentNumber = await nextSequence(tx, branch.code, 'PAYMT', Number((await getBusinessDate(tx)).slice(0, 4)));
    const source = await payoutMoney(tx, actor, {
      branchId: run.branchId, method: input.method, onlineAccountId: input.onlineAccountId, amount, type: 'PAYROLL_PAYOUT',
      sourceModule: 'PAYROLL', sourceId: ps.id, reference: paymentNumber, description: `Salary ${run.month} — ${slip.staffName}`,
    });
    const payment = await tx.payrollPayment.create({
      data: {
        paymentNumber, runId: run.id, payslipId: ps.id, staffId: ps.staffId, staffName: slip.staffName, branchId: run.branchId, amount,
        method: input.method, ...source, reference: input.reference || '', notes: input.notes || null, paidByUserId: actor.id, paidByName: actor.name,
      },
    });
    await auditLog(tx, { userId: actor.id, userName: actor.name, action: 'PAYROLL_PAID', entity: 'PayrollPayment', entityId: payment.id, branchId: run.branchId, after: { amount: amount.toNumber(), method: input.method } });
    return { payrollRun: await runDTO(tx, run.id), payment: toPaymentDTO(payment) };
  });
};

export const reversePayment = async (actor, paymentId, reason) => {
  noAccountant(actor);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "PayrollPayment" WHERE id = ${paymentId} FOR UPDATE`;
    const p = await tx.payrollPayment.findUnique({ where: { id: paymentId } });
    if (!p) throw notFound('PAYMENT_NOT_FOUND', `Payroll payment '${paymentId}' not found.`);
    assertBranchAccess(actor, p.branchId, 'Access Denied: Cannot reverse payments of another branch.');
    if (p.status === 'REVERSED') throw conflict('ALREADY_REVERSED', 'This payroll payment is already reversed.');
    await reverseMoney(tx, actor, {
      branchId: p.branchId, method: p.method, onlineAccountId: p.onlineAccountId, amount: p.amount, sourceModule: 'PAYROLL',
      sourceId: p.id, reference: p.paymentNumber, description: `Reversal of salary payment ${p.paymentNumber}: ${reason}`,
    });
    const updated = await tx.payrollPayment.update({
      where: { id: paymentId },
      data: { status: 'REVERSED', reversalReason: reason, reversedAt: new Date(), reversedByUserId: actor.id, reversedByName: actor.name },
    });
    await auditLog(tx, { userId: actor.id, userName: actor.name, action: 'PAYROLL_PAYMENT_REVERSED', entity: 'PayrollPayment', entityId: paymentId, branchId: p.branchId, after: { reason } });
    return toPaymentDTO(updated);
  });
};

// ── Staff portal ─────────────────────────────────────────────────────────────

export const personalPayslips = async (actor) => {
  if (!actor.staffId) throw forbidden('FORBIDDEN', 'Staff record associated with the authenticated user could not be found.');
  // Draft and cancelled runs are never visible to staff.
  const slips = await prisma.payslip.findMany({
    where: { staffId: actor.staffId, run: { status: { notIn: ['DRAFT', 'CANCELLED'] } } },
    include: { payments: true, run: true },
  });
  return slips.map((ps) => toPayslipDTO(ps, ps.run)).sort((a, b) => b.month.localeCompare(a.month));
};

// ── Monthly earnings summary (salary + commission, kept as separate liabilities) ──

/**
 * One row per staff member for the month: salary from the month's finalized payroll run (a draft only
 * fills salaryEstimate — no liability yet), commission from finalized commission runs whose period lies inside
 * the month, plus not-yet-run commission events of the month as "pending".
 */
export const monthlySummary = async (actor, { branchId: requested, month }) => {
  noAccountant(actor);
  const branchId = resolveWriteBranch(actor, requested, 'Access Denied: Cannot view payroll for another branch.');
  const from = dateOnly(`${month}-01`);
  const to = dateOnly(`${month}-${String(getCalendarDaysInMonth(month)).padStart(2, '0')}`);
  const runs = await prisma.payrollRun.findMany({ where: { branchId, month, status: { not: 'CANCELLED' } }, include: runInclude });
  const run = runs.find((r) => r.status !== 'DRAFT') ?? runs.find((r) => r.status === 'DRAFT');
  const slips = run ? toRunDTO(run).payslips : [];
  const comRuns = await prisma.commissionRun.findMany({
    where: { branchId, status: { notIn: ['DRAFT', 'CANCELLED'] }, startDate: { gte: from }, endDate: { lte: to } },
    include: { statements: { include: { payments: true } } },
  });
  const pending = await prisma.commissionEvent.groupBy({
    by: ['staffId', 'type'], where: { branchId, consumedByRunId: null, eventDate: { gte: from, lte: to } }, _sum: { amount: true },
  });
  const advances = await prisma.salaryAdvance.findMany({ where: { branchId, status: 'ACTIVE' }, include: { recoveries: true } });
  // Everyone employed during the month (joined by month end; active, or left on/after the 1st).
  const staff = await prisma.staff.findMany({ where: { branchId, joiningDate: { lte: to }, OR: [{ isActive: true }, { exitDate: { gte: from } }] }, orderBy: { employeeCode: 'asc' } });

  const rows = staff.map((s) => {
    const slip = slips.find((p) => p.staffId === s.id);
    const stmts = comRuns.flatMap((r) => r.statements).filter((st) => st.staffId === s.id);
    const comNet = round2(stmts.reduce((x, st) => x.plus(st.netPayable), toDec(0)));
    const comPaid = round2(stmts.flatMap((st) => st.payments).filter((p) => p.status === 'COMPLETED').reduce((x, p) => x.plus(p.amount), toDec(0)));
    const ev = (type) => toDec(pending.find((p) => p.staffId === s.id && p.type === type)?._sum.amount ?? 0);
    const comPending = Decimal_max0(round2(ev('EARN').minus(ev('REVERSAL'))));
    // A DRAFT payslip is only an estimate: shown as salaryEstimate, never as earned/outstanding liability.
    const isDraft = slip?.status === 'DRAFT';
    const salaryEstimate = isDraft ? toDec(slip.netPayable) : toDec(0);
    const salaryNet = isDraft ? toDec(0) : toDec(slip?.netPayable ?? 0);
    const salaryPaid = toDec(slip?.paidAmount ?? 0);
    const advBal = round2(advances.filter((a) => a.staffId === s.id).reduce((x, a) => x.plus(advanceBalance(a)), toDec(0)));
    return {
      staffId: s.id, staffName: s.name, employeeCode: s.employeeCode, designation: s.designation, compensationType: s.compensationType,
      salaryStatus: slip ? slip.status : 'NOT_GENERATED', salaryEstimate: salaryEstimate.toNumber(), salaryNet: salaryNet.toNumber(), salaryPaid: salaryPaid.toNumber(),
      salaryOutstanding: round2(salaryNet.minus(salaryPaid)).toNumber(),
      commissionNet: comNet.toNumber(), commissionPaid: comPaid.toNumber(), commissionOutstanding: round2(comNet.minus(comPaid)).toNumber(),
      commissionPending: comPending.toNumber(),
      totalEarnings: round2(salaryNet.plus(comNet)).toNumber(), totalPaid: round2(salaryPaid.plus(comPaid)).toNumber(),
      totalOutstanding: round2(salaryNet.minus(salaryPaid).plus(comNet).minus(comPaid)).toNumber(),
      advanceBalance: advBal.toNumber(),
    };
  });
  const total = (f) => round2(rows.reduce((x, r) => x.plus(r[f]), toDec(0))).toNumber();
  return {
    branchId, month, payrollRunId: run?.id ?? null, payrollStatus: run ? toRunDTO(run).status : 'NOT_GENERATED',
    commissionRunIds: comRuns.map((r) => r.id), rows,
    totals: Object.fromEntries(['salaryEstimate', 'salaryNet', 'salaryPaid', 'salaryOutstanding', 'commissionNet', 'commissionPaid', 'commissionOutstanding', 'commissionPending', 'totalEarnings', 'totalPaid', 'totalOutstanding', 'advanceBalance'].map((f) => [f, total(f)])),
  };
};

const Decimal_max0 = (d) => (d.lessThan(0) ? toDec(0) : d);