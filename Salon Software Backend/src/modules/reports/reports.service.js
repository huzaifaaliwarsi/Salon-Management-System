// src/modules/reports/reports.service.js
// Read-only operational reports built from canonical tables:
//   • Appointment report  — bookings with their linked invoice outcome
//   • Staff performance   — invoice-line attribution + commission, tips, attendance, overtime
// Voided invoices never count as performance. Tips are reported separately from sales.

import prisma from '../../config/prisma.js';
import { forbidden, notFound } from '../../lib/AppError.js';
import { resolveReadBranch } from '../../lib/scope.js';
import { dateOnly, getBusinessDate, ymd } from '../../lib/dates.js';
import { round2, toDec } from '../../lib/money.js';
import { listAppointments } from '../appointments/appointments.service.js';

const n = (d) => round2(d ?? 0).toNumber();
const range = (startDate, endDate) => ({ gte: dateOnly(startDate), lte: dateOnly(endDate) });

const denyNonAdmins = (actor, what) => {
  if (actor.role === 'STAFF') throw forbidden('FORBIDDEN', `Access Denied: Staff members cannot access ${what}.`);
  if (actor.role === 'ACCOUNTANT') throw forbidden('FORBIDDEN', `Access Denied: Accountants cannot access ${what}.`);
};

// ═══ APPOINTMENT REPORT ═══════════════════════════════════════════════════════

export const appointmentReport = async (actor, q) => {
  denyNonAdmins(actor, 'appointment reports');
  const { startDate, endDate } = q;

  let list = await listAppointments(actor, {
    branchId: q.branchId, startDate, endDate, status: q.status, staffId: q.staffId, search: q.search,
  });
  if (q.billingStatus) list = list.filter((a) => a.billingStatus === q.billingStatus);
  if (q.customerSource) list = list.filter((a) => a.customerSource === q.customerSource);
  if (q.serviceId) {
    list = list.filter((a) => a.items.some((it) =>
      (it.type === 'SERVICE' && it.itemId === q.serviceId) || it.packageComponents?.some((pc) => pc.serviceId === q.serviceId)));
  }
  if (q.packageId) list = list.filter((a) => a.items.some((it) => it.type === 'PACKAGE' && it.itemId === q.packageId));

  const invoiceIds = [...new Set(list.map((a) => a.linkedInvoiceId).filter(Boolean))];
  const invoices = invoiceIds.length
    ? await prisma.invoice.findMany({ where: { id: { in: invoiceIds } }, select: { id: true, netSales: true, total: true, status: true } })
    : [];
  const invoiceById = new Map(invoices.map((i) => [i.id, i]));

  const records = list.map((apt) => {
    const staffNames = new Set();
    for (const it of apt.items) {
      if (it.staffName) staffNames.add(it.staffName);
      for (const pc of it.packageComponents ?? []) if (pc.staffName) staffNames.add(pc.staffName);
    }
    const first = apt.items[0];
    const inv = apt.linkedInvoiceId ? invoiceById.get(apt.linkedInvoiceId) : undefined;
    return {
      id: apt.id,
      appointmentNumber: apt.appointmentNumber,
      branchId: apt.branchId,
      branchName: apt.branchName,
      date: apt.date,
      startTime: apt.startTime,
      endTime: apt.endTime,
      clientName: apt.clientName,
      clientPhone: apt.clientPhone,
      customerSource: apt.customerSource,
      serviceSummary: apt.items.map((it) => (it.type === 'PACKAGE' ? `${it.name} (Pkg)` : it.name)).join(', ') || 'Service',
      staffSummary: [...staffNames].join(', ') || 'Unassigned',
      primaryStaffId: first?.staffId ?? '',
      primaryStaffName: first?.staffName ?? '',
      quotedPrice: apt.price,
      status: apt.status,
      billingStatus: apt.billingStatus,
      linkedInvoiceId: apt.linkedInvoiceId,
      linkedInvoiceNumber: apt.linkedInvoiceNumber,
      actualNetSales: inv ? n(inv.netSales) : undefined,
      actualInvoiceTotal: inv ? n(inv.total) : undefined,
      invoicePaymentStatus: inv?.status,
      durationMinutes: apt.durationMinutes,
    };
  });

  const count = (pred) => records.filter(pred).length;
  const estimated = records
    .filter((r) => r.status !== 'CANCELLED' && r.status !== 'NO_SHOW')
    .reduce((s, r) => s.plus(r.quotedPrice), toDec(0));
  const invNet = invoices.reduce((s, i) => s.plus(i.netSales), toDec(0));
  const invTotal = invoices.reduce((s, i) => s.plus(i.total), toDec(0));

  return {
    records,
    summary: {
      totalAppointments: records.length,
      pendingCount: count((r) => r.status === 'PENDING'),
      confirmedCount: count((r) => r.status === 'CONFIRMED'),
      checkedInCount: count((r) => r.status === 'CHECKED_IN'),
      inServiceCount: count((r) => r.status === 'IN_SERVICE'),
      completedCount: count((r) => r.status === 'COMPLETED'),
      cancelledCount: count((r) => r.status === 'CANCELLED'),
      noShowCount: count((r) => r.status === 'NO_SHOW'),
      billedCount: count((r) => r.billingStatus === 'BILLED'),
      unbilledCount: count((r) => r.billingStatus !== 'BILLED'),
      totalQuotedValue: n(estimated),
      totalActualNetSales: n(invNet),
      totalEstimatedValue: n(estimated),
      actualInvoiceNetSales: n(invNet),
      actualInvoiceTotal: n(invTotal),
    },
  };
};

