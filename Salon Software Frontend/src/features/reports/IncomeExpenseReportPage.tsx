import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { salonService } from '@/services';
import {
  Branch,
  IncomeExpenseReport,
  IncomeExpenseReportRow,
  IncomeExpenseReportQuery,
  IncomeExpenseItemType,
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
  TrendingUp,
  TrendingDown,
  RotateCcw,
  Wallet,
  Users,
  Award,
  AlertTriangle,
  Scale,
  DollarSign,
} from 'lucide-react';

const selectField = 'text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-hidden focus:ring-1 focus:ring-[#0047AB] h-8';
const inputField = 'text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-hidden focus:ring-1 focus:ring-[#0047AB] h-8';
const filterLabel = 'block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1';

export const IncomeExpenseReportPage: React.FC = () => {
  const { user, activeBranchId, allBranches } = useAuth();

  // Role guard: Super Admin, Admin, and Accountant
  if (!user || user.role === 'STAFF') {
    return <AccessDeniedView attemptedPath="/reports/income-expense" />;
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const defaultBranch = isSuperAdmin ? (activeBranchId || 'ALL') : (user.branchId || '');

  // Filter Form State
  const [selectedBranch, setSelectedBranch] = useState<string>(defaultBranch);
  const [selectedPreset, setSelectedPreset] = useState<DatePreset>('THIS_MONTH');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Applied Query State (triggers API fetch)
  const [appliedQuery, setAppliedQuery] = useState<IncomeExpenseReportQuery>({
    branchId: defaultBranch,
    preset: 'THIS_MONTH',
    type: 'ALL',
    category: 'ALL',
    status: 'ALL',
    paymentMethod: 'ALL',
    search: '',
  });

  // Report Data State
  const [reportData, setReportData] = useState<IncomeExpenseReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch report data from live backend API (100% Real DB)
  const fetchReport = useCallback(async (q: IncomeExpenseReportQuery) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await salonService.getIncomeExpenseReport(q);
      setReportData(data);
    } catch (err: any) {
      console.error('Failed to load Income & Expense report:', err);
      setErrorMessage(err.message || 'Failed to fetch live income & expense report from server.');
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
      preset: selectedPreset,
      startDate: selectedPreset === 'CUSTOM' ? customFrom : undefined,
      endDate: selectedPreset === 'CUSTOM' ? customTo : undefined,
      from: selectedPreset === 'CUSTOM' ? customFrom : undefined,
      to: selectedPreset === 'CUSTOM' ? customTo : undefined,
      type: selectedType,
      category: selectedCategory,
      status: selectedStatus,
      paymentMethod: selectedPaymentMethod,
      search: searchQuery.trim(),
    });
  };

  const handleResetFilters = () => {
    const resetBranch = isSuperAdmin ? (activeBranchId || 'ALL') : (user.branchId || '');
    setSelectedBranch(resetBranch);
    setSelectedPreset('THIS_MONTH');
    setCustomFrom('');
    setCustomTo('');
    setSelectedType('ALL');
    setSelectedCategory('ALL');
    setSelectedStatus('ALL');
    setSelectedPaymentMethod('ALL');
    setSearchQuery('');
    setAppliedQuery({
      branchId: resetBranch,
      preset: 'THIS_MONTH',
      type: 'ALL',
      category: 'ALL',
      status: 'ALL',
      paymentMethod: 'ALL',
      search: '',
    });
  };

  // Export handlers
  const exportHeaders = [
    'Date',
    'Type',
    'Category',
    'Source',
    'Reference',
    'Branch',
    'User / Payee',
    'Description',
    'Recognized Income (PKR)',
    'Recognized Expense (PKR)',
    'Payment Method',
    'Status',
  ];

  const exportRows = useMemo(() => {
    if (!reportData?.rows) return [];
    return reportData.rows.map((r) => [
      r.date,
      r.type,
      r.category,
      r.source,
      r.reference,
      r.branchName,
      r.userOrPayee,
      r.description,
      r.income,
      r.expense,
      r.paymentMethod,
      r.status,
    ]);
  }, [reportData]);

  const exportMeta: [string, string][] = useMemo(() => {
    const meta = reportData?.meta;
    return [
      ['Report', 'Income & Expense Financial Register'],
      ['Branch', meta?.branchName || 'All Branches'],
      ['Date Range', `${meta?.from || ''} to ${meta?.to || ''}`],
      ['Preset', meta?.preset || 'THIS_MONTH'],
      ['Timezone', meta?.timezone || 'Asia/Karachi'],
      ['Generated By', meta?.generatedBy || user?.name || 'User'],
      ['Generated At', meta?.generatedAt || new Date().toISOString()],
    ];
  }, [reportData, user]);

  const handleExportCsv = () => {
    if (!reportData || !reportData.rows.length) return;
    downloadReportCsv('income_expense_report', exportMeta, [
      { headers: exportHeaders, rows: exportRows },
    ]);
  };

  const handleExportExcel = () => {
    if (!reportData || !reportData.rows.length) return;
    downloadReportExcel('income_expense_report', exportMeta, [
      { headers: exportHeaders, rows: exportRows },
    ]);
  };

  const handleExportPrint = () => {
    if (!reportData || !reportData.rows.length) return;
    const totals = reportData.totals;
    const totalsRow = [
      'TOTAL',
      '',
      '',
      '',
      '',
      '',
      '',
      `Net: ${formatCurrency(totals.net)}`,
      totals.income,
      totals.expense,
      '',
      '',
    ];

    printReportWindow({
      title: 'Income & Expense Financial Register',
      subtitle: `Branch: ${reportData.meta.branchName} · Range: ${reportData.meta.from} to ${reportData.meta.to}`,
      meta: exportMeta,
      headers: exportHeaders,
      rows: exportRows,
      totals: totalsRow,
    });
  };

  // Helper Badge Renderers
  const renderTypeBadge = (type: IncomeExpenseItemType) => {
    switch (type) {
      case 'INCOME':
        return <Badge variant="success">Income</Badge>;
      case 'OPERATING_EXPENSE':
        return <Badge variant="danger">Expense</Badge>;
      case 'SALARY_EXPENSE':
        return <Badge variant="secondary">Salary</Badge>;
      case 'COMMISSION_EXPENSE':
        return <Badge variant="warning">Commission</Badge>;
      case 'INVENTORY_WRITEOFF':
        return <Badge variant="neutral">Stock Loss</Badge>;
      default:
        return <Badge variant="neutral">{type}</Badge>;
    }
  };

  const renderSourceBadge = (source: string) => {
    switch (source) {
      case 'POS_INVOICE':
        return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-[#0047AB]">POS Sale</span>;
      case 'INVOICE_REFUND':
        return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-50 text-rose-700">Refund Reversal</span>;
      case 'EXPENSE_VOUCHER':
        return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800">Expense Voucher</span>;
      case 'PAYROLL':
        return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700">Payroll Run</span>;
      case 'COMMISSION':
        return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-50 text-orange-700">Commission Ledger</span>;
      case 'INVENTORY':
        return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">Stock Shrinkage</span>;
      default:
        return <span className="text-[10px] text-slate-500">{source}</span>;
    }
  };

  // Table Column Definitions
  const columns: ColumnDef<IncomeExpenseReportRow>[] = [
    {
      key: 'date',
      header: 'Date',
      align: 'left',
      width: '100px',
      render: (row: IncomeExpenseReportRow) => (
        <span className="font-mono text-slate-700 text-xs">{row.date}</span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      align: 'left',
      width: '100px',
      render: (row: IncomeExpenseReportRow) => renderTypeBadge(row.type),
    },
    {
      key: 'category',
      header: 'Category',
      align: 'left',
      width: '160px',
      render: (row: IncomeExpenseReportRow) => (
        <span className="font-semibold text-slate-900 text-xs">{row.category}</span>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      align: 'left',
      width: '130px',
      render: (row: IncomeExpenseReportRow) => renderSourceBadge(row.source),
    },
    {
      key: 'reference',
      header: 'Reference #',
      align: 'left',
      width: '130px',
      render: (row: IncomeExpenseReportRow) => (
        <span className="font-mono font-bold text-[#0047AB] hover:underline cursor-pointer">
          {row.reference}
        </span>
      ),
    },
    {
      key: 'branchName',
      header: 'Branch',
      align: 'left',
      width: '140px',
      render: (row: IncomeExpenseReportRow) => (
        <span className="text-slate-600 text-xs">{row.branchName}</span>
      ),
    },
    {
      key: 'userOrPayee',
      header: 'User / Payee',
      align: 'left',
      width: '180px',
      render: (row: IncomeExpenseReportRow) => (
        <div className="max-w-[170px] truncate" title={row.userOrPayee}>
          <span className="text-slate-800 font-medium text-xs">{row.userOrPayee}</span>
        </div>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      align: 'left',
      width: '240px',
      render: (row: IncomeExpenseReportRow) => (
        <div className="max-w-[230px] truncate" title={row.description}>
          <span className="text-slate-600 text-xs">{row.description}</span>
        </div>
      ),
    },
    {
      key: 'income',
      header: 'Recognized Income',
      align: 'right',
      width: '140px',
      render: (row: IncomeExpenseReportRow) => {
        if (!row.income) return <span className="text-slate-300">-</span>;
        const isNegative = row.income < 0;
        return (
          <span className={`font-mono font-semibold ${isNegative ? 'text-rose-600' : 'text-emerald-700'}`}>
            {formatCurrency(row.income)}
          </span>
        );
      },
    },
    {
      key: 'expense',
      header: 'Recognized Expense',
      align: 'right',
      width: '140px',
      render: (row: IncomeExpenseReportRow) => {
        if (!row.expense) return <span className="text-slate-300">-</span>;
        const isNegative = row.expense < 0;
        return (
          <span className={`font-mono font-semibold ${isNegative ? 'text-emerald-600' : 'text-rose-600'}`}>
            {formatCurrency(row.expense)}
          </span>
        );
      },
    },
    {
      key: 'paymentMethod',
      header: 'Payment / Method',
      align: 'left',
      width: '130px',
      render: (row: IncomeExpenseReportRow) => (
        <span className="text-[11px] font-mono text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
          {row.paymentMethod || 'N/A'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      width: '110px',
      render: (row: IncomeExpenseReportRow) => {
        const s = row.status?.toUpperCase();
        if (s === 'POSTED' || s === 'PAID' || s === 'FINALIZED') {
          return <Badge variant="success">{s}</Badge>;
        }
        if (s === 'DRAFT') {
          return <Badge variant="neutral">Draft</Badge>;
        }
        if (s === 'REFUNDED') {
          return <Badge variant="danger">Refunded</Badge>;
        }
        if (s === 'WRITTEN_OFF') {
          return <Badge variant="warning">Written Off</Badge>;
        }
        return <Badge variant="neutral">{row.status}</Badge>;
      },
    },
  ];

  // Table Footer Totals Component
  const renderTotalsRow = () => {
    if (!reportData) return null;
    const totals = reportData.totals;
    return (
      <tr className="bg-[#EBF1FA] font-bold text-slate-900 border-t-2 border-slate-300 text-xs">
        <td className="py-2.5 px-3 text-center border-r border-slate-200/80">TOTAL</td>
        <td className="py-2.5 px-3" colSpan={7}>
          <span className="text-slate-600 font-normal">
            Total Rows: {reportData.rows.length} · Net Position:{' '}
          </span>
          <span className={totals.net >= 0 ? 'text-emerald-700 font-mono' : 'text-rose-700 font-mono'}>
            {formatCurrency(totals.net)}
          </span>
        </td>
        <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
          {formatCurrency(totals.income)}
        </td>
        <td className="py-2.5 px-3 text-right font-mono text-rose-700">
          {formatCurrency(totals.expense)}
        </td>
        <td className="py-2.5 px-3" colSpan={2}></td>
      </tr>
    );
  };

  // KPIs Extract
  const kpis = reportData?.kpis;
  const isSurplus = (kpis?.netOperatingPosition ?? 0) >= 0;

  return (
    <div className="space-y-4">
      {/* Universal Report Shell with Filter Header & Action Banner */}
      <ReportShell
        title="Income & Expense Financial Register"
        description="Canonical operating revenue and expenses tracking. Fully compliant with locked accounting invariants (excludes tax, tips, settlements & asset capitalizations)."
        icon={DollarSign}
        bannerTitle="Income & Expense Register"
        metaNotice={
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <span>Branch: <strong className="text-slate-700 font-semibold">{reportData?.meta.branchName || 'All'}</strong></span>
            <span>·</span>
            <span>Period: <strong className="text-slate-700 font-semibold">{reportData?.meta.from} to {reportData?.meta.to}</strong></span>
            <span>·</span>
            <span>Timezone: <strong className="text-slate-700 font-semibold">Asia/Karachi</strong></span>
          </div>
        }
        isFilterLoading={isLoading}
        onFilterSubmit={handleApplyFilters}
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPrint}
        onExportPrint={handleExportPrint}
        filterChildren={
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Branch / Campus Filter */}
            <div>
              <label className={filterLabel}>Campus / Branch</label>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                disabled={!isSuperAdmin}
                className={`${selectField} w-full`}
              >
                {isSuperAdmin && <option value="ALL">All Branches (Consolidated)</option>}
                {allBranches.map((b: Branch) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.city})
                  </option>
                ))}
              </select>
            </div>

            {/* Date Presets */}
            <div>
              <label className={filterLabel}>Date Preset (Karachi)</label>
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

            {/* Custom Range: From */}
            {selectedPreset === 'CUSTOM' ? (
              <div>
                <label className={filterLabel}>From Date</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className={`${inputField} w-full`}
                />
              </div>
            ) : (
              <div>
                <label className={filterLabel}>Item Type</label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className={`${selectField} w-full`}
                >
                  <option value="ALL">All Financial Types</option>
                  <option value="INCOME">Recognized Income</option>
                  <option value="OPERATING_EXPENSE">Operating Expenses</option>
                  <option value="SALARY_EXPENSE">Salaries & Wages</option>
                  <option value="COMMISSION_EXPENSE">Staff Commission</option>
                  <option value="INVENTORY_WRITEOFF">Inventory Losses</option>
                </select>
              </div>
            )}

            {/* Custom Range: To or Category Filter */}
            {selectedPreset === 'CUSTOM' ? (
              <div>
                <label className={filterLabel}>To Date</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className={`${inputField} w-full`}
                />
              </div>
            ) : (
              <div>
                <label className={filterLabel}>Category</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className={`${selectField} w-full`}
                >
                  <option value="ALL">All Categories</option>
                  {(reportData?.categories || []).map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Status Filter */}
            <div>
              <label className={filterLabel}>Posting Status</label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className={`${selectField} w-full`}
              >
                <option value="ALL">All Statuses</option>
                <option value="POSTED">Posted / Completed</option>
                <option value="FINALIZED">Finalized</option>
                <option value="REFUNDED">Refunded</option>
                <option value="WRITTEN_OFF">Written Off</option>
              </select>
            </div>

            {/* Search Filter */}
            <div>
              <label className={filterLabel}>Search Reference / Payee</label>
              <input
                type="text"
                placeholder="e.g. INV-001, EXP-042..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`${inputField} w-full`}
              />
            </div>
          </div>
        }
        kpiStrip={
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
            {/* 1. Total Recognized Income */}
            <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Recognized Income</span>
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <div className="mt-1 text-lg font-bold font-mono text-emerald-600">
                {formatCurrency(kpis?.totalRecognizedIncome ?? 0)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Net sales after reversals</div>
            </div>

            {/* 2. Total Operating Expenses */}
            <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total Expenses</span>
                <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
              </div>
              <div className="mt-1 text-lg font-bold font-mono text-rose-600">
                {formatCurrency(kpis?.totalOperatingExpenses ?? 0)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Direct + Payroll + Comm + Loss</div>
            </div>

            {/* 3. Net Operating Position */}
            <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs col-span-2 sm:col-span-1 lg:col-span-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                  Operating Surplus
                </span>
                <Scale className={`w-3.5 h-3.5 ${isSurplus ? 'text-emerald-600' : 'text-rose-600'}`} />
              </div>
              <div className={`mt-1 text-lg font-bold font-mono ${isSurplus ? 'text-emerald-700' : 'text-rose-700'}`}>
                {formatCurrency(kpis?.netOperatingPosition ?? 0)}
              </div>
              <div className={`text-[10px] font-medium mt-0.5 ${isSurplus ? 'text-emerald-600' : 'text-rose-600'}`}>
                Margin: {kpis?.operatingMarginPercent ?? 0}% ({isSurplus ? 'Surplus' : 'Deficit'})
              </div>
            </div>

            {/* 4. Direct Operational Expenses */}
            <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Direct Expenses</span>
                <Wallet className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <div className="mt-1 text-lg font-bold font-mono text-slate-900">
                {formatCurrency(kpis?.directExpenses ?? 0)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Rent, Utilities, Vouchers</div>
            </div>

            {/* 5. Salary Expenses */}
            <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Salaries</span>
                <Users className="w-3.5 h-3.5 text-purple-600" />
              </div>
              <div className="mt-1 text-lg font-bold font-mono text-slate-900">
                {formatCurrency(kpis?.salaryExpenses ?? 0)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Finalized payroll payables</div>
            </div>

            {/* 6. Commission Expenses */}
            <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Commissions</span>
                <Award className="w-3.5 h-3.5 text-amber-600" />
              </div>
              <div className="mt-1 text-lg font-bold font-mono text-slate-900">
                {formatCurrency(kpis?.commissionExpenses ?? 0)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Earned staff commissions</div>
            </div>

            {/* 7. Inventory Shrinkage Losses */}
            <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Stock Losses</span>
                <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
              </div>
              <div className="mt-1 text-lg font-bold font-mono text-slate-900">
                {formatCurrency(kpis?.inventoryLoss ?? 0)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Damage & expiry write-offs</div>
            </div>
          </div>
        }
      >
        {/* Error Notification */}
        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center justify-between">
            <span>{errorMessage}</span>
            <button
              onClick={() => fetchReport(appliedQuery)}
              className="px-2 py-0.5 bg-rose-100 hover:bg-rose-200 rounded font-semibold text-[11px]"
            >
              Retry
            </button>
          </div>
        )}

        {/* Landscape Report Table with Horizontal Scroller */}
        <ReportTable<IncomeExpenseReportRow>
          columns={columns}
          data={reportData?.rows || []}
          loading={isLoading}
          emptyMessage="No financial income or expense records found for the selected branch, dates, and filters."
          renderTotals={renderTotalsRow}
        />
      </ReportShell>
    </div>
  );
};

export default IncomeExpenseReportPage;
