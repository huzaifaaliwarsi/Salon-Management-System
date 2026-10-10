import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { salonService } from '@/services';
import {
  Branch,
  OperatingProfitReport,
  OperatingProfitStatementRow,
  OperatingProfitDetailRow,
  OperatingProfitReportQuery,
} from '@/types/salon';
import { AccessDeniedView } from '@/features/scaffold/AccessDeniedView';
import { formatCurrency, formatNumber } from '@/lib/formatters';
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
  Scale,
  RotateCcw,
  Wallet,
  DollarSign,
  Package,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Building2,
  FileSpreadsheet,
  ListTree,
} from 'lucide-react';

const selectField = 'text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-hidden focus:ring-1 focus:ring-[#0047AB] h-8';
const inputField = 'text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-hidden focus:ring-1 focus:ring-[#0047AB] h-8';
const filterLabel = 'block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1';

export const COGSReportPage: React.FC = () => {
  const { user, activeBranchId, allBranches } = useAuth();

  // Role guard: Super Admin, Admin, and Accountant
  if (!user || user.role === 'STAFF') {
    return <AccessDeniedView attemptedPath="/reports/operating-profit" />;
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const defaultBranch = isSuperAdmin ? (activeBranchId || 'ALL') : (user.branchId || '');

  // Filter Form State
  const [selectedBranch, setSelectedBranch] = useState<string>(defaultBranch);
  const [selectedPreset, setSelectedPreset] = useState<DatePreset>('THIS_MONTH');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'STATEMENT' | 'DETAILED'>('STATEMENT');

  // Applied Query State
  const [appliedQuery, setAppliedQuery] = useState<OperatingProfitReportQuery>({
    branchId: defaultBranch,
    preset: 'THIS_MONTH',
  });

  // Report Data State
  const [reportData, setReportData] = useState<OperatingProfitReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch report data from live backend API (100% Real DB)
  const fetchReport = useCallback(async (q: OperatingProfitReportQuery) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await salonService.getOperatingProfitReport(q);
      setReportData(data);
    } catch (err: any) {
      console.error('Failed to load Operating Profit report:', err);
      setErrorMessage(err.message || 'Failed to fetch live operating profit report from server.');
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
    });
  };

  const handleResetFilters = () => {
    const resetBranch = isSuperAdmin ? (activeBranchId || 'ALL') : (user.branchId || '');
    setSelectedBranch(resetBranch);
    setSelectedPreset('THIS_MONTH');
    setCustomFrom('');
    setCustomTo('');
    setAppliedQuery({
      branchId: resetBranch,
      preset: 'THIS_MONTH',
    });
  };

  // Export handlers
  const exportHeaders = [
    'Account / Line Item',
    'Classification',
    'Department / Category',
    'Current Period (PKR)',
    '% of Net Revenue',
    'Prior Period (PKR)',
    'Variance (PKR)',
    'Growth (%)',
    'Notes / Details',
  ];

  const exportRows = useMemo(() => {
    if (!reportData?.rows) return [];
    return reportData.rows.map((r) => [
      r.accountName,
      r.classification,
      r.department,
      r.currentAmount,
      `${r.percentOfRevenue}%`,
      r.priorAmount,
      r.varianceAmount,
      r.growthPercent !== null ? `${r.growthPercent}%` : 'N/A',
      r.notes,
    ]);
  }, [reportData]);

  const exportMeta: [string, string][] = useMemo(() => {
    const meta = reportData?.meta;
    return [
      ['Report', 'Operating Profit & P&L Statement'],
      ['Branch', meta?.branchName || 'All Branches'],
      ['Current Period', `${meta?.from || ''} to ${meta?.to || ''} (${meta?.preset || 'THIS_MONTH'})`],
      ['Prior Period', `${meta?.priorFrom || ''} to ${meta?.priorTo || ''}`],
      ['Date Basis', meta?.dateBasis || 'RECOGNITION'],
      ['Timezone', meta?.timezone || 'Asia/Karachi'],
      ['Generated By', meta?.generatedBy || user?.name || 'User'],
      ['Generated At', meta?.generatedAt || new Date().toISOString()],
    ];
  }, [reportData, user]);

  const handleExportCsv = () => {
    if (!reportData || !reportData.rows.length) return;
    downloadReportCsv('operating_profit_statement', exportMeta, [
      { headers: exportHeaders, rows: exportRows },
    ]);
  };

  const handleExportExcel = () => {
    if (!reportData || !reportData.rows.length) return;
    downloadReportExcel('operating_profit_statement', exportMeta, [
      { headers: exportHeaders, rows: exportRows },
    ]);
  };

  const handleExportPrint = () => {
    if (!reportData || !reportData.rows.length) return;
    const totals = reportData.totals;
    const totalsRow = [
      'NET OPERATING PROFIT',
      'NET_PROFIT',
      'Total Business',
      totals.netProfit,
      `${reportData.kpis.operatingMarginPercent}%`,
      reportData.kpis.priorOperatingProfit,
      totals.netProfit - reportData.kpis.priorOperatingProfit,
      reportData.kpis.profitGrowthPercent !== null ? `${reportData.kpis.profitGrowthPercent}%` : 'N/A',
      `Operating Margin: ${reportData.kpis.operatingMarginPercent}%`,
    ];

    printReportWindow({
      title: 'Operating Profit & P&L Statement',
      subtitle: `Branch: ${reportData.meta.branchName} · Current: ${reportData.meta.from} to ${reportData.meta.to} vs Prior: ${reportData.meta.priorFrom} to ${reportData.meta.priorTo}`,
      meta: exportMeta,
      headers: exportHeaders,
      rows: exportRows,
      totals: totalsRow,
    });
  };

  // Detailed Table Columns
  const detailedColumns: ColumnDef<OperatingProfitDetailRow>[] = [
    {
      key: 'accountName',
      header: 'Account / Line Item',
      align: 'left',
      width: '240px',
      render: (r: OperatingProfitDetailRow) => (
        <span className="font-semibold text-slate-900 text-xs">{r.accountName}</span>
      ),
    },
    {
      key: 'classification',
      header: 'Classification',
      align: 'left',
      width: '140px',
      render: (r: OperatingProfitDetailRow) => {
        if (r.classification === 'REVENUE') return <Badge variant="success">Revenue</Badge>;
        if (r.classification === 'REVENUE_REVERSAL') return <Badge variant="danger">Reversal</Badge>;
        if (r.classification === 'COST_OF_SALES') return <Badge variant="warning">Cost of Sales</Badge>;
        if (r.classification === 'OPERATING_EXPENSE') return <Badge variant="neutral">Operating Expense</Badge>;
        return <Badge variant="neutral">{r.classification}</Badge>;
      },
    },
    {
      key: 'department',
      header: 'Department / Layer',
      align: 'left',
      width: '170px',
      render: (r: OperatingProfitDetailRow) => (
        <span className="text-slate-600 text-xs">{r.department}</span>
      ),
    },
    {
      key: 'currentAmount',
      header: 'Current Period',
      align: 'right',
      width: '130px',
      render: (r: OperatingProfitDetailRow) => {
        const isNeg = r.currentAmount < 0;
        return (
          <span className={`font-mono font-semibold ${isNeg ? 'text-rose-600' : 'text-slate-900'}`}>
            {formatCurrency(r.currentAmount)}
          </span>
        );
      },
    },
    {
      key: 'percentOfRevenue',
      header: '% of Revenue',
      align: 'right',
      width: '100px',
      render: (r: OperatingProfitDetailRow) => (
        <span className="font-mono text-slate-600 text-xs">{r.percentOfRevenue}%</span>
      ),
    },
    {
      key: 'priorAmount',
      header: 'Prior Period',
      align: 'right',
      width: '130px',
      render: (r: OperatingProfitDetailRow) => (
        <span className="font-mono text-slate-500 text-xs">{formatCurrency(r.priorAmount)}</span>
      ),
    },
    {
      key: 'varianceAmount',
      header: 'Variance',
      align: 'right',
      width: '120px',
      render: (r: OperatingProfitDetailRow) => {
        const isUp = r.varianceAmount > 0;
        return (
          <span className={`font-mono text-xs ${isUp ? 'text-emerald-700' : r.varianceAmount < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
            {formatCurrency(r.varianceAmount)}
          </span>
        );
      },
    },
    {
      key: 'growthPercent',
      header: 'Growth %',
      align: 'right',
      width: '90px',
      render: (r: OperatingProfitDetailRow) => {
        if (r.growthPercent === null) return <span className="text-slate-300">-</span>;
        const isPositive = r.growthPercent >= 0;
        return (
          <span className={`font-mono text-xs font-semibold ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
            {isPositive ? `+${r.growthPercent}%` : `${r.growthPercent}%`}
          </span>
        );
      },
    },
    {
      key: 'notes',
      header: 'Notes / Composition Details',
      align: 'left',
      width: '260px',
      render: (r: OperatingProfitDetailRow) => (
        <div className="max-w-[250px] truncate" title={r.notes}>
          <span className="text-slate-500 text-xs">{r.notes}</span>
        </div>
      ),
    },
  ];

  // Render totals footer for detailed table
  const renderTotalsRow = () => {
    if (!reportData) return null;
    const totals = reportData.totals;
    const kpis = reportData.kpis;
    return (
      <tr className="bg-[#EBF1FA] font-bold text-slate-900 border-t-2 border-slate-300 text-xs">
        <td className="py-2.5 px-3 text-center border-r border-slate-200/80">TOTAL</td>
        <td className="py-2.5 px-3" colSpan={2}>
          <span>NET OPERATING PROFIT / (LOSS)</span>
        </td>
        <td className="py-2.5 px-3 text-right font-mono text-emerald-800 font-bold">
          {formatCurrency(totals.netProfit)}
        </td>
        <td className="py-2.5 px-3 text-right font-mono text-slate-700">
          {kpis.operatingMarginPercent}%
        </td>
        <td className="py-2.5 px-3 text-right font-mono text-slate-600">
          {formatCurrency(kpis.priorOperatingProfit)}
        </td>
        <td className="py-2.5 px-3 text-right font-mono">
          {formatCurrency(totals.netProfit - kpis.priorOperatingProfit)}
        </td>
        <td className="py-2.5 px-3 text-right font-mono">
          {kpis.profitGrowthPercent !== null ? `${kpis.profitGrowthPercent}%` : '-'}
        </td>
        <td className="py-2.5 px-3 text-slate-600">
          Net Margin: {kpis.operatingMarginPercent}%
        </td>
      </tr>
    );
  };

  const kpis = reportData?.kpis;
  const isSurplus = (kpis?.netOperatingProfit ?? 0) >= 0;

  return (
    <div className="space-y-4">
      {/* Universal Report Shell */}
      <ReportShell
        title="Operating Profit & P&L Statement"
        description="Managerial statement of profit and loss. Combines recognized net revenue with FIFO/FEFO Product COGS, salon consumable consumption, direct overheads, finalized payroll, and commissions."
        icon={TrendingUp}
        bannerTitle="Operating Profit & P&L Statement"
        metaNotice={
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <span>Branch: <strong className="text-slate-800">{reportData?.meta.branchName || 'All'}</strong></span>
            <span>·</span>
            <span>Current: <strong className="text-slate-800">{reportData?.meta.from} to {reportData?.meta.to}</strong></span>
            <span>·</span>
            <span>Prior: <strong className="text-slate-800">{reportData?.meta.priorFrom} to {reportData?.meta.priorTo}</strong></span>
            <span>·</span>
            <span>Timezone: <strong className="text-slate-800">Asia/Karachi</strong></span>
          </div>
        }
        isFilterLoading={isLoading}
        onFilterSubmit={handleApplyFilters}
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPrint}
        onExportPrint={handleExportPrint}
        filterChildren={
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {/* Branch Filter */}
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

            {/* Date Preset */}
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

            {/* Custom From */}
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
            ) : null}

            {/* Custom To */}
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
            ) : null}

            {/* View Switcher */}
            <div>
              <label className={filterLabel}>Statement Format</label>
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 w-full h-8">
                <button
                  type="button"
                  onClick={() => setActiveTab('STATEMENT')}
                  className={`flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold rounded-md transition-all ${
                    activeTab === 'STATEMENT'
                      ? 'bg-white text-[#0047AB] shadow-xs'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <ListTree className="w-3.5 h-3.5" />
                  P&L Statement
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('DETAILED')}
                  className={`flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold rounded-md transition-all ${
                    activeTab === 'DETAILED'
                      ? 'bg-white text-[#0047AB] shadow-xs'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Landscape Scroller
                </button>
              </div>
            </div>
          </div>
        }
        kpiStrip={
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {/* 1. Total Net Revenue */}
            <div className="bg-white rounded-lg p-3 border border-slate-200/80 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Net Turnover</span>
                <DollarSign className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <div className="mt-1 text-base font-bold font-mono text-slate-900">
                {formatCurrency(kpis?.totalNetRevenue ?? 0)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Services + Packages + Products</div>
            </div>

            {/* 2. Total Cost of Sales */}
            <div className="bg-white rounded-lg p-3 border border-slate-200/80 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Cost of Sales</span>
                <Package className="w-3.5 h-3.5 text-amber-600" />
              </div>
              <div className="mt-1 text-base font-bold font-mono text-slate-900">
                {formatCurrency(kpis?.totalCostOfSales ?? 0)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Product COGS + Consumables</div>
            </div>

            {/* 3. Gross Contribution */}
            <div className="bg-white rounded-lg p-3 border border-slate-200/80 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Gross Margin</span>
                <Layers className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <div className="mt-1 text-base font-bold font-mono text-emerald-700">
                {formatCurrency(kpis?.grossContribution ?? 0)}
              </div>
              <div className="text-[10px] font-medium text-emerald-600 mt-0.5">
                Margin: {kpis?.grossMarginPercent ?? 0}%
              </div>
            </div>

            {/* 4. Total Operating Expenses */}
            <div className="bg-white rounded-lg p-3 border border-slate-200/80 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Total Overheads</span>
                <Wallet className="w-3.5 h-3.5 text-rose-600" />
              </div>
              <div className="mt-1 text-base font-bold font-mono text-rose-600">
                {formatCurrency(kpis?.totalOperatingExpenses ?? 0)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Salaries + Comm + Direct + Loss</div>
            </div>

            {/* 5. Net Operating Profit (Hero card) */}
            <div className="bg-white rounded-lg p-3 border border-slate-200/80 shadow-2xs col-span-2 sm:col-span-1 lg:col-span-1">
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-bold uppercase tracking-wider ${isSurplus ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {isSurplus ? 'Operating Profit' : 'Operating Loss'}
                </span>
                <Scale className={`w-3.5 h-3.5 ${isSurplus ? 'text-emerald-600' : 'text-rose-600'}`} />
              </div>
              <div className={`mt-1 text-base font-extrabold font-mono ${isSurplus ? 'text-emerald-700' : 'text-rose-700'}`}>
                {formatCurrency(kpis?.netOperatingProfit ?? 0)}
              </div>
              <div className={`text-[10px] font-medium mt-0.5 ${isSurplus ? 'text-emerald-600' : 'text-rose-600'}`}>
                Net Margin: {kpis?.operatingMarginPercent ?? 0}%
              </div>
            </div>

            {/* 6. Period Variance / Growth */}
            <div className="bg-white rounded-lg p-3 border border-slate-200/80 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Profit Growth</span>
                {(kpis?.profitGrowthPercent ?? 0) >= 0 ? (
                  <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5 text-rose-600" />
                )}
              </div>
              <div className="mt-1 text-base font-bold font-mono text-slate-900">
                {kpis?.profitGrowthPercent !== null && kpis?.profitGrowthPercent !== undefined
                  ? `${kpis.profitGrowthPercent >= 0 ? '+' : ''}${kpis.profitGrowthPercent}%`
                  : 'N/A'}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">vs Prior Period</div>
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

        {/* Tab 1: Formal Managerial P&L Financial Statement */}
        {activeTab === 'STATEMENT' ? (
          <div className="w-full bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="w-full overflow-x-auto min-w-full">
              <table className="w-full text-xs text-left text-slate-700 whitespace-nowrap border-collapse">
                <thead className="bg-[#EBF1FA] text-slate-800 font-bold border-b border-slate-200 text-[11px] tracking-wide uppercase">
                  <tr>
                    <th className="py-2.5 px-4 text-left">P&L Financial Line Item</th>
                    <th className="py-2.5 px-4 text-center">Section</th>
                    <th className="py-2.5 px-4 text-right">Current Period (PKR)</th>
                    <th className="py-2.5 px-4 text-right">% of Turnover</th>
                    <th className="py-2.5 px-4 text-right">Prior Period (PKR)</th>
                    <th className="py-2.5 px-4 text-right">Variance (Growth %)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <div className="w-6 h-6 border-2 border-[#0047AB] border-t-transparent rounded-full animate-spin" />
                          <span>Calculating live operating profit statement...</span>
                        </div>
                      </td>
                    </tr>
                  ) : !reportData?.statementRows?.length ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No financial records found for this period.
                      </td>
                    </tr>
                  ) : (
                    reportData.statementRows.map((line) => {
                      // Section Header Styling
                      if (line.isHeader) {
                        return (
                          <tr key={line.id} className="bg-slate-50 font-bold text-slate-900 border-t border-slate-200">
                            <td colSpan={6} className="py-2.5 px-4 uppercase tracking-wider text-[11px] text-[#0047AB]">
                              {line.name}
                            </td>
                          </tr>
                        );
                      }

                      // Subtotal Styling
                      if (line.isTotal) {
                        return (
                          <tr key={line.id} className="bg-slate-100/70 font-bold text-slate-900 border-t border-b border-slate-300">
                            <td className="py-2.5 px-4 font-bold">{line.name}</td>
                            <td className="py-2.5 px-4 text-center text-[10px] text-slate-500 font-mono">SUBTOTAL</td>
                            <td className="py-2.5 px-4 text-right font-mono font-bold">{formatCurrency(line.currentAmount)}</td>
                            <td className="py-2.5 px-4 text-right font-mono text-slate-600">{line.percentOfRevenue}%</td>
                            <td className="py-2.5 px-4 text-right font-mono text-slate-500">{formatCurrency(line.priorAmount)}</td>
                            <td className="py-2.5 px-4 text-right font-mono">
                              {line.growthPercent !== null ? (
                                <span className={line.growthPercent >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                                  {line.growthPercent >= 0 ? `+${line.growthPercent}%` : `${line.growthPercent}%`}
                                </span>
                              ) : '-'}
                            </td>
                          </tr>
                        );
                      }

                      // Gross Contribution Major Total
                      if (line.isMajorTotal) {
                        return (
                          <tr key={line.id} className="bg-emerald-50/60 font-bold text-emerald-950 border-t-2 border-b-2 border-emerald-300">
                            <td className="py-3 px-4 font-extrabold text-sm text-emerald-900">{line.name}</td>
                            <td className="py-3 px-4 text-center text-[10px] text-emerald-700 font-mono font-bold">GROSS MARGIN</td>
                            <td className="py-3 px-4 text-right font-mono text-sm font-extrabold text-emerald-800">{formatCurrency(line.currentAmount)}</td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">{line.percentOfRevenue}%</td>
                            <td className="py-3 px-4 text-right font-mono text-slate-600">{formatCurrency(line.priorAmount)}</td>
                            <td className="py-3 px-4 text-right font-mono font-bold">
                              {line.growthPercent !== null ? (
                                <span className={line.growthPercent >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                                  {line.growthPercent >= 0 ? `+${line.growthPercent}%` : `${line.growthPercent}%`}
                                </span>
                              ) : '-'}
                            </td>
                          </tr>
                        );
                      }

                      // Final Net Profit / Loss Line
                      if (line.isFinalNet) {
                        const isNetPos = line.currentAmount >= 0;
                        return (
                          <tr key={line.id} className={`font-bold border-t-2 border-b-4 ${
                            isNetPos
                              ? 'bg-emerald-100/70 text-emerald-950 border-emerald-400'
                              : 'bg-rose-100/70 text-rose-950 border-rose-400'
                          }`}>
                            <td className="py-3.5 px-4 font-black text-sm uppercase tracking-wide">
                              {line.name}
                            </td>
                            <td className="py-3.5 px-4 text-center text-[10px] font-mono font-bold uppercase">
                              {isNetPos ? 'SURPLUS' : 'DEFICIT'}
                            </td>
                            <td className={`py-3.5 px-4 text-right font-mono text-base font-black ${
                              isNetPos ? 'text-emerald-900' : 'text-rose-900'
                            }`}>
                              {formatCurrency(line.currentAmount)}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono font-bold">{line.percentOfRevenue}%</td>
                            <td className="py-3.5 px-4 text-right font-mono text-slate-700">{formatCurrency(line.priorAmount)}</td>
                            <td className="py-3.5 px-4 text-right font-mono font-black">
                              {line.growthPercent !== null ? (
                                <span className={line.growthPercent >= 0 ? 'text-emerald-800' : 'text-rose-800'}>
                                  {line.growthPercent >= 0 ? `+${line.growthPercent}%` : `${line.growthPercent}%`}
                                </span>
                              ) : '-'}
                            </td>
                          </tr>
                        );
                      }

                      // Regular Indented SubItem Line
                      return (
                        <tr key={line.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2 px-4 pl-8 text-slate-800 font-medium flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                            {line.name}
                          </td>
                          <td className="py-2 px-4 text-center">
                            <span className="text-[10px] text-slate-400 font-mono">{line.section}</span>
                          </td>
                          <td className="py-2 px-4 text-right font-mono text-slate-900">
                            {formatCurrency(line.currentAmount)}
                          </td>
                          <td className="py-2 px-4 text-right font-mono text-slate-500">
                            {line.percentOfRevenue}%
                          </td>
                          <td className="py-2 px-4 text-right font-mono text-slate-400">
                            {formatCurrency(line.priorAmount)}
                          </td>
                          <td className="py-2 px-4 text-right font-mono">
                            {line.growthPercent !== null ? (
                              <span className={line.growthPercent >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                                {line.growthPercent >= 0 ? `+${line.growthPercent}%` : `${line.growthPercent}%`}
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Tab 2: Landscape Detailed Ledger Table with Horizontal Scroller */
          <ReportTable<OperatingProfitDetailRow>
            columns={detailedColumns}
            data={reportData?.rows || []}
            loading={isLoading}
            emptyMessage="No operational line items recorded for the selected branch and period."
            renderTotals={renderTotalsRow}
          />
        )}
      </ReportShell>
    </div>
  );
};

export default COGSReportPage;
