import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { salonService } from '@/services';
import {
  DetailedExpensesReport,
  DetailedExpenseRow,
  DetailedExpensesReportQuery,
  OnlineAccountBreakdownItem,
  DetailedExpenseCategoryItem,
  Branch,
} from '@/types/salon';
import { AccessDeniedView } from '@/features/scaffold/AccessDeniedView';
import { formatCurrency } from '@/lib/formatters';
import { Badge } from '@/components/ui/badge';
import { ReportShell } from '@/features/reports/components/ReportShell';
import { ReportTable, ColumnDef } from '@/features/reports/components/ReportTable';
import {
  downloadReportCsv,
  downloadReportExcel,
  printReportWindow,
  DATE_PRESETS,
  DatePreset,
} from '@/features/reports/reportUtils';
import {
  Receipt,
  Banknote,
  Smartphone,
  CreditCard,
  Building2,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingDown,
  Tag,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  Info,
  DollarSign,
  FileSpreadsheet,
} from 'lucide-react';

const selectField = 'text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-hidden focus:ring-1 focus:ring-[#0047AB] h-8';
const inputField = 'text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-hidden focus:ring-1 focus:ring-[#0047AB] h-8';
const filterLabel = 'block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1';

export const DetailedExpensesReportPage: React.FC = () => {
  const { user, activeBranchId, allBranches } = useAuth();

  // Role guard: Super Admin, Admin, and Accountant
  if (!user || user.role === 'STAFF') {
    return <AccessDeniedView attemptedPath="/reports/detailed-expenses" />;
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const defaultBranch = isSuperAdmin ? (activeBranchId || 'ALL') : (user.branchId || '');

  // Filter Form State
  const [selectedBranch, setSelectedBranch] = useState<string>(defaultBranch);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedPaymentSource, setSelectedPaymentSource] = useState<string>('ALL');
  const [selectedPreset, setSelectedPreset] = useState<DatePreset>('THIS_MONTH');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Applied Query State (triggers API fetch)
  const [appliedQuery, setAppliedQuery] = useState<DetailedExpensesReportQuery>({
    branchId: defaultBranch,
    category: 'ALL',
    status: 'ALL',
    paymentSource: 'ALL',
    preset: 'THIS_MONTH',
  });

  const [reportData, setReportData] = useState<DetailedExpensesReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch Report Data from Live Express Backend
  const fetchReport = useCallback(async (q: DetailedExpensesReportQuery) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await salonService.getDetailedExpensesReport(q);
      setReportData(data);
    } catch (err: any) {
      console.error('Failed to load Detailed Expenses report:', err);
      setErrorMessage(err.message || 'Failed to fetch live expenses report from server.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Update branch state when active branch in context changes
  useEffect(() => {
    if (isSuperAdmin && activeBranchId && activeBranchId !== selectedBranch) {
      setSelectedBranch(activeBranchId);
      setAppliedQuery((prev) => ({ ...prev, branchId: activeBranchId }));
    }
  }, [activeBranchId, isSuperAdmin]);

  // Load report when applied query changes
  useEffect(() => {
    fetchReport(appliedQuery);
  }, [appliedQuery, fetchReport]);

  // Handle Form Submit / Filter Button
  const handleApplyFilters = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAppliedQuery({
      branchId: selectedBranch,
      category: selectedCategory,
      status: selectedStatus,
      paymentSource: selectedPaymentSource,
      preset: selectedPreset,
      startDate: selectedPreset === 'CUSTOM' ? customFrom : undefined,
      endDate: selectedPreset === 'CUSTOM' ? customTo : undefined,
      from: selectedPreset === 'CUSTOM' ? customFrom : undefined,
      to: selectedPreset === 'CUSTOM' ? customTo : undefined,
      search: searchQuery.trim(),
    });
  };

  // Export Metadata
  const exportMeta: [string, string][] = useMemo(() => {
    if (!reportData) return [];
    return [
      ['Report Name', 'Detailed Operational Expenses Register'],
      ['Branch / Campus', reportData.meta.branchName || 'All Branches'],
      ['Reporting Window', `${reportData.meta.from.slice(0, 10)} to ${reportData.meta.to.slice(0, 10)}`],
      ['Date Basis', `${reportData.meta.dateBasis} (${reportData.meta.timezone})`],
      ['Total Operational Expenses', formatCurrency(reportData.kpis.totalExpenses)],
      ['Cash Disbursed', formatCurrency(reportData.kpis.cashExpenses)],
      ['Online Disbursed', formatCurrency(reportData.kpis.onlineExpenses)],
      ['Total Vouchers Logged', String(reportData.kpis.totalVouchersCount)],
      ['Posted Vouchers', String(reportData.kpis.postedCount)],
      ['Reversed Vouchers', String(reportData.kpis.reversedCount)],
      ['Generated At', reportData.meta.generatedAt],
      ['Generated By', reportData.meta.generatedBy],
    ];
  }, [reportData]);

  // Export Headers
  const exportHeaders = useMemo(
    () => [
      'Voucher #',
      'Date',
      'Time',
      'Category',
      'Title / Description',
      'Payee / Vendor',
      'Branch',
      'Recorded By',
      'Payment Source',
      'Account / Drawer',
      'Amount (PKR)',
      'Status',
      'External Ref',
      'Notes',
    ],
    []
  );

  const exportRows = useMemo(() => {
    if (!reportData?.rows) return [];
    return reportData.rows.map((r: DetailedExpenseRow) => [
      r.voucherNumber,
      r.date,
      r.time,
      r.category,
      r.title,
      r.payee,
      r.branchName,
      r.createdByName,
      r.paymentSource === 'CASH_DRAWER' ? 'Cash Drawer' : 'Online Account',
      r.paymentAccountName || (r.paymentSource === 'CASH_DRAWER' ? 'Cash Drawer' : '-'),
      r.amount,
      r.status,
      r.externalReference || '-',
      r.notes || '-',
    ]);
  }, [reportData]);

  // Export Handlers
  const handleExportCsv = () => {
    if (!reportData || !reportData.rows.length) return;
    downloadReportCsv('detailed_expenses_report', exportMeta, [
      { headers: exportHeaders, rows: exportRows },
    ]);
  };

  const handleExportExcel = () => {
    if (!reportData || !reportData.rows.length) return;
    downloadReportExcel('detailed_expenses_report', exportMeta, [
      { title: 'Expenses Register', headers: exportHeaders, rows: exportRows },
    ]);
  };

  const handlePrint = () => {
    if (!reportData || !reportData.rows.length) return;
    const totalsRow = [
      'TOTAL',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      reportData.totals.amount,
      '',
      '',
      '',
    ];
    printReportWindow({
      title: 'Detailed Operational Expenses Register',
      subtitle: `Branch: ${reportData.meta.branchName} · Window: ${reportData.meta.from.slice(0, 10)} to ${reportData.meta.to.slice(0, 10)}`,
      meta: exportMeta,
      headers: exportHeaders,
      rows: exportRows,
      totals: totalsRow,
    });
  };

  // Table Columns Definition
  const columns: ColumnDef<DetailedExpenseRow>[] = useMemo(
    () => [
      {
        key: 'voucherNumber',
        header: 'Voucher #',
        width: '120px',
        render: (row) => (
          <div>
            <span
              className={`font-bold font-mono text-xs block ${
                row.isReversalRecord ? 'text-amber-600' : 'text-[#0047AB]'
              }`}
            >
              {row.voucherNumber}
            </span>
            <span className="text-[10px] text-slate-400 block">{row.date} {row.time}</span>
          </div>
        ),
      },
      {
        key: 'category',
        header: 'Category',
        width: '130px',
        render: (row) => (
          <Badge variant="outline" className="font-semibold text-[11px] text-slate-700 bg-slate-50 border-slate-200">
            {row.category}
          </Badge>
        ),
      },
      {
        key: 'title',
        header: 'Title / Description',
        width: '200px',
        render: (row) => (
          <div>
            <span className="font-semibold text-slate-800 text-xs block truncate" title={row.title}>
              {row.title}
            </span>
            {row.description && (
              <span className="text-[10px] text-slate-500 block truncate max-w-[190px]" title={row.description}>
                {row.description}
              </span>
            )}
          </div>
        ),
      },
      {
        key: 'payee',
        header: 'Payee / Vendor',
        width: '140px',
        render: (row) => (
          <span className="font-medium text-slate-700 text-xs block truncate" title={row.payee}>
            {row.payee}
          </span>
        ),
      },
      {
        key: 'branchName',
        header: 'Branch',
        width: '120px',
        render: (row) => <span className="text-slate-600 text-xs">{row.branchName}</span>,
      },
      {
        key: 'paymentSource',
        header: 'Payment Source',
        width: '140px',
        render: (row) => (
          <div>
            <div className="flex items-center gap-1.5">
              {row.paymentSource === 'CASH_DRAWER' ? (
                <Banknote className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <CreditCard className="w-3.5 h-3.5 text-blue-600" />
              )}
              <span className="text-xs font-semibold text-slate-800">
                {row.paymentSource === 'CASH_DRAWER' ? 'Cash Drawer' : 'Online Account'}
              </span>
            </div>
            {row.paymentAccountName && (
              <span className="text-[10px] text-slate-400 block truncate font-mono">
                {row.paymentAccountName}
              </span>
            )}
          </div>
        ),
      },
      {
        key: 'amount',
        header: 'Amount',
        align: 'right',
        width: '125px',
        render: (row) => (
          <span
            className={`font-mono text-xs font-bold ${
              row.status === 'REVERSED'
                ? 'line-through text-slate-400'
                : 'text-rose-600'
            }`}
          >
            {formatCurrency(row.amount)}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        width: '110px',
        render: (row) => {
          if (row.status === 'POSTED') {
            return (
              <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Posted
              </Badge>
            );
          }
          if (row.status === 'REVERSED') {
            return (
              <Badge className="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-semibold gap-1">
                <XCircle className="w-3 h-3 text-rose-600" /> Reversed
              </Badge>
            );
          }
          return (
            <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold gap-1">
              <Clock className="w-3 h-3 text-amber-600" /> Draft
            </Badge>
          );
        },
      },
      {
        key: 'createdByName',
        header: 'Recorded By',
        width: '130px',
        render: (row) => (
          <div>
            <span className="text-xs text-slate-700 block truncate">{row.createdByName}</span>
            {row.externalReference && (
              <span className="text-[10px] font-mono text-slate-400 block truncate" title={row.externalReference}>
                Ref: {row.externalReference}
              </span>
            )}
          </div>
        ),
      },
    ],
    []
  );

  // Filter Form Controls
  const filterForm = (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 items-end">
      {/* Branch / Campus */}
      <div>
        <label className={filterLabel}>Campus / Branch</label>
        <select
          value={selectedBranch}
          onChange={(e) => setSelectedBranch(e.target.value)}
          disabled={!isSuperAdmin}
          className={`${selectField} w-full`}
        >
          {isSuperAdmin && <option value="ALL">All Branches</option>}
          {allBranches?.map((b: Branch) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {/* Category Filter */}
      <div>
        <label className={filterLabel}>Expense Category</label>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className={`${selectField} w-full`}
        >
          <option value="ALL">All Categories</option>
          {reportData?.categories?.map((cat: string) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* Payment Source */}
      <div>
        <label className={filterLabel}>Payment Source</label>
        <select
          value={selectedPaymentSource}
          onChange={(e) => setSelectedPaymentSource(e.target.value)}
          className={`${selectField} w-full`}
        >
          <option value="ALL">All Sources</option>
          <option value="CASH_DRAWER">Cash Drawer (Cash)</option>
          <option value="ONLINE_ACCOUNT">Online / Bank Account</option>
        </select>
      </div>

      {/* Status Filter */}
      <div>
        <label className={filterLabel}>Voucher Status</label>
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className={`${selectField} w-full`}
        >
          <option value="ALL">All (Posted & Reversed)</option>
          <option value="POSTED">Posted Only</option>
          <option value="REVERSED">Reversals Only</option>
          <option value="DRAFT">Drafts</option>
        </select>
      </div>

      {/* Date Presets */}
      <div>
        <label className={filterLabel}>Date Preset</label>
        <select
          value={selectedPreset}
          onChange={(e) => setSelectedPreset(e.target.value as DatePreset)}
          className={`${selectField} w-full`}
        >
          {DATE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* Search Input */}
      <div>
        <label className={filterLabel}>Search Records</label>
        <input
          type="text"
          placeholder="Voucher #, Payee, title..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={`${inputField} w-full`}
        />
      </div>

      {/* Custom Date Pickers */}
      {selectedPreset === 'CUSTOM' && (
        <div className="col-span-full grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label className={filterLabel}>From Date</label>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className={`${inputField} w-full`}
            />
          </div>
          <div>
            <label className={filterLabel}>To Date</label>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className={`${inputField} w-full`}
            />
          </div>
        </div>
      )}
    </div>
  );

  // KPI Summary Strip
  const kpiStrip = reportData ? (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-2">
      {/* Total Expenses */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
            Total Recognized Expenses
          </span>
          <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
        </div>
        <span className="text-base font-bold text-rose-600 font-mono block">
          {formatCurrency(reportData.kpis.totalExpenses)}
        </span>
        <span className="text-[10px] text-slate-400 mt-0.5 block">Operating Disbursements</span>
      </div>

      {/* Cash Expenses */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
            Cash Expenses
          </span>
          <Banknote className="w-3.5 h-3.5 text-emerald-500" />
        </div>
        <span className="text-base font-bold text-emerald-600 font-mono block">
          {formatCurrency(reportData.kpis.cashExpenses)}
        </span>
        <span className="text-[10px] text-slate-400 mt-0.5 block">From Drawer Float</span>
      </div>

      {/* Online Expenses */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
            Online Expenses
          </span>
          <CreditCard className="w-3.5 h-3.5 text-blue-500" />
        </div>
        <span className="text-base font-bold text-blue-600 font-mono block">
          {formatCurrency(reportData.kpis.onlineExpenses)}
        </span>
        <span className="text-[10px] text-slate-400 mt-0.5 block">Bank / Digital Wallets</span>
      </div>

      {/* Total Vouchers */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
          Total Vouchers
        </span>
        <span className="text-base font-bold text-slate-800 font-mono block">
          {reportData.kpis.totalVouchersCount}
        </span>
        <span className="text-[10px] text-slate-400 mt-0.5 block">Audit Records</span>
      </div>

      {/* Posted Count */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
          Active Posted
        </span>
        <span className="text-base font-bold text-emerald-600 font-mono block">
          {reportData.kpis.postedCount}
        </span>
        <span className="text-[10px] text-slate-400 mt-0.5 block">Financial Impact</span>
      </div>

      {/* Reversals Count */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
          Reversed Vouchers
        </span>
        <span className="text-base font-bold text-amber-600 font-mono block">
          {reportData.kpis.reversedCount}
        </span>
        <span className="text-[10px] text-slate-400 mt-0.5 block">Voided / Corrected</span>
      </div>

      {/* Categories Count */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
          Categories
        </span>
        <span className="text-base font-bold text-slate-700 font-mono block">
          {reportData.kpis.categoryCount}
        </span>
        <span className="text-[10px] text-slate-400 mt-0.5 block">Cost Centers</span>
      </div>
    </div>
  ) : null;

  return (
    <ReportShell
      title="Detailed Operational Expenses"
      description="Itemized operational expense register by category, voucher reference, payment source, and recorded staff."
      icon={Receipt}
      bannerTitle="Detailed Operational Expenses Register"
      metaNotice={
        reportData ? (
          <div className="flex flex-wrap items-center gap-2">
            <span>Branch: <strong className="text-slate-800">{reportData.meta.branchName || 'All'}</strong></span>
            <span>·</span>
            <span>Window: <strong className="text-slate-800">{reportData.meta.from.slice(0, 10)} to {reportData.meta.to.slice(0, 10)}</strong></span>
            <span>·</span>
            <span>Date Basis: <strong className="text-slate-800">{reportData.meta.dateBasis} ({reportData.meta.timezone})</strong></span>
          </div>
        ) : undefined
      }
      isFilterLoading={isLoading}
      onFilterSubmit={handleApplyFilters}
      onExportExcel={handleExportExcel}
      onExportCsv={handleExportCsv}
      onExportPdf={handlePrint}
      onExportPrint={handlePrint}
      filterChildren={filterForm}
      kpiStrip={kpiStrip}
    >
      {/* ERROR BANNER */}
      {errorMessage && (
        <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0 text-rose-500" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* ── CATEGORY DISTRIBUTION STRIP ── */}
      {reportData?.categoryBreakdown && reportData.categoryBreakdown.length > 0 && (
        <div className="mb-4 bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Tag className="w-3.5 h-3.5 text-[#0047AB]" />
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                Category Cost Breakdown
              </span>
            </div>
            <span className="text-[11px] text-slate-400">
              {reportData.categoryBreakdown.length} Active Categories
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {reportData.categoryBreakdown.map((cat: DetailedExpenseCategoryItem) => (
              <div
                key={cat.categoryName}
                className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs"
              >
                <span className="font-medium text-slate-700">{cat.categoryName}:</span>
                <span className="font-mono font-bold text-rose-600">
                  {formatCurrency(cat.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── LANDSCAPE TABLE ── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        <ReportTable
          columns={columns}
          data={reportData?.rows || []}
          loading={isLoading}
          emptyMessage="No operational expenses found for the selected filter range."
        />
      </div>
    </ReportShell>
  );
};
