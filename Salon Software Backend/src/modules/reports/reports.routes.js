// src/modules/reports/reports.routes.js — role dashboards + operational reports (read-only).

import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import * as d from '../dashboard/dashboard.service.js';
import * as r from './reports.service.js';
import * as sp from './staffPay.report.js';

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
const send = (fn) => asyncHandler(async (req, res) => res.status(200).json({ data: await fn(req) }));
const branchQuery = z.object({ branchId: z.string().optional() });

// ── /dashboard ───────────────────────────────────────────────────────────────
export const dashboardRoutes = Router();
dashboardRoutes.use(authenticate);
dashboardRoutes.get('/super-admin', authorize('SUPER_ADMIN'), validate(branchQuery, 'query'), send((req) => d.superAdminDashboard(req.user, req.query)));
dashboardRoutes.get('/admin', authorize('SUPER_ADMIN', 'ADMIN'), validate(branchQuery, 'query'), send((req) => d.adminDashboard(req.user, req.query)));
dashboardRoutes.get('/accountant', authorize('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'), validate(branchQuery, 'query'), send((req) => d.accountantDashboard(req.user, req.query)));
dashboardRoutes.get('/staff', authorize('STAFF'), send((req) => d.staffDashboard(req.user)));

// ── /reports ─────────────────────────────────────────────────────────────────
const appointmentQuery = z.object({
  branchId: z.string().optional(), startDate: ymd, endDate: ymd,
  status: z.string().optional(), staffId: z.string().optional(), serviceId: z.string().optional(), packageId: z.string().optional(),
  customerSource: z.string().optional(), billingStatus: z.string().optional(), search: z.string().optional(),
});
const performanceQuery = z.object({
  branchId: z.string().optional(), startDate: ymd, endDate: ymd,
  staffId: z.string().optional(), categoryId: z.string().optional(), serviceId: z.string().optional(), packageId: z.string().optional(),
});
const personalQuery = z.object({ startDate: ymd.optional(), endDate: ymd.optional() });

export const reportRoutes = Router();
reportRoutes.use(authenticate);
reportRoutes.get('/staff-performance/me', authorize('STAFF'), validate(personalQuery, 'query'), send((req) => r.personalPerformance(req.user, req.query)));
reportRoutes.get('/appointments', authorize('SUPER_ADMIN', 'ADMIN'), validate(appointmentQuery, 'query'), send((req) => r.appointmentReport(req.user, req.query)));
reportRoutes.get('/staff-performance', authorize('SUPER_ADMIN', 'ADMIN'), validate(performanceQuery, 'query'), send((req) => r.staffPerformance(req.user, req.query)));
const ym = z.string().regex(/^\d{4}-\d{2}$/, 'Month must be YYYY-MM');
const salaryQuery = z.object({
  branchId: z.string().optional(), month: ym.optional(), fromMonth: ym.optional(), toMonth: ym.optional(), staffId: z.string().optional(),
  designation: z.string().optional(), paymentStatus: z.enum(['FINALIZED', 'PARTIALLY_PAID', 'PAID']).optional(), paymentMethod: z.enum(['CASH', 'ONLINE']).optional(),
}).refine((q) => q.month || q.fromMonth, { message: 'Provide month or fromMonth/toMonth.' });
const commissionQuery = z.object({
  branchId: z.string().optional(), startDate: ymd, endDate: ymd, staffId: z.string().optional(),
  source: z.enum(['SERVICE', 'PACKAGE', 'PRODUCT']).optional(), invoiceNumber: z.string().optional(),
});
reportRoutes.get('/staff-salary', authorize('SUPER_ADMIN', 'ADMIN'), validate(salaryQuery, 'query'), send((req) => sp.staffSalaryReport(req.user, req.query)));
reportRoutes.get('/staff-commission', authorize('SUPER_ADMIN', 'ADMIN'), validate(commissionQuery, 'query'), send((req) => sp.staffCommissionReport(req.user, req.query)));