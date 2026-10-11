import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from '../../context/RouterContext';
import { salonService } from '../../services';
import {
  TipReceiptRecord,
  TipAllocationRecord,
  TipPayoutRecord,
  TipsStatementSummary,
  Branch,
  StaffMember,
  PaymentAccount,
} from '../../types/salon';
import {
  Coins,
  DollarSign,
  Wallet,
  CheckCircle2,
  Clock,
  ArrowRight,
  Filter,
  Search,
  Calendar,
  RotateCcw,
  Printer,
  Download,
  AlertCircle,
  Building2,
  Users,
  CreditCard,
  X,
  FileSpreadsheet,
  AlertTriangle,
  Scale,
  Sparkles,
  RefreshCw,
  FileText,
  ArrowLeft,
} from 'lucide-react';
import { AccessDeniedView } from '../scaffold/AccessDeniedView';

function formatCurrency(val: number): string {
  return `PKR ${val.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export const TipsStatementPage: React.FC = () => {
  const { user } = useAuth();
  const { navigate } = useRouter();

  // Role guard: Super Admin and Branch Admin only. Accountant and Staff denied.
  if (!user || (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN')) {
    return <AccessDeniedView attemptedPath="/accounts/tips-statement" />;
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN';

  // Filters State
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    isSuperAdmin ? 'ALL' : user.branchId || ''
  );
  const [allStaff, setAllStaff] = useState<StaffMember[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([]);

  // Default date window: Current month
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const monthStartStr = useMemo(() => todayStr.slice(0, 7) + '-01', [todayStr]);

  const [startDate, setStartDate] = useState<string>(monthStartStr);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('ALL');
  const [selectedPaymentSource, setSelectedPaymentSource] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Data State
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'SUMMARY' | 'COLLECTIONS' | 'ALLOCATIONS' | 'PAYOUTS'>('SUMMARY');
  const [summary, setSummary] = useState<TipsStatementSummary>({
    openingLiability: 0,
    netTipsCollected: 0,
    netPayouts: 0,
    closingLiability: 0,
    unallocatedTips: 0,
    allocatedUnpaidTips: 0,
    receiptsCount: 0,
    allocationsCount: 0,
    payoutsCount: 0,
  });
  const [receipts, setReceipts] = useState<TipReceiptRecord[]>([]);
  const [allocations, setAllocations] = useState<TipAllocationRecord[]>([]);
  const [payouts, setPayouts] = useState<TipPayoutRecord[]>([]);

  // Print modal state
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);

  // Load auxiliary data
  useEffect(() => {
    const loadAux = async () => {
      try {
        const [bList, sList, pList] = await Promise.all([
          salonService.getBranches(),
          salonService.getStaff(isSuperAdmin ? 'ALL' : user.branchId),
          salonService.getPaymentAccounts(isSuperAdmin ? 'ALL' : user.branchId),
        ]);
        setBranches(bList);
        setAllStaff(sList);
        setPaymentAccounts(pList);
      } catch (err) {
        console.error('Failed to load auxiliary data', err);
      }
    };
    loadAux();
  }, [user, isSuperAdmin]);

  // Load statement data
  const fetchStatement = async () => {
    try {
      setLoading(true);
      const res = await salonService.getTipsStatement(
        selectedBranchId,
        startDate,
        endDate,
        {
          staffId: selectedStaffId,
          paymentSource: selectedPaymentSource,
        },
        user
      );
      setSummary(res.summary);
      setReceipts(res.receipts);
      setAllocations(res.allocations);
      setPayouts(res.payouts);
    } catch (err) {
      console.error('Failed to load tips statement', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatement();
  }, [selectedBranchId, startDate, endDate, selectedStaffId, selectedPaymentSource]);

  // Filtered lists for search query
  const filteredReceipts = useMemo(() => {
    if (!searchQuery.trim()) return receipts;
    const q = searchQuery.toLowerCase();
    return receipts.filter(
      (r) =>
        r.receiptNumber.toLowerCase().includes(q) ||
        r.invoiceNumber.toLowerCase().includes(q) ||
        r.clientName.toLowerCase().includes(q) ||
        (r.directStaffName && r.directStaffName.toLowerCase().includes(q))
    );
  }, [receipts, searchQuery]);

  const filteredAllocations = useMemo(() => {
    if (!searchQuery.trim()) return allocations;
    const q = searchQuery.toLowerCase();
    return allocations.filter(
      (a) =>
        a.allocationNumber.toLowerCase().includes(q) ||
        a.tipReceiptNumber.toLowerCase().includes(q) ||
        a.invoiceNumber.toLowerCase().includes(q) ||
        a.staffName.toLowerCase().includes(q)
    );
  }, [allocations, searchQuery]);

  const filteredPayouts = useMemo(() => {
    if (!searchQuery.trim()) return payouts;
    const q = searchQuery.toLowerCase();
    return payouts.filter(
      (p) =>
        p.payoutNumber.toLowerCase().includes(q) ||
        p.allocationNumber.toLowerCase().includes(q) ||
        p.staffName.toLowerCase().includes(q) ||
        (p.onlineAccountName && p.onlineAccountName.toLowerCase().includes(q)) ||
        (p.reference && p.reference.toLowerCase().includes(q))
    );
  }, [payouts, searchQuery]);

  // Verification checks
  const isEquationBalanced = useMemo(() => {
    const calcClosing = Math.round((summary.openingLiability + summary.netTipsCollected - summary.netPayouts) * 100) / 100;
    return Math.abs(calcClosing - summary.closingLiability) < 0.01;
  }, [summary]);

  const isBreakdownBalanced = useMemo(() => {
    const sumBreakdown = Math.round((summary.unallocatedTips + summary.allocatedUnpaidTips) * 100) / 100;
    return Math.abs(sumBreakdown - summary.closingLiability) < 0.01;
  }, [summary]);

  // CSV Export
  const handleExportCSV = () => {
    const headers = [
      'Report Type',
      'Branch',
      'Start Date',
      'End Date',
      'Opening Liability (PKR)',
      'Net Tips Collected (PKR)',
      'Net Payouts (PKR)',
      'Closing Liability (PKR)',
      'Unallocated Tips (PKR)',
      'Allocated Unpaid Tips (PKR)',
    ];

    const branchName =
      selectedBranchId === 'ALL'
        ? 'All Branches'
        : branches.find((b) => b.id === selectedBranchId)?.name || selectedBranchId;

    const summaryRow = [
      'Tips Financial Statement & Liability Reconciliation',
      `"${branchName}"`,
      startDate,
      endDate,
      summary.openingLiability.toFixed(2),
      summary.netTipsCollected.toFixed(2),
      summary.netPayouts.toFixed(2),
      summary.closingLiability.toFixed(2),
      summary.unallocatedTips.toFixed(2),
      summary.allocatedUnpaidTips.toFixed(2),
    ];

    let csvContent = 'data:text/csv;charset=utf-8,' + headers.join(',') + '\n' + summaryRow.join(',') + '\n\n';

    // Section 1: Receipts
    csvContent += '--- TIP COLLECTIONS ---\n';
    csvContent += 'Receipt #,Date,Time,Invoice #,Client Name,Method,Account/Drawer,Collected (PKR),Allocated (PKR),Unallocated (PKR),Status\n';
    receipts.forEach((r) => {
      csvContent += `"${r.receiptNumber}","${r.collectionDate}","${r.collectionTime}","${r.invoiceNumber}","${r.clientName}","${r.method}","${r.paymentAccountName || r.cashDrawerId || '-'}","${r.collectedAmount}","${r.allocatedAmount}","${r.unallocatedAmount}","${r.status}"\n`;
    });

    // Section 2: Allocations
    csvContent += '\n--- TIP ALLOCATIONS ---\n';
    csvContent += 'Allocation #,Date,Tip Receipt #,Invoice #,Staff Name,Type,Allocated (PKR),Paid (PKR),Outstanding (PKR),Status\n';
    allocations.forEach((a) => {
      csvContent += `"${a.allocationNumber}","${a.allocationDate}","${a.tipReceiptNumber}","${a.invoiceNumber}","${a.staffName}","${a.allocationType}","${a.amount}","${a.paidAmount}","${a.outstandingAmount}","${a.status}"\n`;
    });

    // Section 3: Payouts
    csvContent += '\n--- TIP PAYOUTS ---\n';
    csvContent += 'Payout #,Date,Time,Staff Name,Allocation #,Method,Drawer/Account,Amount (PKR),Status,Paid By,Reversal Reason\n';
    payouts.forEach((p) => {
      csvContent += `"${p.payoutNumber}","${p.payoutDate}","${p.payoutTime}","${p.staffName}","${p.allocationNumber}","${p.method}","${p.onlineAccountName || p.cashDrawerId || '-'}","${p.amount}","${p.status}","${p.paidByName}","${p.reversalReason || '-'}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Tips_Statement_${selectedBranchId}_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 font-sans">
      {/* Top Header Banner */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Tips Financial Statement</h1>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold border border-slate-200">
                  Strict Staff Liability
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Audited custody reconciliation of client gratuities, employee allocations, and disbursements.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/accounts/tips-management')}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1.5 transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Tips Management
          </button>
          <button
            onClick={fetchStatement}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1.5 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowPrintModal(true)}
            className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs rounded-xl flex items-center gap-2 transition-all"
          >
            <Printer className="w-4 h-4" />
            Print Statement
          </button>
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 bg-[#2254E1] hover:bg-blue-700 text-white font-semibold text-xs rounded-xl flex items-center gap-2 transition-all shadow-sm"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filter Control Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-wrap items-center gap-3 text-xs">
        {/* Branch Filter */}
        {isSuperAdmin && (
          <div className="flex items-center gap-2 min-w-[200px]">
            <Building2 className="w-4 h-4 text-slate-400" />
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Date Window */}
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span className="text-slate-500 font-medium">From:</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <span className="text-slate-500 font-medium">To:</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Staff Filter */}
        <div className="flex items-center gap-2 min-w-[170px]">
          <Users className="w-4 h-4 text-slate-400" />
          <select
            value={selectedStaffId}
            onChange={(e) => setSelectedStaffId(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">All Staff Members</option>
            {allStaff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.designation})
              </option>
            ))}
          </select>
        </div>

        {/* Payment Source Filter */}
        <div className="flex items-center gap-2 min-w-[150px]">
          <CreditCard className="w-4 h-4 text-slate-400" />
          <select
            value={selectedPaymentSource}
            onChange={(e) => setSelectedPaymentSource(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">All Sources</option>
            <option value="CASH">Cash Drawer</option>
            <option value="ONLINE">Bank / Online Account</option>
          </select>
        </div>

        {/* Search */}
        <div className="flex-1 min-w-[200px] relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search receipt #, invoice #, staff..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* RECONCILING EQUATION & STATUS */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-white border border-slate-200 rounded-xl shadow-2xs">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-[#0047AB]" />
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
            Staff Tip Liability Reconciliation
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {isEquationBalanced && isBreakdownBalanced ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              100% Reconciled
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-50 text-rose-700 font-semibold border border-rose-200">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
              Discrepancy Detected
            </span>
          )}
          <span className="text-slate-500 font-mono">Cutoff: {endDate}</span>
        </div>
      </div>

      {/* CLEAN WHITE KPI CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* 1. Opening Liability */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
            Opening Liability
          </span>
          <span className="text-base font-bold text-slate-900 font-mono block">
            {formatCurrency(summary.openingLiability)}
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Prior to {startDate}</span>
        </div>

        {/* 2. Net Tips Collected */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
            {summary.liabilityBasis === 'STAFF_ALLOCATIONS' ? 'Net Tips Allocated' : 'Net Tips Collected'}
          </span>
          <span className="text-base font-bold text-emerald-600 font-mono block">
            +{formatCurrency(summary.netTipsCollected)}
          </span>
          <span className="text-[10px] text-emerald-600 mt-0.5 block">{summary.receiptsCount} receipts</span>
        </div>

        {/* 3. Net Payouts */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
            Net Payouts Disbursed
          </span>
          <span className="text-base font-bold text-rose-600 font-mono block">
            -{formatCurrency(summary.netPayouts)}
          </span>
          <span className="text-[10px] text-rose-600 mt-0.5 block">{summary.payoutsCount} disbursements</span>
        </div>

        {/* 4. Closing Liability */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
            Closing Liability
          </span>
          <span className="text-base font-bold text-amber-600 font-mono block">
            {formatCurrency(summary.closingLiability)}
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5 block">At Cutoff Date</span>
        </div>

        {/* 5. Unallocated Tips */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
            Gratuity Pool
          </span>
          <span className="text-base font-bold text-slate-800 font-mono block">
            {formatCurrency(summary.unallocatedTips)}
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Unallocated</span>
        </div>

        {/* 6. Allocated Unpaid */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
            Staff Payable
          </span>
          <span className="text-base font-bold text-indigo-600 font-mono block">
            {formatCurrency(summary.allocatedUnpaidTips)}
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Awaiting Payout</span>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('SUMMARY')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'SUMMARY'
              ? 'bg-[#0047AB] text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          Comprehensive Audit Summary
        </button>
        <button
          onClick={() => setActiveTab('COLLECTIONS')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'COLLECTIONS'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          1. Collections Log ({filteredReceipts.length})
        </button>
        <button
          onClick={() => setActiveTab('ALLOCATIONS')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'ALLOCATIONS'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          2. Allocations Log ({filteredAllocations.length})
        </button>
        <button
          onClick={() => setActiveTab('PAYOUTS')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'PAYOUTS'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          3. Disbursements Log ({filteredPayouts.length})
        </button>
      </div>

      {/* TAB CONTENT */}
      {loading ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-slate-100 shadow-sm">
          <Clock className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-2" />
          <p className="text-sm text-slate-500 font-medium">Reconciling tip ledger records...</p>
        </div>
      ) : activeTab === 'SUMMARY' ? (
        /* COMPREHENSIVE AUDIT SUMMARY VIEW */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Section 1: Collections Overview */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                  <Coins className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Collections Overview</h3>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full">
                {receipts.length} receipts
              </span>
            </div>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">Period Tips Collected</span>
                <span className="font-bold text-emerald-600">{formatCurrency(summary.netTipsCollected)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">Directly Allocated at POS</span>
                <span className="font-semibold text-slate-800">
                  {formatCurrency(
                    receipts.filter((r) => r.directStaffId).reduce((s, r) => s + r.collectedAmount, 0)
                  )}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">Pooled Tips Received</span>
                <span className="font-semibold text-slate-800">
                  {formatCurrency(
                    receipts.filter((r) => !r.directStaffId).reduce((s, r) => s + r.collectedAmount, 0)
                  )}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Average Tip per Receipt</span>
                <span className="font-semibold text-slate-800">
                  {receipts.length > 0
                    ? formatCurrency(Math.round(summary.netTipsCollected / receipts.length))
                    : 'PKR 0'}
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Allocations Overview */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  <Users className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Allocations Overview</h3>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full">
                {allocations.length} records
              </span>
            </div>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">Total Allocated in Period</span>
                <span className="font-bold text-indigo-600">
                  {formatCurrency(allocations.reduce((s, a) => s + a.amount, 0))}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">Settled via Disbursements</span>
                <span className="font-semibold text-emerald-600">
                  {formatCurrency(allocations.reduce((s, a) => s + a.paidAmount, 0))}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">Awaiting Disbursement</span>
                <span className="font-semibold text-amber-600">
                  {formatCurrency(allocations.reduce((s, a) => s + a.outstandingAmount, 0))}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Beneficiary Stylists</span>
                <span className="font-semibold text-slate-800">
                  {new Set(allocations.map((a) => a.staffId)).size} employees
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: Disbursements Overview */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                  <Wallet className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Disbursements Overview</h3>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 bg-rose-50 text-rose-700 rounded-full">
                {payouts.length} disbursements
              </span>
            </div>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">Net Disbursed in Period</span>
                <span className="font-bold text-rose-600">{formatCurrency(summary.netPayouts)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">Paid from Cash Drawers</span>
                <span className="font-semibold text-slate-800">
                  {formatCurrency(
                    payouts
                      .filter((p) => p.method === 'CASH' && p.status === 'COMPLETED')
                      .reduce((s, p) => s + p.amount, 0)
                  )}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">Paid from Bank Accounts</span>
                <span className="font-semibold text-slate-800">
                  {formatCurrency(
                    payouts
                      .filter((p) => p.method === 'ONLINE' && p.status === 'COMPLETED')
                      .reduce((s, p) => s + p.amount, 0)
                  )}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Reversals Processed</span>
                <span className="font-semibold text-amber-600">
                  {payouts.filter((p) => p.status === 'REVERSED').length} records
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === 'COLLECTIONS' ? (
        /* 1. COLLECTIONS LOG TABLE */
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm">Tip Collections (Posted Receipts)</h3>
            <span className="text-xs text-slate-500">
              Showing {filteredReceipts.length} of {receipts.length} collections
            </span>
          </div>

          {filteredReceipts.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              No tip receipts found matching the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/70 text-slate-600 font-semibold border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-4">Receipt #</th>
                    <th className="py-3 px-3">Date & Time</th>
                    <th className="py-3 px-3">Invoice #</th>
                    <th className="py-3 px-3">Client</th>
                    <th className="py-3 px-3">Collection Channel</th>
                    <th className="py-3 px-3 text-right">Collected Amount</th>
                    <th className="py-3 px-3 text-right">Allocated</th>
                    <th className="py-3 px-3 text-right">Unallocated</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredReceipts.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900">{r.receiptNumber}</td>
                      <td className="py-3 px-3 text-slate-600">
                        {r.collectionDate} <span className="text-slate-400 text-[11px]">{r.collectionTime}</span>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-700">{r.invoiceNumber}</td>
                      <td className="py-3 px-3 font-medium text-slate-900">{r.clientName}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                          {r.method === 'CASH' ? 'Cash Float' : r.paymentAccountName || 'Online Account'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-emerald-600">
                        {formatCurrency(r.collectedAmount)}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-indigo-600">
                        {formatCurrency(r.allocatedAmount)}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-amber-600">
                        {formatCurrency(r.unallocatedAmount)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            r.status === 'FULLY_ALLOCATED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : r.status === 'PARTIALLY_ALLOCATED'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : activeTab === 'ALLOCATIONS' ? (
        /* 2. ALLOCATIONS LOG TABLE */
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm">Tip Allocations (Employee Payable Rights)</h3>
            <span className="text-xs text-slate-500">
              Showing {filteredAllocations.length} of {allocations.length} allocations
            </span>
          </div>

          {filteredAllocations.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              No tip allocations found matching the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/70 text-slate-600 font-semibold border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-4">Allocation #</th>
                    <th className="py-3 px-3">Date</th>
                    <th className="py-3 px-3">Tip Receipt #</th>
                    <th className="py-3 px-3">Staff Recipient</th>
                    <th className="py-3 px-3 text-center">Type</th>
                    <th className="py-3 px-3 text-right">Allocated Amount</th>
                    <th className="py-3 px-3 text-right">Disbursed (Paid)</th>
                    <th className="py-3 px-3 text-right">Outstanding</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAllocations.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900">{a.allocationNumber}</td>
                      <td className="py-3 px-3 text-slate-600">{a.allocationDate}</td>
                      <td className="py-3 px-3 font-mono text-slate-700">{a.tipReceiptNumber}</td>
                      <td className="py-3 px-3 font-semibold text-slate-900">{a.staffName}</td>
                      <td className="py-3 px-3 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                          {a.allocationType}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-slate-900">
                        {formatCurrency(a.amount)}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-emerald-600">
                        {formatCurrency(a.paidAmount)}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-amber-600">
                        {formatCurrency(a.outstandingAmount)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            a.status === 'PAID'
                              ? 'bg-emerald-100 text-emerald-800'
                              : a.status === 'PARTIALLY_PAID'
                              ? 'bg-amber-100 text-amber-800'
                              : a.status === 'CANCELLED'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-indigo-100 text-indigo-800'
                          }`}
                        >
                          {a.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* 3. DISBURSEMENTS LOG TABLE */
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm">Tip Disbursements (Cash & Bank Payouts)</h3>
            <span className="text-xs text-slate-500">
              Showing {filteredPayouts.length} of {payouts.length} disbursements
            </span>
          </div>

          {filteredPayouts.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              No tip disbursements found matching the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/70 text-slate-600 font-semibold border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-4">Payout #</th>
                    <th className="py-3 px-3">Date & Time</th>
                    <th className="py-3 px-3">Staff Recipient</th>
                    <th className="py-3 px-3">Allocation #</th>
                    <th className="py-3 px-3">Disbursement Source</th>
                    <th className="py-3 px-3 text-right">Disbursed Amount</th>
                    <th className="py-3 px-3">Processed By</th>
                    <th className="py-3 px-3 text-center">Status</th>
                    <th className="py-3 px-4">Notes / Reversal Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPayouts.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900">{p.payoutNumber}</td>
                      <td className="py-3 px-3 text-slate-600">
                        {p.payoutDate} <span className="text-slate-400 text-[11px]">{p.payoutTime}</span>
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-900">{p.staffName}</td>
                      <td className="py-3 px-3 font-mono text-slate-700">{p.allocationNumber}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                          {p.method === 'CASH' ? 'Cash Drawer' : p.onlineAccountName || 'Bank Account'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-slate-900">
                        {formatCurrency(p.amount)}
                      </td>
                      <td className="py-3 px-3 text-slate-600">{p.paidByName}</td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            p.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 max-w-xs truncate">
                        {p.status === 'REVERSED' ? (
                          <span className="text-rose-600 font-medium">Reversed: {p.reversalReason}</span>
                        ) : (
                          p.notes || p.reference || '-'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* PRINT MODAL */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <span className="font-bold text-slate-800 text-sm">Print Tips Financial Statement</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-1.5 bg-[#2254E1] hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Now
                </button>
                <button onClick={() => setShowPrintModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-8 overflow-y-auto space-y-6 text-xs bg-white text-slate-900">
              {/* Header Letterhead */}
              <div className="text-center pb-4 border-b border-slate-200">
                <h2 className="text-xl font-bold tracking-tight text-slate-900">SALON OS MANAGEMENT</h2>
                <p className="text-xs text-slate-500 mt-0.5">Comprehensive Tips Financial Statement & Liability Audit</p>
                <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full font-semibold text-slate-700 text-[11px]">
                  <span>Branch: {selectedBranchId === 'ALL' ? 'All Branches' : branches.find((b) => b.id === selectedBranchId)?.name}</span>
                  <span>•</span>
                  <span>Period: {startDate} to {endDate}</span>
                </div>
              </div>

              {/* Reconciliation Table */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2">
                  Liability Reconciliation Summary
                </h4>
                <div className="flex justify-between py-1 border-b border-slate-200/70">
                  <span className="text-slate-600">Opening Outstanding Liability (Prior to {startDate})</span>
                  <span className="font-bold text-slate-900">{formatCurrency(summary.openingLiability)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/70 text-emerald-700">
                  <span>+ Net Tips Collected in Period</span>
                  <span className="font-bold">+{formatCurrency(summary.netTipsCollected)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/70 text-rose-700">
                  <span>- Net Tip Disbursements in Period</span>
                  <span className="font-bold">-{formatCurrency(summary.netPayouts)}</span>
                </div>
                <div className="flex justify-between py-1.5 text-sm font-bold text-slate-900">
                  <span>= Closing Outstanding Liability (As of {endDate})</span>
                  <span className="text-amber-600">{formatCurrency(summary.closingLiability)}</span>
                </div>
                <div className="pt-2 border-t border-slate-200 flex justify-between text-[11px] text-slate-500">
                  <span>Composition: Unallocated Pool ({formatCurrency(summary.unallocatedTips)}) + Staff Payable ({formatCurrency(summary.allocatedUnpaidTips)})</span>
                  <span className="font-semibold text-emerald-700">Balanced & Audited</span>
                </div>
              </div>

              {/* Collections Summary List */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-800 text-xs">Recent Collections ({receipts.length})</h4>
                <table className="w-full text-left text-[11px]">
                  <thead className="border-b border-slate-200 font-semibold text-slate-600">
                    <tr>
                      <th className="py-1">Receipt #</th>
                      <th className="py-1">Date</th>
                      <th className="py-1">Client</th>
                      <th className="py-1">Channel</th>
                      <th className="py-1 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {receipts.slice(0, 10).map((r) => (
                      <tr key={r.id}>
                        <td className="py-1 font-mono">{r.receiptNumber}</td>
                        <td className="py-1">{r.collectionDate}</td>
                        <td className="py-1">{r.clientName}</td>
                        <td className="py-1">{r.method}</td>
                        <td className="py-1 text-right font-semibold">{formatCurrency(r.collectedAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Disbursements Summary List */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-800 text-xs">Recent Disbursements ({payouts.length})</h4>
                <table className="w-full text-left text-[11px]">
                  <thead className="border-b border-slate-200 font-semibold text-slate-600">
                    <tr>
                      <th className="py-1">Payout #</th>
                      <th className="py-1">Date</th>
                      <th className="py-1">Employee</th>
                      <th className="py-1">Method</th>
                      <th className="py-1 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payouts.slice(0, 10).map((p) => (
                      <tr key={p.id}>
                        <td className="py-1 font-mono">{p.payoutNumber}</td>
                        <td className="py-1">{p.payoutDate}</td>
                        <td className="py-1">{p.staffName}</td>
                        <td className="py-1">{p.method}</td>
                        <td className="py-1 text-right font-semibold">{formatCurrency(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Signatures */}
              <div className="pt-8 grid grid-cols-2 gap-8 text-center text-slate-500 text-[11px]">
                <div className="border-t border-slate-200 pt-2">Branch Administrator</div>
                <div className="border-t border-slate-200 pt-2">Audit & Accounts Controller</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
