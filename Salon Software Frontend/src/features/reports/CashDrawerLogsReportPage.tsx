import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { salonService } from '@/services';
import {
  CashDrawerReport,
  CashDrawerReportRow,
  CashDrawerReportQuery,
  OnlineAccountBreakdownItem,
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
  Banknote,
  Smartphone,
  CreditCard,
  Building2,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
  Scale,
  Lock,
  Unlock,
  AlertTriangle,
  Info,
  DollarSign,
  CheckCircle2,
  Clock,
} from 'lucide-react';

const selectField = 'text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-hidden focus:ring-1 focus:ring-[#0047AB] h-8';
const inputField = 'text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-hidden focus:ring-1 focus:ring-[#0047AB] h-8';
const filterLabel = 'block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1';

export const CashDrawerLogsReportPage: React.FC = () => {
  const { user, activeBranchId, allBranches } = useAuth();

  // Role guard: Super Admin, Admin, and Accountant
  if (!user || user.role === 'STAFF') {
    return <AccessDeniedView attemptedPath="/reports/cash-drawer" />;
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const defaultBranch = isSuperAdmin ? (activeBranchId || 'ALL') : (user.branchId || '');

  // Filter Form State
  const [selectedBranch, setSelectedBranch] = useState<string>(defaultBranch);
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedPreset, setSelectedPreset] = useState<DatePreset>('THIS_MONTH');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Applied Query State (triggers API fetch)
  const [appliedQuery, setAppliedQuery] = useState<CashDrawerReportQuery>({
    branchId: defaultBranch,
    status: 'ALL',
    preset: 'THIS_MONTH',
  });

  const [reportData, setReportData] = useState<CashDrawerReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch Report Data from Live Express Backend
  const fetchReport = useCallback(async (q: CashDrawerReportQuery) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await salonService.getCashDrawerReport(q);
      setReportData(data);
    } catch (err: any) {
      console.error('Failed to load Cash Drawer report:', err);
      setErrorMessage(err.message || 'Failed to fetch live cash drawer report from server.');
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
      status: selectedStatus,
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
      ['Report Name', 'Cash Drawer Custody, Sessions & Tender Collections'],
      ['Branch / Campus', reportData.meta.branchName || 'All Branches'],
      ['Reporting Window', `${reportData.meta.from.slice(0, 10)} to ${reportData.meta.to.slice(0, 10)}`],
      ['Date Basis', `${reportData.meta.dateBasis} (${reportData.meta.timezone})`],
      ['Total Physical Cash Collections', formatCurrency(reportData.tenderBreakdown.totalCash)],
      ['Total Online Collections', formatCurrency(reportData.tenderBreakdown.totalOnline)],
      ['Grand Total Collections', formatCurrency(reportData.tenderBreakdown.grandTotal)],
      ['Total Opening Float', formatCurrency(reportData.kpis.totalOpeningFloat)],
      ['Total Expected Cash', formatCurrency(reportData.kpis.totalExpectedCash)],
      ['Total Counted Cash', formatCurrency(reportData.kpis.totalCountedCash)],
      ['Total Cash Variance', formatCurrency(reportData.kpis.totalVariance)],
      ['Generated At', reportData.meta.generatedAt],
      ['Generated By', reportData.meta.generatedBy],
    ];
  }, [reportData]);

  // Export Headers
  const exportHeaders = useMemo(
    () => [
      'Session Code',
      'Date',
      'Cashier / Custodian',
      'Branch',
      'Status',
      'Opening Float (PKR)',
      'Cash Sales (PKR)',
      'Dues & Tips (PKR)',
      'Total Cash In (PKR)',
      'Cash Refunds (PKR)',
      'Cash Expenses (PKR)',
      'Settlement Out (PKR)',
      'Total Cash Out (PKR)',
      'Expected Cash (PKR)',
      'Counted Cash (PKR)',
      'Variance (PKR)',
      'Online Attributed (PKR)',
    ],
    []
  );

  const exportRows = useMemo(() => {
    if (!reportData?.rows) return [];
    return reportData.rows.map((r: CashDrawerReportRow) => [
      r.sessionCode,
      r.date,
      r.custodianName,
      r.branchName,
      r.status,
      r.openingFloat,
      r.cashSales,
      r.duesCollected + r.cashTips,
      r.totalCashIn,
      r.cashRefunds,
      r.cashExpenses,
      r.settlementsOut,
      r.totalCashOut,
      r.expectedCash,
      r.countedCash !== null ? r.countedCash : '-',
      r.variance,
      r.onlineTotal,
    ]);
  }, [reportData]);

  // Export Handlers
  const handleExportCsv = () => {
    if (!reportData || !reportData.rows.length) return;
    downloadReportCsv('cash_drawer_sessions_report', exportMeta, [
      { headers: exportHeaders, rows: exportRows },
    ]);
  };

  const handleExportExcel = () => {
    if (!reportData || !reportData.rows.length) return;
    downloadReportExcel('cash_drawer_sessions_report', exportMeta, [
      { title: 'Drawer Sessions', headers: exportHeaders, rows: exportRows },
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
      reportData.totals.openingFloat,
      reportData.totals.cashSales,
      '',
      reportData.totals.cashIn,
      reportData.totals.cashRefunds,
      reportData.totals.cashExpenses,
      reportData.totals.settlementsOut,
      reportData.totals.cashOut,
      reportData.totals.expectedCash,
      reportData.totals.countedCash,
      reportData.totals.variance,
      reportData.totals.onlineTotal,
    ];
    printReportWindow({
      title: 'Cash Drawer Custody, Sessions & Tender Collections',
      subtitle: `Branch: ${reportData.meta.branchName} · Window: ${reportData.meta.from.slice(0, 10)} to ${reportData.meta.to.slice(0, 10)}`,
      meta: exportMeta,
      headers: exportHeaders,
      rows: exportRows,
      totals: totalsRow,
    });
  };

  // Table Columns Definition
  const columns: ColumnDef<CashDrawerReportRow>[] = useMemo(
    () => [
      {
        key: 'sessionCode',
        header: 'Session Code',
        width: '120px',
        render: (row) => (
          <div>
            <span className="font-bold text-[#0047AB] font-mono text-xs block">{row.sessionCode}</span>
            <span className="text-[10px] text-slate-400 block">{row.date}</span>
          </div>
        ),
      },
      {
        key: 'custodianName',
        header: 'Cashier / Custodian',
        width: '150px',
        render: (row) => (
          <div>
            <span className="font-semibold text-slate-800 text-xs block truncate" title={row.custodianName}>
              {row.custodianName}
            </span>
            <span className="text-[10px] text-slate-400 block">{row.branchName}</span>
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        width: '110px',
        render: (row) => {
          if (row.status === 'SETTLED') {
            return (
              <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Settled
              </Badge>
            );
          }
          if (row.status === 'SETTLEMENT_PENDING') {
            return (
              <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold gap-1">
                <Clock className="w-3 h-3 text-amber-600" /> Pending Review
              </Badge>
            );
          }
          return (
            <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-semibold gap-1">
              <Unlock className="w-3 h-3 text-blue-600" /> Open
            </Badge>
          );
        },
      },
      {
        key: 'openingFloat',
        header: 'Opening Float',
        align: 'right',
        width: '120px',
        render: (row) => <span className="font-mono text-xs text-slate-700">{formatCurrency(row.openingFloat)}</span>,
      },
      {
        key: 'cashSales',
        header: 'Cash Sales',
        align: 'right',
        width: '120px',
        render: (row) => <span className="font-mono text-xs text-emerald-600 font-semibold">{formatCurrency(row.cashSales)}</span>,
      },
      {
        key: 'otherCashIn',
        header: 'Dues / Tips In',
        align: 'right',
        width: '120px',
        render: (row) => (
          <span className="font-mono text-xs text-emerald-700">
            {formatCurrency(row.duesCollected + row.cashTips + row.otherCashIn)}
          </span>
        ),
      },
      {
        key: 'totalCashIn',
        header: 'Total Cash In',
        align: 'right',
        width: '125px',
        render: (row) => (
          <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-50/50 px-1.5 py-0.5 rounded">
            +{formatCurrency(row.totalCashIn)}
          </span>
        ),
      },
      {
        key: 'cashRefunds',
        header: 'Cash Refunds',
        align: 'right',
        width: '115px',
        render: (row) => (
          <span className={`font-mono text-xs ${row.cashRefunds > 0 ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>
            {row.cashRefunds > 0 ? `-${formatCurrency(row.cashRefunds)}` : '0.00'}
          </span>
        ),
      },
      {
        key: 'cashExpenses',
        header: 'Cash Expenses',
        align: 'right',
        width: '115px',
        render: (row) => (
          <span className={`font-mono text-xs ${row.cashExpenses > 0 ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>
            {row.cashExpenses > 0 ? `-${formatCurrency(row.cashExpenses)}` : '0.00'}
          </span>
        ),
      },
      {
        key: 'settlementsOut',
        header: 'Settlement Out',
        align: 'right',
        width: '120px',
        render: (row) => (
          <span className={`font-mono text-xs ${row.settlementsOut > 0 ? 'text-indigo-600 font-semibold' : 'text-slate-400'}`}>
            {row.settlementsOut > 0 ? `-${formatCurrency(row.settlementsOut)}` : '0.00'}
          </span>
        ),
      },
      {
        key: 'expectedCash',
        header: 'Expected Cash',
        align: 'right',
        width: '125px',
        render: (row) => <span className="font-mono text-xs font-bold text-slate-800">{formatCurrency(row.expectedCash)}</span>,
      },
      {
        key: 'countedCash',
        header: 'Counted Cash',
        align: 'right',
        width: '125px',
        render: (row) => (
          <span className="font-mono text-xs text-slate-700">
            {row.countedCash !== null ? formatCurrency(row.countedCash) : <span className="text-slate-400 italic">Not Counted</span>}
          </span>
        ),
      },
      {
        key: 'variance',
        header: 'Variance',
        align: 'right',
        width: '115px',
        render: (row) => {
          if (row.countedCash === null) return <span className="text-slate-400 font-mono text-xs">-</span>;
          const isZero = Math.abs(row.variance) < 0.01;
          const isOver = row.variance > 0;
          return (
            <span
              className={`font-mono text-xs font-bold ${
                isZero ? 'text-slate-500' : isOver ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {isOver ? '+' : ''}
              {formatCurrency(row.variance)}
            </span>
          );
        },
      },
      {
        key: 'onlineTotal',
        header: 'Online Attributed',
        align: 'right',
        width: '135px',
        render: (row) => (
          <div>
            <span className="font-mono text-xs font-bold text-blue-600 block">
              {formatCurrency(row.onlineTotal)}
            </span>
            {row.onlineBreakdown.length > 0 && (
              <span className="text-[10px] text-slate-400 block truncate max-w-[130px]" title={row.onlineBreakdown.map((b) => `${b.accountName}: ${b.amount}`).join(', ')}>
                {row.onlineBreakdown.map((b) => `${b.accountName}: ${formatCurrency(b.amount)}`).join(', ')}
              </span>
            )}
          </div>
        ),
      },
      {
        key: 'movementCount',
        header: 'Tx Count',
        align: 'center',
        width: '80px',
        render: (row) => (
          <Badge variant="outline" className="font-mono text-[10px] text-slate-600">
            {row.movementCount}
          </Badge>
        ),
      },
    ],
    []
  );

  // Filter Form Controls
  const filterForm = (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 items-end">
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

      {/* Status Filter */}
      <div>
        <label className={filterLabel}>Session Status</label>
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className={`${selectField} w-full`}
        >
          <option value="ALL">All Statuses</option>
          <option value="OPEN">Open Drawers</option>
          <option value="SETTLEMENT_PENDING">Pending Settlement</option>
          <option value="SETTLED">Settled & Closed</option>
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
        <label className={filterLabel}>Search Session / User</label>
        <input
          type="text"
          placeholder="Filter code, cashier..."
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
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-2">
      {/* Sessions Count */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
          Sessions Logged
        </span>
        <span className="text-base font-bold text-slate-800 font-mono block">
          {reportData.kpis.totalSessions}
        </span>
        <span className="text-[10px] text-slate-400 mt-0.5 block">
          {reportData.kpis.openSessionsCount} Open · {reportData.kpis.settledSessionsCount} Settled
        </span>
      </div>

      {/* Opening Float */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
          Opening Float
        </span>
        <span className="text-base font-bold text-slate-800 font-mono block">
          {formatCurrency(reportData.kpis.totalOpeningFloat)}
        </span>
        <span className="text-[10px] text-slate-400 mt-0.5 block">Custody baseline</span>
      </div>

      {/* Cash Sales */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
            Cash Sales
          </span>
          <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-500" />
        </div>
        <span className="text-base font-bold text-emerald-600 font-mono block">
          +{formatCurrency(reportData.kpis.totalCashSales)}
        </span>
        <span className="text-[10px] text-emerald-600 mt-0.5 block">Direct POS Cash</span>
      </div>

      {/* Total Cash In */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
            Total Cash In
          </span>
          <Banknote className="w-3.5 h-3.5 text-emerald-600" />
        </div>
        <span className="text-base font-bold text-emerald-700 font-mono block">
          +{formatCurrency(reportData.kpis.totalCashIn)}
        </span>
        <span className="text-[10px] text-slate-400 mt-0.5 block">Sales + Tips + Dues</span>
      </div>

      {/* Total Cash Out */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
            Total Cash Out
          </span>
          <ArrowUpRight className="w-3.5 h-3.5 text-rose-500" />
        </div>
        <span className="text-base font-bold text-rose-600 font-mono block">
          -{formatCurrency(reportData.kpis.totalCashOut)}
        </span>
        <span className="text-[10px] text-rose-600 mt-0.5 block">Refunds, Exp & Settl</span>
      </div>

      {/* Expected Cash */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
          Expected Cash
        </span>
        <span className="text-base font-bold text-slate-900 font-mono block">
          {formatCurrency(reportData.kpis.totalExpectedCash)}
        </span>
        <span className="text-[10px] text-slate-400 mt-0.5 block">System Computed</span>
      </div>

      {/* Counted Cash */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
          Counted Cash
        </span>
        <span className="text-base font-bold text-slate-800 font-mono block">
          {formatCurrency(reportData.kpis.totalCountedCash)}
        </span>
        <span className="text-[10px] text-slate-400 mt-0.5 block">Physical Verification</span>
      </div>

      {/* Variance */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
            Net Variance
          </span>
          <Scale className="w-3.5 h-3.5 text-slate-400" />
        </div>
        <span
          className={`text-base font-bold font-mono block ${
            Math.abs(reportData.kpis.totalVariance) < 0.01
              ? 'text-slate-700'
              : reportData.kpis.totalVariance > 0
              ? 'text-emerald-600'
              : 'text-rose-600'
          }`}
        >
          {reportData.kpis.totalVariance > 0 ? '+' : ''}
          {formatCurrency(reportData.kpis.totalVariance)}
        </span>
        <span className="text-[10px] text-slate-400 mt-0.5 block">Counted - Expected</span>
      </div>
    </div>
  ) : null;

  return (
    <ReportShell
      title="Cash Drawer Logs & Tender Breakdown"
      description="Physical cash drawer custody, cashier shift balance logs, and comprehensive cash vs online accounts breakdown."
      icon={Banknote}
      bannerTitle="Cash Drawer Custody, Sessions & Tender Collections"
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

      {/* LANDSCAPE TABLE */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        <ReportTable
          columns={columns}
          data={reportData?.rows || []}
          loading={isLoading}
          emptyMessage="No cash drawer sessions found for the selected filter range."
        />
      </div>
    </ReportShell>
  );
};