// ═══ STAFF PERFORMANCE ════════════════════════════════════════════════════════

const computePerformance = async (staffList, startDate, endDate, filters = {}) => {
  if (!staffList.length) return [];
  const ids = staffList.map((s) => s.id);
  const period = range(startDate, endDate);
  const activeInvoice = { date: period, lifecycle: { not: 'VOIDED' } };

  const [lines, statements, allocations, payouts, attendance, overtime] = await Promise.all([
    prisma.invoiceLine.findMany({
      where: {
        type: { not: 'PRODUCT' },
        invoice: activeInvoice,
        OR: [{ staffId: { in: ids } }, { components: { some: { staffId: { in: ids } } } }],
      },
      include: { components: true, invoice: { select: { id: true, invoiceNumber: true, date: true, time: true, clientId: true, clientName: true } } },
    }),
    prisma.commissionStatement.findMany({
      where: {
        staffId: { in: ids },
        run: { status: { notIn: ['DRAFT', 'CANCELLED'] }, startDate: { lte: dateOnly(endDate) }, endDate: { gte: dateOnly(startDate) } },
      },
      include: { payments: true },
    }),
    prisma.tipAllocation.findMany({ where: { staffId: { in: ids }, allocationDate: period, status: { not: 'CANCELLED' } } }),
    // Dated events (spec §4.4): a payout stays in its own period; a later reversal lands on the reversal date.
    prisma.tipPayout.findMany({ where: { staffId: { in: ids }, OR: [{ payoutDate: period }, { reversalDate: period }] } }),
    prisma.attendanceRecord.findMany({ where: { staffId: { in: ids }, workDate: period } }),
    prisma.overtimeRecord.findMany({ where: { staffId: { in: ids }, workDate: period, status: 'APPROVED' } }),
  ]);

  const branches = await prisma.branch.findMany({ where: { id: { in: [...new Set(staffList.map((s) => s.branchId))] } } });
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const of = (rows, sid) => rows.filter((r) => r.staffId === sid);

  return staffList.map((st) => {
    const detailedServices = [];
    const clients = new Set();
    let direct = 0;
    let comps = 0;
    let gross = toDec(0);
    let disc = toDec(0);
    let net = toDec(0);
    let commission = toDec(0);

    for (const line of lines) {
      const inv = line.invoice;
      const lineGross = toDec(line.unitPrice).times(line.quantity);
      const clientKey = inv.clientId || inv.clientName?.trim().toLowerCase();

      if (line.type === 'SERVICE' && line.staffId === st.id) {
        if (filters.serviceId && filters.serviceId !== 'ALL' && line.itemId !== filters.serviceId) continue;
        if (filters.packageId && filters.packageId !== 'ALL') continue;
        const rate = toDec(line.staffCommissionRate);
        const earned = round2(toDec(line.netSales).times(rate).dividedBy(100));
        direct += Number(line.quantity);
        gross = gross.plus(lineGross);
        disc = disc.plus(line.discountAllocated);
        net = net.plus(line.netSales);
        commission = commission.plus(earned);
        if (clientKey) clients.add(clientKey);
        detailedServices.push({
          invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, date: ymd(inv.date), time: inv.time, clientName: inv.clientName,
          itemId: line.itemId, serviceName: line.name, itemType: 'SERVICE',
          cataloguePrice: n(lineGross), discountAllocated: n(line.discountAllocated), netSales: n(line.netSales),
          commissionRatePercent: rate.toNumber(), commissionEarned: n(earned),
        });
      }

      if (line.type === 'PACKAGE') {
        if (filters.packageId && filters.packageId !== 'ALL' && line.itemId !== filters.packageId) continue;
        const netRatio = lineGross.gt(0) ? toDec(line.netSales).dividedBy(lineGross) : toDec(1);
        for (const c of [...line.components].sort((a, b) => a.sortOrder - b.sortOrder)) {
          if (c.staffId !== st.id) continue;
          if (filters.serviceId && filters.serviceId !== 'ALL' && c.serviceId !== filters.serviceId) continue;
          const allocated = toDec(c.allocatedAmount);
          const allocatedNet = round2(allocated.times(netRatio));
          const rate = toDec(c.staffCommissionRate);
          const earned = round2(allocatedNet.times(rate).dividedBy(100));
          comps += c.quantity || 1;
          gross = gross.plus(allocated);
          disc = disc.plus(allocated.minus(allocatedNet));
          net = net.plus(allocatedNet);
          commission = commission.plus(earned);
          if (clientKey) clients.add(clientKey);
          detailedServices.push({
            invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, date: ymd(inv.date), time: inv.time, clientName: inv.clientName,
            itemId: c.serviceId, serviceName: `${c.serviceName} (${line.name})`, itemType: 'PACKAGE_COMPONENT',
            cataloguePrice: n(allocated), discountAllocated: n(allocated.minus(allocatedNet)), netSales: n(allocatedNet),
            commissionRatePercent: rate.toNumber(), commissionEarned: n(earned),
          });
        }
      }
    }

    const myStatements = of(statements, st.id);
    const finalized = myStatements.reduce((s, x) => s.plus(x.netPayable), toDec(0));
    const paidCommission = myStatements
      .flatMap((x) => x.payments)
      .filter((p) => p.status === 'COMPLETED')
      .reduce((s, p) => s.plus(p.amount), toDec(0));
    const allocatedTips = of(allocations, st.id).reduce((s, a) => s.plus(a.amount), toDec(0));
    const inPeriod = (x) => x && ymd(x) >= startDate && ymd(x) <= endDate;
    const paidTips = of(payouts, st.id).reduce((s, p) => s.plus(inPeriod(p.payoutDate) ? p.amount : 0).minus(inPeriod(p.reversalDate) ? p.amount : 0), toDec(0));
    const att = of(attendance, st.id);
    const ot = of(overtime, st.id);
    const outstanding = allocatedTips.minus(paidTips);

    return {
      staffId: st.id,
      staffName: st.name,
      staffCode: st.employeeCode,
      roleTitle: st.roleTitle || st.designation,
      branchId: st.branchId,
      branchName: branchName.get(st.branchId) ?? 'Branch',
      directServicesCount: direct,
      packageComponentsCount: comps,
      totalServiceUnits: direct + comps,
      uniqueClientsCount: clients.size,
      attributedGrossSales: n(gross),
      discountAllocation: n(disc),
      attributedNetSales: n(net),
      estimatedCommission: n(commission),
      finalizedCommission: n(finalized),
      paidCommission: n(paidCommission),
      allocatedTips: n(allocatedTips),
      paidTips: n(paidTips),
      outstandingTips: n(outstanding.gt(0) ? outstanding : 0),
      workedHours: n(att.reduce((s, a) => s.plus(a.workedHours), toDec(0))),
      presentDays: att.filter((a) => a.status === 'PRESENT').length,
      latePunchesCount: att.filter((a) => a.isLate).length,
      approvedOvertimeMinutes: ot.reduce((s, o) => s + o.approvedMinutes, 0),
      approvedOvertimePay: n(ot.reduce((s, o) => s.plus(o.amount ?? 0), toDec(0))),
      detailedServices: detailedServices.sort((a, b) => b.date.localeCompare(a.date) || String(b.time).localeCompare(String(a.time))),
    };
  });
};

export const staffPerformance = async (actor, q) => {
  denyNonAdmins(actor, 'staff performance');
  const b = resolveReadBranch(actor, q.branchId);
  const staff = await prisma.staff.findMany({
    where: {
      ...(b ? { branchId: b } : {}),
      ...(q.staffId && q.staffId !== 'ALL' ? { id: q.staffId } : {}),
    },
    orderBy: { name: 'asc' },
  });
  const rows = await computePerformance(staff, q.startDate, q.endDate, q);
  return rows.sort((x, y) => y.attributedNetSales - x.attributedNetSales);
};

export const personalPerformance = async (actor, q = {}) => {
  if (!actor.staffId) throw forbidden('FORBIDDEN', 'Staff record associated with the authenticated user could not be found.');
  const staff = await prisma.staff.findUnique({ where: { id: actor.staffId } });
  if (!staff) throw notFound('STAFF_NOT_FOUND', 'Staff record associated with the authenticated user could not be found.');
  const today = await getBusinessDate();
  const startDate = q.startDate || `${today.slice(0, 7)}-01`;
  const endDate = q.endDate || today;
  return (await computePerformance([staff], startDate, endDate))[0];
};
