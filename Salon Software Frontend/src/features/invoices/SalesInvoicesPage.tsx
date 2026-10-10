import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { salonService } from '@/services';
import {
  Invoice,
  Branch,
  InvoiceStatus,
  InvoiceLifecycle,
  SalesInvoicesReport,
  SalesInvoiceReportRow,
  SalesInvoicesReportQuery,
} from '@/types/salon';
import { AccessDeniedView } from '@/features/scaffold/AccessDeniedView';
import { ReceiptModal } from '@/features/pos/ReceiptModal';
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
  Eye,
  RotateCcw,
  Banknote,
  Smartphone,
  CreditCard,
} from 'lucide-react';

const selectField = 'text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-hidden focus:ring-1 focus:ring-[#0047AB] h-8';
const inputField = 'text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-hidden focus:ring-1 focus:ring-[#0047AB] h-8';
const filterLabel = 'block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1';

export const SalesInvoicesPage: React.FC = () => {
  const { user, activeBranchId, allBranches, demoDate } = useAuth();

  // Role guard: Super Admin, Admin, and Accountant
  if (!user || user.role === 'STAFF') {
    return <AccessDeniedView attemptedPath="/reports/sales-invoices" />;
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const defaultBranch = isSuperAdmin ? (activeBranchId || 'ALL') : (user.branchId || '');

  // Filter Form State
  const [selectedBranch, setSelectedBranch] = useState<string>(defaultBranch);
  const [selectedPreset, setSelectedPreset] = useState<DatePreset>('THIS_MONTH');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [paymentStatus, setPaymentStatus] = useState<string>('ALL');
  const [lifecycle, setLifecycle] = useState<string>('ALL');
  const [paymentMethod, setPaymentMethod] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Applied Query State (triggers API fetch)
  const [appliedQuery, setAppliedQuery] = useState<SalesInvoicesReportQuery>({
    branchId: defaultBranch,
    preset: 'THIS_MONTH',
    paymentStatus: 'ALL',
    lifecycle: 'ALL',
    paymentMethod: 'ALL',
    search: '',
  });

  // Report Data State
  const [reportData, setReportData] = useState<SalesInvoicesReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Receipt Modal State
  const [receiptInvoice, setReceiptInvoice] = useState<Invoice | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState<boolean>(false);
  const [isLoadingReceipt, setIsLoadingReceipt] = useState<boolean>(false);

  // Fetch report data from live backend API (100% Real DB)
  const fetchReport = useCallback(async (q: SalesInvoicesReportQuery) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await salonService.getSalesInvoicesReport(q);
      setReportData(data);
    } catch (err: any) {
      console.error('Failed to load Sales & Invoices report:', err);
      setErrorMessage(err.message || 'Failed to fetch live sales & invoices report from server.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport(appliedQuery);
  }, [appliedQuery, fetchReport]);

  // Handle Filter Submit
  const handleFilterSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAppliedQuery({
      branchId: selectedBranch,
      preset: selectedPreset,
      from: selectedPreset === 'CUSTOM' ? customFrom : undefined,
      to: selectedPreset === 'CUSTOM' ? customTo : undefined,
      paymentStatus: (paymentStatus as any) || 'ALL',
      lifecycle: (lifecycle as any) || 'ALL',
      paymentMethod: paymentMethod === 'ALL' ? undefined : paymentMethod,
      search: searchQuery.trim() || undefined,
    });
  };

  // Handle Reset Filters
  const handleResetFilters = () => {
    setSelectedBranch(defaultBranch);
    setSelectedPreset('THIS_MONTH');
    setCustomFrom('');
    setCustomTo('');
    setPaymentStatus('ALL');
    setLifecycle('ALL');
    setPaymentMethod('ALL');
    setSearchQuery('');
    setAppliedQuery({
      branchId: defaultBranch,
      preset: 'THIS_MONTH',
      paymentStatus: 'ALL',
      lifecycle: 'ALL',
      paymentMethod: 'ALL',
      search: '',
    });
  };

  // Open Receipt Modal
  const handleOpenReceipt = async (invoiceId: string) => {
    setIsLoadingReceipt(true);
    try {
      const fullInvoice = await salonService.getInvoice(invoiceId);
      if (fullInvoice) {
        setReceiptInvoice(fullInvoice);
        setIsReceiptOpen(true);
      }
    } catch (err) {
      console.error('Failed to load invoice receipt details:', err);
    } finally {
      setIsLoadingReceipt(false);
    }
  };

  // Export handlers
  const exportMeta: [string, string][] = useMemo(() => {
    const meta = reportData?.meta;
    return [
      ['Report', 'Sales & Invoices Register'],
      ['Branch', meta?.branchName || 'All Branches'],
      ['Date Range', `${meta?.from || ''} to ${meta?.to || ''}`],
      ['Date Basis', meta?.dateBasis || 'INVOICE_POSTING'],
      ['Timezone', meta?.timezone || 'Asia/Karachi'],
      ['Generated By', meta?.generatedBy || user?.name || 'User'],
      ['Generated At', meta?.generatedAt || new Date().toISOString()],
    ];
  }, [reportData, user]);

  const exportHeaders = [
    'Invoice #',
    'Date',
    'Time',
    'Customer',
    'Phone',
    'Branch',
    'Sold By',
    'Staff',
    'Items Summary',
    'Gross (PKR)',
    'Discount (PKR)',
    'Net Sales (PKR)',
    'Tax Charged (PKR)',
    'Tax Reversed (PKR)',
    'Net Tax (PKR)',
    'Tip (PKR)',
    'Total (PKR)',
    'Paid (PKR)',
    'Refunded (PKR)',
    'Outstanding (PKR)',
    'Payment Status',
    'Lifecycle',
  ];

  const exportRows = useMemo(() => {
    if (!reportData?.rows) return [];
    return reportData.rows.map((r) => [
      r.invoiceNumber,
      r.date,
      r.time,
      r.clientName,
      r.clientPhone,
      r.branchName,
      r.soldByName,
      r.staffSummary,
      r.linesSummary,
      r.gross,
      r.discount,
      r.netSales,
      r.taxCharged,
      r.taxReversed,
      r.netTaxLiability,
      r.tip,
      r.total,
      r.paid,
      r.refunded,
      r.outstanding,
      r.paymentStatus,
      r.lifecycle,
    ]);
  }, [reportData]);

  const handleExportCsv = () => {
    downloadReportCsv('sales_invoices_report', exportMeta, [
      { headers: exportHeaders, rows: exportRows },
    ]);
  };

  const handleExportExcel = () => {
    downloadReportExcel('sales_invoices_report', exportMeta, [
      { headers: exportHeaders, rows: exportRows },
    ]);
  };

  const handleExportPrint = () => {
    const totals = reportData?.totals;
    const totalsRow = totals
      ? [
          'TOTAL',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          totals.gross,
          totals.discount,
          totals.netSales,
          totals.taxCharged,
          totals.taxReversed,
          totals.netTaxLiability,
          totals.tip,
          totals.total,
          totals.paid,
          totals.refunded,
          totals.outstanding,
          '',
          '',
        ]
      : undefined;

    printReportWindow({
      title: 'Sales & Invoices Register',
      subtitle: `Branch: ${reportData?.meta.branchName || 'All'} · Range: ${reportData?.meta.from} to ${reportData?.meta.to}`,
      meta: exportMeta,
      headers: exportHeaders,
      rows: exportRows,
      totals: totalsRow,
    });
  };

  // Define Columns for Landscape ReportTable
  const columns: ColumnDef<SalesInvoiceReportRow>[] = [
    {
      key: 'invoiceNumber',
      header: 'Invoice #',
      align: 'left',
      width: '130px',
      render: (r) => (
        <button
          type="button"
          onClick={() => handleOpenReceipt(r.id)}
          className="font-bold text-[#0047AB] hover:text-[#003075] hover:underline cursor-pointer flex items-center gap-1"
          title="Click to view invoice details & receipt"
        >
          <span>{r.invoiceNumber}</span>
          <Eye className="w-3 h-3 text-slate-400" />
        </button>
      ),
    },
    {
      key: 'date',
      header: 'Date & Time',
      align: 'left',
      width: '110px',
      render: (r) => (
        <div>
          <span className="font-medium text-slate-800">{r.date}</span>
          <span className="text-[10px] text-slate-400 block">{r.time}</span>
        </div>
      ),
    },
    {
      key: 'clientName',
      header: 'Customer',
      align: 'left',
      width: '150px',
      render: (r) => (
        <div>
          <span className="font-semibold text-slate-900 block truncate max-w-[140px]">{r.clientName}</span>
          <span className="text-[10px] text-slate-500">{r.clientPhone}</span>
        </div>
      ),
    },
    {
      key: 'branchName',
      header: 'Branch',
      align: 'left',
      width: '120px',
      render: (r) => <span className="text-slate-700">{r.branchName}</span>,
    },
    {
      key: 'linesSummary',
      header: 'Items & Services',
      align: 'left',
      width: '180px',
      render: (r) => (
        <span className="text-slate-600 truncate block max-w-[170px]" title={r.linesSummary}>
          {r.linesSummary}
        </span>
      ),
    },
    {
      key: 'staffSummary',
      header: 'Stylists',
      align: 'left',
      width: '140px',
      render: (r) => (
        <span className="text-slate-600 truncate block max-w-[130px]" title={r.staffSummary}>
          {r.staffSummary}
        </span>
      ),
    },
    {
      key: 'gross',
      header: 'Gross (PKR)',
      align: 'right',
      render: (r) => formatCurrency(r.gross),
    },
    {
      key: 'discount',
      header: 'Discount (PKR)',
      align: 'right',
      render: (r) => (r.discount > 0 ? <span className="text-amber-600">-{formatCurrency(r.discount)}</span> : '0.00'),
    },
    {
      key: 'netSales',
      header: 'Net Sales (PKR)',
      align: 'right',
      render: (r) => <span className="font-bold text-slate-900">{formatCurrency(r.netSales)}</span>,
    },
    {
      key: 'taxCharged',
      header: 'Tax',
      align: 'right',
      render: (r) => formatCurrency(r.taxCharged),
    },
    {
      key: 'tip',
      header: 'Tip',
      align: 'right',
      render: (r) => (r.tip > 0 ? <span className="text-blue-600 font-medium">{formatCurrency(r.tip)}</span> : '0.00'),
    },
    {
      key: 'total',
      header: 'Total (PKR)',
      align: 'right',
      render: (r) => <span className="font-bold text-slate-900">{formatCurrency(r.total)}</span>,
    },
    {
      key: 'paid',
      header: 'Paid (PKR)',
      align: 'right',
      render: (r) => <span className="text-emerald-700 font-medium">{formatCurrency(r.paid)}</span>,
    },
    {
      key: 'outstanding',
      header: 'Due (PKR)',
      align: 'right',
      render: (r) => (
        <span className={r.outstanding > 0 ? 'font-bold text-rose-600' : 'text-slate-400'}>
          {formatCurrency(r.outstanding)}
        </span>
      ),
    },
    {
      key: 'paymentStatus',
      header: 'Pay Status',
      align: 'center',
      width: '90px',
      render: (r) => {
        if (r.paymentStatus === 'PAID') {
          return <Badge variant="success" className="text-[10px] px-1.5 py-0.5">PAID</Badge>;
        }
        if (r.paymentStatus === 'PARTIAL') {
          return <Badge variant="warning" className="text-[10px] px-1.5 py-0.5">PARTIAL</Badge>;
        }
        return <Badge variant="danger" className="text-[10px] px-1.5 py-0.5">UNPAID</Badge>;
      },
    },
    {
      key: 'lifecycle',
      header: 'Lifecycle',
      align: 'center',
      width: '110px',
      render: (r) => {
        if (r.lifecycle === 'ACTIVE') {
          return <Badge variant="neutral" className="text-[10px] bg-blue-50 text-[#0047AB] border-blue-200">ACTIVE</Badge>;
        }
        if (r.lifecycle === 'PARTIALLY_REFUNDED') {
          return <Badge variant="warning" className="text-[10px]">PARTIAL REFUND</Badge>;
        }
        if (r.lifecycle === 'REFUNDED') {
          return <Badge variant="danger" className="text-[10px]">REFUNDED</Badge>;
        }
        return <Badge variant="danger" className="text-[10px] bg-rose-100 text-rose-800">VOIDED</Badge>;
      },
    },
    {
      key: 'id',
      header: 'Action',
      align: 'center',
      width: '70px',
      render: (r) => (
        <button
          type="button"
          onClick={() => handleOpenReceipt(r.id)}
          className="p-1 text-slate-500 hover:text-[#0047AB] hover:bg-blue-50 rounded transition-colors cursor-pointer"
          title="Print POS Receipt"
        >
          <Receipt className="w-3.5 h-3.5" />
        </button>
      ),
    },
  ];

  // Render Totals Footer
  const renderTotalsFooter = () => {
    const t = reportData?.totals;
    if (!t) return null;

    return (
      <tr className="bg-slate-100/90 text-slate-900 font-bold border-t-2 border-slate-300">
        <td className="py-2.5 px-3 text-center border-r border-slate-200">Σ</td>
        <td colSpan={5} className="py-2.5 px-3 text-left border-r border-slate-200 text-xs">
          SUMMARY TOTALS ({reportData.rows.length} Invoices)
        </td>
        <td className="py-2.5 px-3 text-right border-r border-slate-200">{formatCurrency(t.gross)}</td>
        <td className="py-2.5 px-3 text-right border-r border-slate-200 text-amber-600">
          {t.discount > 0 ? `-${formatCurrency(t.discount)}` : '0.00'}
        </td>
        <td className="py-2.5 px-3 text-right border-r border-slate-200 text-[#0047AB]">{formatCurrency(t.netSales)}</td>
        <td className="py-2.5 px-3 text-right border-r border-slate-200">{formatCurrency(t.taxCharged)}</td>
        <td className="py-2.5 px-3 text-right border-r border-slate-200">{formatCurrency(t.tip)}</td>
        <td className="py-2.5 px-3 text-right border-r border-slate-200">{formatCurrency(t.total)}</td>
        <td className="py-2.5 px-3 text-right border-r border-slate-200 text-emerald-700">{formatCurrency(t.paid)}</td>
        <td className="py-2.5 px-3 text-right border-r border-slate-200 text-rose-600">{formatCurrency(t.outstanding)}</td>
        <td colSpan={3} className="py-2.5 px-3 text-center text-slate-400">—</td>
      </tr>
    );
  };

  // KPI Summary Cards
  const kpis = reportData?.kpis;
  const kpiCards = kpis ? (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block">Total Invoices</span>
        <span className="text-lg font-bold text-slate-900 mt-1 block">{kpis.totalInvoices}</span>
        <span className="text-[10px] text-slate-400">Active: {kpis.activeCount}</span>
      </div>

      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block">Gross Sales</span>
        <span className="text-lg font-bold text-slate-900 mt-1 block">{formatCurrency(kpis.grossSales)}</span>
        <span className="text-[10px] text-amber-600">Disc: -{formatCurrency(kpis.totalDiscounts)}</span>
      </div>

      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block">Net Sales</span>
        <span className="text-lg font-bold text-emerald-600 mt-1 block">{formatCurrency(kpis.netSales)}</span>
        <span className="text-[10px] text-slate-400">Excl. tax & tips</span>
      </div>

      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block">Tax Liability</span>
        <span className="text-lg font-bold text-slate-900 mt-1 block">{formatCurrency(kpis.netTaxLiability)}</span>
        <span className="text-[10px] text-slate-400">Charged: {formatCurrency(kpis.taxCharged)}</span>
      </div>

      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block">Paid Total</span>
        <span className="text-lg font-bold text-emerald-700 mt-1 block">{formatCurrency(kpis.totalPaid)}</span>
        <span className="text-[10px] text-slate-400">Billed: {formatCurrency(kpis.invoiceTotal)}</span>
      </div>

      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block">Customer Due</span>
        <span className="text-lg font-bold text-rose-600 mt-1 block">{formatCurrency(kpis.totalOutstanding)}</span>
        <span className="text-[10px] text-slate-400">Refunds: {formatCurrency(kpis.totalRefunded)}</span>
      </div>
    </div>
  ) : null;

  return (
    <>
      <ReportShell
        title="Sales & Invoices Report"
        description="Comprehensive register of posted POS invoices, customer billings, discounts, tax liabilities, collected tips, and settlements."
        bannerTitle="Fee / Sales & Invoices Register"
        onFilterSubmit={handleFilterSubmit}
        isFilterLoading={isLoading}
        kpiStrip={kpiCards}
        metaNotice={
          reportData?.meta && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-500 text-[11px]">
              <span>
                <strong className="text-slate-700">Branch:</strong> {reportData.meta.branchName}
              </span>
              <span>•</span>
              <span>
                <strong className="text-slate-700">Period:</strong> {reportData.meta.from} to {reportData.meta.to} ({reportData.meta.preset})
              </span>
              <span>•</span>
              <span>
                <strong className="text-slate-700">Basis:</strong> Invoice Posting Date
              </span>
              <span>•</span>
              <span>
                <strong className="text-slate-700">Timezone:</strong> {reportData.meta.timezone}
              </span>
            </div>
          )
        }
        onExportExcel={handleExportExcel}
        onExportCsv={handleExportCsv}
        onExportPdf={handleExportPrint}
        onExportPrint={handleExportPrint}
        filterChildren={
          <>
            {/* 1. Branch Selector */}
            {isSuperAdmin && (
              <div className="min-w-[140px]">
                <label className={filterLabel}>Campus / Branch</label>
                <select
                  className={selectField}
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                >
                  <option value="ALL">All Branches</option>
                  {allBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 2. Date Preset */}
            <div className="min-w-[130px]">
              <label className={filterLabel}>Date Preset</label>
              <select
                className={selectField}
                value={selectedPreset}
                onChange={(e) => setSelectedPreset(e.target.value as DatePreset)}
              >
                {DATE_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Custom Date From/To */}
            {selectedPreset === 'CUSTOM' && (
              <>
                <div className="min-w-[120px]">
                  <label className={filterLabel}>From Date</label>
                  <input
                    type="date"
                    className={inputField}
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                  />
                </div>
                <div className="min-w-[120px]">
                  <label className={filterLabel}>To Date</label>
                  <input
                    type="date"
                    className={inputField}
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* 4. Payment Status */}
            <div className="min-w-[110px]">
              <label className={filterLabel}>Pay Status</label>
              <select
                className={selectField}
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value)}
              >
                <option value="ALL">All Statuses</option>
                <option value="PAID">Paid</option>
                <option value="PARTIAL">Partially Paid</option>
                <option value="UNPAID">Unpaid</option>
              </select>
            </div>

            {/* 5. Lifecycle Status */}
            <div className="min-w-[120px]">
              <label className={filterLabel}>Lifecycle</label>
              <select
                className={selectField}
                value={lifecycle}
                onChange={(e) => setLifecycle(e.target.value)}
              >
                <option value="ALL">All Lifecycles</option>
                <option value="ACTIVE">Active</option>
                <option value="PARTIALLY_REFUNDED">Partial Refund</option>
                <option value="REFUNDED">Refunded</option>
                <option value="VOIDED">Voided</option>
              </select>
            </div>

            {/* 6. Payment Method */}
            <div className="min-w-[120px]">
              <label className={filterLabel}>Payment Type</label>
              <select
                className={selectField}
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="ALL">All Types</option>
                <option value="CASH">Cash</option>
                <option value="ONLINE_ACCOUNT">Online / Card</option>
                <option value="SPLIT">Split Payment</option>
              </select>
            </div>

            {/* 7. Search Input */}
            <div className="min-w-[180px] flex-1">
              <label className={filterLabel}>Search Records</label>
              <input
                type="text"
                placeholder="Invoice #, Client name, phone..."
                className={`${inputField} w-full`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Reset button */}
            <div className="shrink-0">
              <button
                type="button"
                onClick={handleResetFilters}
                className="h-8 px-2.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 text-xs flex items-center gap-1 cursor-pointer"
                title="Reset filters to default"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>
          </>
        }
      >
        {errorMessage && (
          <div className="p-3 mb-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={() => fetchReport(appliedQuery)}
              className="text-[#0047AB] underline font-semibold cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* ── LANDSCAPE TABLE CONTAINER ── */}
        <ReportTable<SalesInvoiceReportRow>
          columns={columns}
          data={reportData?.rows || []}
          loading={isLoading}
          emptyMessage="No sales invoices found matching the selected filter criteria."
          rowKey={(r) => r.id}
          renderTotals={renderTotalsFooter}
        />
      </ReportShell>

      {/* PRINTABLE RECEIPT MODAL */}
      <ReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
        invoice={receiptInvoice}
        branch={allBranches.find((b) => b.id === receiptInvoice?.branchId) || null}
      />
    </>
  );
};
