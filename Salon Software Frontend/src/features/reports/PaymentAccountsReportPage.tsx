import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { salonService } from '@/services';
import {
  PaymentAccountsReport,
  PaymentAccountMovementRow,
  PaymentAccountsReportQuery,
  PaymentAccountSummaryItem,
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
  CreditCard,
  Building2,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  Info,
} from 'lucide-react';

const selectField = 'text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-hidden focus:ring-1 focus:ring-[#0047AB] h-8';
const inputField = 'text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-hidden focus:ring-1 focus:ring-[#0047AB] h-8';
const filterLabel = 'block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1';

export const PaymentAccountsReportPage: React.FC = () => {
  const { user, activeBranchId, allBranches } = useAuth();

  // Role guard: Super Admin, Admin, and Accountant
  if (!user || user.role === 'STAFF') {
    return <AccessDeniedView attemptedPath="/reports/payment-accounts" />;
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const defaultBranch = isSuperAdmin ? (activeBranchId || 'ALL') : (user.branchId || '');

  // Filter Form State
  const [selectedBranch, setSelectedBranch] = useState<string>(defaultBranch);
  const [selectedAccount, setSelectedAccount] = useState<string>('ALL');
  const [selectedPreset, setSelectedPreset] = useState<DatePreset>('THIS_MONTH');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedDirection, setSelectedDirection] = useState<string>('ALL');
  const [selectedSourceModule, setSelectedSourceModule] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Applied Query State (triggers API fetch)
  const [appliedQuery, setAppliedQuery] = useState<PaymentAccountsReportQuery>({
    branchId: defaultBranch,
    preset: 'THIS_MONTH',
    accountId: 'ALL',
    transactionType: 'ALL',
    direction: 'ALL',
    sourceModule: 'ALL',
    search: '',
  });

  // Report Data State
  const [reportData, setReportData] = useState<PaymentAccountsReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch report data from live backend API (100% Real DB)
  const fetchReport = useCallback(async (q: PaymentAccountsReportQuery) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await salonService.getPaymentAccountsReport(q);
      setReportData(data);
    } catch (err: any) {
      console.error('Failed to load Payment Accounts report:', err);
      setErrorMessage(err.message || 'Failed to fetch live payment accounts report from server.');
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
      accountId: selectedAccount,
      preset: selectedPreset,
      startDate: selectedPreset === 'CUSTOM' ? customFrom : undefined,
      endDate: selectedPreset === 'CUSTOM' ? customTo : undefined,
      from: selectedPreset === 'CUSTOM' ? customFrom : undefined,
      to: selectedPreset === 'CUSTOM' ? customTo : undefined,
      transactionType: selectedType,
      direction: selectedDirection,
      sourceModule: selectedSourceModule,
      search: searchQuery.trim(),
    });
  };

  // Export Metadata
  const exportMeta: [string, string][] = useMemo(() => {
    if (!reportData) return [];
    return [
      ['Report Name', 'Payment Accounts Ledger & Movement Register'],
      ['Branch / Campus', reportData.meta.branchName || 'All Branches'],
      ['Reporting Window', `${reportData.meta.from.slice(0, 10)} to ${reportData.meta.to.slice(0, 10)}`],
      ['Date Basis', `${reportData.meta.dateBasis} (${reportData.meta.timezone})`],
      ['Total Opening Balance', formatCurrency(reportData.kpis.totalOpeningBalance)],
      ['Total Money In', formatCurrency(reportData.kpis.totalMoneyIn)],
      ['Total Money Out', formatCurrency(reportData.kpis.totalMoneyOut)],
      ['Transfers In', formatCurrency(reportData.kpis.totalTransfersIn)],
      ['Transfers Out', formatCurrency(reportData.kpis.totalTransfersOut)],
      ['Total Closing Balance', formatCurrency(reportData.kpis.totalClosingBalance)],
      ['Net Period Movement', formatCurrency(reportData.kpis.netMovement)],
      ['Generated At', reportData.meta.generatedAt],
      ['Generated By', reportData.meta.generatedBy],
    ];
  }, [reportData]);

  // Export headers and rows
  const exportHeaders = useMemo(() => [
    'Date',
    'Time',
    'Account Name',
    'Account Type',
    'Provider / Bank',
    'Flow Direction',
    'Transaction Type',
    'Reference #',
    'Source Module',
    'Narrative Description',
    'Handled By',
    'Money In (PKR)',
    'Money Out (PKR)',
    'Transfer (PKR)',
    'Running Balance (PKR)',
  ], []);

  const exportRows = useMemo(() => {
    if (!reportData?.rows) return [];
    return reportData.rows.map((r: PaymentAccountMovementRow) => [
      r.date,
      r.time,
      r.accountName,
      r.accountType,
      r.providerName || '',
      r.direction,
      r.type,
      r.reference || '',
      r.sourceModule,
      r.description || '',
      r.userName || '',
      r.moneyIn,
      r.moneyOut,
      r.transfer,
      r.runningBalance,
    ]);
  }, [reportData]);

  // Export Handlers
  const handleExportCsv = () => {
    if (!reportData || !reportData.rows.length) return;
    downloadReportCsv('payment_accounts_ledger', exportMeta, [
      { headers: exportHeaders, rows: exportRows },
    ]);
  };

  const handleExportExcel = () => {
    if (!reportData || !reportData.rows.length) return;
    downloadReportExcel('payment_accounts_ledger', exportMeta, [
      { title: 'Ledger', headers: exportHeaders, rows: exportRows },
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
      '',
      reportData.kpis.totalMoneyIn,
      reportData.kpis.totalMoneyOut,
      reportData.kpis.totalTransfersIn - reportData.kpis.totalTransfersOut,
      reportData.kpis.totalClosingBalance,
    ];
    printReportWindow({
      title: 'Payment Accounts Ledger & Movement Register',
      subtitle: `Branch: ${reportData.meta.branchName} · Window: ${reportData.meta.from.slice(0, 10)} to ${reportData.meta.to.slice(0, 10)}`,
      meta: exportMeta,
      headers: exportHeaders,
      rows: exportRows,
      totals: totalsRow,
    });
  };

  // Table Columns Definition
  const columns: ColumnDef<PaymentAccountMovementRow>[] = useMemo(() => [
    {
      key: 'date',
      header: 'Date & Time',
      width: '120px',
      render: (row) => (
        <div>
          <span className="font-semibold text-slate-800 text-xs block">{row.date}</span>
          <span className="text-[10px] text-slate-400 block">{row.time}</span>
        </div>
      ),
    },
    {
      key: 'accountName',
      header: 'Payment Account',
      width: '180px',
      render: (row) => (
        <div>
          <span className="font-medium text-slate-900 text-xs block">{row.accountName}</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
              {row.accountType}
            </span>
            {row.providerName && (
              <span className="text-[10px] text-slate-500 truncate max-w-[100px]">
                {row.providerName}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'direction',
      header: 'Direction',
      width: '90px',
      align: 'center',
      render: (row) => (
        <Badge
          variant="outline"
          className={`text-[10px] font-bold px-2 py-0.5 uppercase ${
            row.direction === 'IN'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-rose-50 text-rose-700 border-rose-200'
          }`}
        >
          {row.direction === 'IN' ? '↓ IN' : '↑ OUT'}
        </Badge>
      ),
    },
    {
      key: 'type',
      header: 'Tx Type',
      width: '110px',
      render: (row) => (
        <span className="text-xs font-medium text-slate-700">
          {row.type.replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      key: 'reference',
      header: 'Reference #',
      width: '130px',
      render: (row) => (
        <span className="font-mono text-xs font-semibold text-[#0047AB]">
          {row.reference || '-'}
        </span>
      ),
    },
    {
      key: 'sourceModule',
      header: 'Source Module',
      width: '130px',
      render: (row) => (
        <span className="text-[11px] text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
          {row.sourceModule.replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Narrative Description',
      width: '240px',
      render: (row) => (
        <span className="text-xs text-slate-600 block truncate max-w-[240px]" title={row.description}>
          {row.description || '-'}
        </span>
      ),
    },
    {
      key: 'userName',
      header: 'Handled By',
      width: '110px',
      render: (row) => (
        <span className="text-xs text-slate-600">{row.userName || 'System'}</span>
      ),
    },
    {
      key: 'moneyIn',
      header: 'Money In (PKR)',
      width: '120px',
      align: 'right',
      render: (row) => (
        <span className={`text-xs font-semibold font-mono ${row.moneyIn > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
          {row.moneyIn > 0 ? `+${formatCurrency(row.moneyIn)}` : '-'}
        </span>
      ),
    },
    {
      key: 'moneyOut',
      header: 'Money Out (PKR)',
      width: '120px',
      align: 'right',
      render: (row) => (
        <span className={`text-xs font-semibold font-mono ${row.moneyOut > 0 ? 'text-rose-600' : 'text-slate-300'}`}>
          {row.moneyOut > 0 ? `-${formatCurrency(row.moneyOut)}` : '-'}
        </span>
      ),
    },
    {
      key: 'transfer',
      header: 'Transfer (PKR)',
      width: '120px',
      align: 'right',
      render: (row) => (
        <span className={`text-xs font-semibold font-mono ${row.transfer !== 0 ? 'text-blue-600' : 'text-slate-300'}`}>
          {row.transfer !== 0 ? (row.transfer > 0 ? `+${formatCurrency(row.transfer)}` : `-${formatCurrency(Math.abs(row.transfer))}`) : '-'}
        </span>
      ),
    },
    {
      key: 'runningBalance',
      header: 'Running Balance',
      width: '140px',
      align: 'right',
      render: (row) => (
        <span className={`text-xs font-bold font-mono ${row.runningBalance >= 0 ? 'text-[#0047AB]' : 'text-rose-600'}`}>
          {formatCurrency(row.runningBalance)}
        </span>
      ),
    },
  ], []);

  // Distinct account list for filter dropdown
  const accountOptions = useMemo(() => {
    if (!reportData?.accountsSummary) return [];
    return reportData.accountsSummary;
  }, [reportData]);

  // Filter Children Component
  const filterForm = (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 w-full">
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

      {/* Account Filter */}
      <div>
        <label className={filterLabel}>Payment Account</label>
        <select
          value={selectedAccount}
          onChange={(e) => setSelectedAccount(e.target.value)}
          className={`${selectField} w-full`}
        >
          <option value="ALL">All Accounts</option>
          {accountOptions.map((acc: PaymentAccountSummaryItem) => (
            <option key={acc.accountId} value={acc.accountId}>
              {acc.accountName} ({acc.accountType})
            </option>
          ))}
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

      {/* Direction Filter */}
      <div>
        <label className={filterLabel}>Flow Direction</label>
        <select
          value={selectedDirection}
          onChange={(e) => setSelectedDirection(e.target.value)}
          className={`${selectField} w-full`}
        >
          <option value="ALL">All Flows</option>
          <option value="IN">Money In (Inflow)</option>
          <option value="OUT">Money Out (Outflow)</option>
        </select>
      </div>

      {/* Transaction Type */}
      <div>
        <label className={filterLabel}>Tx Type</label>
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className={`${selectField} w-full`}
        >
          <option value="ALL">All Types</option>
          <option value="PAYMENT">Invoice Payment</option>
          <option value="EXPENSE">Expense Disbursement</option>
          <option value="TRANSFER">Account Transfer</option>
          <option value="REFUND">Customer Refund</option>
          <option value="PETTY_CASH">Petty Cash In/Out</option>
          <option value="PAYROLL">Payroll Salary</option>
        </select>
      </div>

      {/* Search Input */}
      <div>
        <label className={filterLabel}>Search Term</label>
        <input
          type="text"
          placeholder="Ref #, desc, user..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={`${inputField} w-full`}
        />
      </div>

      {/* Custom Date Inputs if CUSTOM selected */}
      {selectedPreset === 'CUSTOM' && (
        <div className="col-span-full grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
          <div>
            <label className={filterLabel}>Custom From Date</label>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className={`${inputField} w-full`}
            />
          </div>
          <div>
            <label className={filterLabel}>Custom To Date</label>
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
      {/* Total Opening Balance */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
          Opening Balance
        </span>
        <span className="text-base font-bold text-slate-800 font-mono block">
          {formatCurrency(reportData.kpis.totalOpeningBalance)}
        </span>
        <span className="text-[10px] text-slate-400 mt-0.5 block">Pre-period position</span>
      </div>

      {/* Money In */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
            Total Money In
          </span>
          <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-500" />
        </div>
        <span className="text-base font-bold text-emerald-600 font-mono block">
          +{formatCurrency(reportData.kpis.totalMoneyIn)}
        </span>
        <span className="text-[10px] text-emerald-600 mt-0.5 block">Direct Inflows</span>
      </div>

      {/* Money Out */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
            Total Money Out
          </span>
          <ArrowUpRight className="w-3.5 h-3.5 text-rose-500" />
        </div>
        <span className="text-base font-bold text-rose-600 font-mono block">
          -{formatCurrency(reportData.kpis.totalMoneyOut)}
        </span>
        <span className="text-[10px] text-rose-600 mt-0.5 block">Disbursements & Expenses</span>
      </div>

      {/* Transfers In */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
            Transfers In
          </span>
          <ArrowLeftRight className="w-3.5 h-3.5 text-blue-500" />
        </div>
        <span className="text-base font-bold text-blue-600 font-mono block">
          +{formatCurrency(reportData.kpis.totalTransfersIn)}
        </span>
        <span className="text-[10px] text-slate-400 mt-0.5 block">Internal Received</span>
      </div>

      {/* Transfers Out */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
            Transfers Out
          </span>
          <ArrowLeftRight className="w-3.5 h-3.5 text-slate-400" />
        </div>
        <span className="text-base font-bold text-slate-600 font-mono block">
          -{formatCurrency(reportData.kpis.totalTransfersOut)}
        </span>
        <span className="text-[10px] text-slate-400 mt-0.5 block">Internal Sent</span>
      </div>

      {/* Net Period Movement */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
            Net Movement
          </span>
          {reportData.kpis.netMovement >= 0 ? (
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
          )}
        </div>
        <span
          className={`text-base font-bold font-mono block ${
            reportData.kpis.netMovement >= 0 ? 'text-emerald-600' : 'text-rose-600'
          }`}
        >
          {reportData.kpis.netMovement >= 0 ? '+' : ''}
          {formatCurrency(reportData.kpis.netMovement)}
        </span>
        <span className="text-[10px] text-slate-400 mt-0.5 block">Δ Inflows - Outflows</span>
      </div>

      {/* Total Closing Balance */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
        <span className="text-[10px] font-semibold text-[#0047AB] uppercase tracking-wide block mb-1">
          Closing Balance
        </span>
        <span className="text-base font-bold text-[#0047AB] font-mono block">
          {formatCurrency(reportData.kpis.totalClosingBalance)}
        </span>
        <span className="text-[10px] text-slate-500 mt-0.5 block font-medium">
          Portfolio Position
        </span>
      </div>
    </div>
  ) : null;

  return (
    <ReportShell
      title="Payment Accounts Ledger"
      description="Complete chronological audit register of bank accounts, mobile wallets, and digital tender movements."
      icon={CreditCard}
      bannerTitle="Payment Accounts Ledger & Movement Register"
      metaNotice={
        reportData ? (
          <div className="flex flex-wrap items-center gap-2">
            <span>Branch: <strong className="text-slate-800">{reportData.meta.branchName || 'All'}</strong></span>
            <span>·</span>
            <span>Window: <strong className="text-slate-800">{reportData.meta.from.slice(0, 10)} to {reportData.meta.to.slice(0, 10)}</strong></span>
            <span>·</span>
            <span>Timezone: <strong className="text-slate-800">{reportData.meta.timezone}</strong></span>
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

      {/* ACCOUNTS SUMMARY CARDS */}
      {reportData && reportData.accountsSummary && reportData.accountsSummary.length > 0 && (
        <div className="mb-4 bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#0047AB]" />
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                Individual Account Portfolio Breakdown
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              {reportData.accountsSummary.length} Active Accounts
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {reportData.accountsSummary.map((acc: PaymentAccountSummaryItem) => (
              <div
                key={acc.accountId}
                className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-xs text-slate-800 truncate" title={acc.accountName}>
                      {acc.accountName}
                    </span>
                    <Badge variant="outline" className="text-[9px] font-mono uppercase px-1.5 py-0 bg-white">
                      {acc.accountType}
                    </Badge>
                  </div>
                  {acc.accountIdentifier && (
                    <div className="text-[10px] font-mono text-slate-500 mb-2 truncate">
                      {acc.accountIdentifier}
                    </div>
                  )}
                </div>

                <div className="space-y-1 text-[11px] pt-2 border-t border-slate-200/60">
                  <div className="flex justify-between text-slate-500">
                    <span>Opening:</span>
                    <span className="font-mono text-slate-700">{formatCurrency(acc.openingBalance)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-600">
                    <span>Inflows:</span>
                    <span className="font-mono">+{formatCurrency(acc.moneyIn + acc.transfersIn)}</span>
                  </div>
                  <div className="flex justify-between text-rose-600">
                    <span>Outflows:</span>
                    <span className="font-mono">-{formatCurrency(acc.moneyOut + acc.transfersOut)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-900 pt-1 border-t border-dashed border-slate-200">
                    <span>Closing:</span>
                    <span className="font-mono text-[#0047AB]">{formatCurrency(acc.closingBalance)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DYNAMIC LANDSCAPE TABLE */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        <ReportTable
          columns={columns}
          data={reportData?.rows || []}
          loading={isLoading}
          emptyMessage="No payment account transactions recorded for the selected filter range."
        />

        {/* Footer Summary Bar */}
        {reportData && reportData.rows.length > 0 && (
          <div className="bg-slate-50 border-t border-slate-200 px-4 py-3 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-600 gap-2 font-mono">
            <div>
              <span>Showing </span>
              <strong className="text-slate-900">{reportData.rows.length}</strong>
              <span> ledger entries from </span>
              <strong>{reportData.meta.from.slice(0, 10)}</strong>
              <span> to </span>
              <strong>{reportData.meta.to.slice(0, 10)}</strong>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <div>
                Inflows: <strong className="text-emerald-600">+{formatCurrency(reportData.kpis.totalMoneyIn)}</strong>
              </div>
              <div>
                Outflows: <strong className="text-rose-600">-{formatCurrency(reportData.kpis.totalMoneyOut)}</strong>
              </div>
              <div>
                Closing Total: <strong className="text-[#0047AB]">{formatCurrency(reportData.kpis.totalClosingBalance)}</strong>
              </div>
            </div>
          </div>
        )}
      </div>
    </ReportShell>
  );
};
