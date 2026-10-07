import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from '@/context/RouterContext';
import { salonService } from '@/services';
import {
  BalanceSheetSummary,
  CustodyTransaction,
  CustodyTransactionType,
  CashDrawer,
  Branch,
} from '@/types/salon';
import { User } from '@/types/auth';
import { AccessDeniedView } from '@/features/scaffold/AccessDeniedView';
import { formatCurrency, formatDate } from '@/lib/formatters';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Search,
  Printer,
  FileSpreadsheet,
  Building2,
  Banknote,
  CreditCard,
  ArrowRightLeft,
  X,
  Filter,
  Eye,
  ArrowUpRight,
  ArrowDownLeft,
  Scale,
  ShieldCheck,
  AlertTriangle,
  Receipt,
  FileText,
  Clock,
  User as UserIcon,
  HelpCircle,
} from 'lucide-react';

export const MyBalanceSheetPage: React.FC = () => {
  const { user, activeBranchId, allBranches } = useAuth();
  const { navigate } = useRouter();

  // Role guard: Super Admin, Admin, and Accountant. Staff strictly denied.
  if (!user || user.role === 'STAFF') {
    return <AccessDeniedView attemptedPath="/accounts/my-balance-sheet" />;
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const isAdmin = user.role === 'ADMIN';
  const isAccountant = user.role === 'ACCOUNTANT';

  // Branch scope
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    isSuperAdmin ? activeBranchId && activeBranchId !== 'ALL' ? activeBranchId : (user.branchId || allBranches[0]?.id || '') : (user.branchId as string)
  );

  useEffect(() => {
    if (isSuperAdmin && activeBranchId && activeBranchId !== 'ALL') {
      setSelectedBranchId(activeBranchId);
    }
  }, [activeBranchId, isSuperAdmin]);

  // Target User: "My" statement defaults strictly to authenticated user
  const [targetUserId, setTargetUserId] = useState<string>(user.id);
  const [branchUsers, setBranchUsers] = useState<User[]>([]);
  const [branchDrawers, setBranchDrawers] = useState<CashDrawer[]>([]);
  const [selectedDrawerId, setSelectedDrawerId] = useState<string>('ALL');

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<'ALL' | CustodyTransactionType>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Loaded data
  const [summary, setSummary] = useState<BalanceSheetSummary | null>(null);
  const [transactions, setTransactions] = useState<CustodyTransaction[]>([]);
  const [openingBalanceCarriedForward, setOpeningBalanceCarriedForward] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Document View Modal state
  const [selectedDocTransaction, setSelectedDocTransaction] = useState<CustodyTransaction | null>(null);
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const printAreaRef = useRef<HTMLDivElement>(null);

  // Load branch users (if manager wants to inspect another user)
  useEffect(() => {
    let isMounted = true;
    async function loadMeta() {
      if (user && (isSuperAdmin || isAdmin)) {
        try {
          const users = await salonService.getUsers(user, selectedBranchId || 'ALL');
          if (isMounted) {
            setBranchUsers(users.filter((u) => u.role !== 'STAFF'));
          }
        } catch {
          // ignore
        }
      }
    }
    loadMeta();
    return () => {
      isMounted = false;
    };
  }, [selectedBranchId, isSuperAdmin, isAdmin]);

  // Load Statement
  const loadStatement = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await salonService.getCashCustodyStatement(
        {
          branchId: selectedBranchId,
          userId: targetUserId,
          drawerId: selectedDrawerId !== 'ALL' ? selectedDrawerId : undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        },
        user
      );
      setSummary(res.summary);
      setTransactions(res.transactions);
      setOpeningBalanceCarriedForward(res.openingBalanceCarriedForward);

      // Load all available drawers for selector
      try {
        const dList = await salonService.getCashDrawers(selectedBranchId, targetUserId);
        setBranchDrawers(dList);
      } catch {
        // fallback
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load cash custody statement.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStatement();
  }, [selectedBranchId, targetUserId, selectedDrawerId, startDate, endDate]);

  // Filtered transactions for search & type filter
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (transactionTypeFilter !== 'ALL' && t.type !== transactionTypeFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesRef = t.referenceNumber.toLowerCase().includes(q);
        const matchesDesc = t.description.toLowerCase().includes(q);
        const matchesActor = t.actorName.toLowerCase().includes(q);
        if (!matchesRef && !matchesDesc && !matchesActor) {
          return false;
        }
      }
      return true;
    });
  }, [transactions, transactionTypeFilter, searchQuery]);

  // Export Filtered CSV
  const handleExportCSV = () => {
    if (!filteredTransactions.length) return;
    const headers = [
      'Date',
      'Time',
      'Reference #',
      'Transaction Type',
      'Description',
      'Cash In (PKR)',
      'Cash Out (PKR)',
      'Running Balance (PKR)',
      'Actor',
      'Document Type',
    ];
    const rows = filteredTransactions.map((t) => [
      `"${t.date}"`,
      `"${t.time}"`,
      `"${t.referenceNumber}"`,
      `"${t.type}"`,
      `"${t.description.replace(/"/g, '""')}"`,
      t.cashIn.toFixed(2),
      t.cashOut.toFixed(2),
      t.runningBalance.toFixed(2),
      `"${t.actorName}"`,
      `"${t.documentType}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Cash_Custody_Statement_${targetUserId}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  const getTypeBadge = (type: CustodyTransactionType) => {
    switch (type) {
      case 'OPENING_FLOAT':
        return <Badge className="bg-sky-100 text-sky-800 border-sky-200">Opening Float</Badge>;
      case 'POS_SALE':
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">POS Cash Sale</Badge>;
      case 'DUES_COLLECTION':
        return <Badge className="bg-teal-100 text-teal-800 border-teal-200">Dues Collection</Badge>;
      case 'TIP_RECEIVED':
        return <Badge className="bg-purple-100 text-purple-800 border-purple-200">Cash Tip</Badge>;
      case 'FLOAT_RECEIVED':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Float Received</Badge>;
      case 'EXPENSE_PAID':
        return <Badge className="bg-rose-100 text-rose-800 border-rose-200">Cash Expense</Badge>;
      case 'EXPENSE_REVERSAL_REFUND':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Expense Refund</Badge>;
      case 'HANDOVER_SETTLEMENT':
        return <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200">Vault Handover</Badge>;
      case 'VARIANCE_ADJUSTMENT':
        return <Badge className="bg-orange-100 text-orange-800 border-orange-200">Variance Adjustment</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 font-sans">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#2254E1]/10 flex items-center justify-center text-[#2254E1]">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">My Balance Sheet</h1>
              <p className="text-xs text-slate-500 font-medium">Cash Custody Statement & Continuous Reconciliation</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Super Admin Branch Selector */}
          {isSuperAdmin && allBranches && (
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-sm">
              <Building2 className="w-4 h-4 text-slate-400" />
              <Select value={selectedBranchId} onValueChange={(val) => setSelectedBranchId(val)}>
                <SelectTrigger className="border-0 shadow-none text-xs font-semibold h-7 p-0 focus:ring-0">
                  <SelectValue placeholder="Select Branch" />
                </SelectTrigger>
                <SelectContent>
                  {allBranches.map((b) => (
                    <SelectItem key={b.id} value={b.id} className="text-xs">
                      {b.name} ({b.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* User Selector for Admins */}
          {(isSuperAdmin || isAdmin) && branchUsers.length > 0 && (
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-sm">
              <UserIcon className="w-4 h-4 text-slate-400" />
              <Select value={targetUserId} onValueChange={(val) => setTargetUserId(val)}>
                <SelectTrigger className="border-0 shadow-none text-xs font-semibold h-7 p-0 focus:ring-0">
                  <SelectValue placeholder="Select User" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={user.id} className="text-xs font-medium">
                    My Statement ({user.name})
                  </SelectItem>
                  {branchUsers
                    .filter((u) => u.id !== user.id)
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id} className="text-xs">
                        {u.name} ({u.role})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Quick settlement navigation */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/accounts/account-settlement')}
            className="text-xs h-9 font-medium gap-1.5 text-slate-700 bg-white"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-[#2254E1]" />
            Account Settlement
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPrintModalOpen(true)}
            className="text-xs h-9 font-medium gap-1.5 text-slate-700 bg-white"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            Print Statement
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={!filteredTransactions.length}
            className="text-xs h-9 font-medium gap-1.5 text-slate-700 bg-white"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Custody Holder & Drawer Banner */}
      {summary && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-700 text-sm">
              {summary.user.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 text-base">{summary.user.name}</span>
                <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider bg-slate-50">
                  {summary.user.role}
                </Badge>
                {summary.drawer && (
                  <Badge
                    className={
                      summary.drawer.status === 'OPEN'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        : summary.drawer.status === 'SETTLEMENT_PENDING'
                        ? 'bg-amber-100 text-amber-800 border-amber-200 animate-pulse'
                        : 'bg-slate-100 text-slate-700 border-slate-200'
                    }
                  >
                    Drawer: {summary.drawer.status}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Branch: <span className="font-medium text-slate-700">{summary.branch.name} ({summary.branch.code})</span>
                {summary.drawer && (
                  <span className="ml-3">
                    Drawer Shift Date: <span className="font-medium text-slate-700">{formatDate(summary.drawer.date)}</span>
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Drawer / Shift Selector */}
          {branchDrawers.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Drawer / Shift:</span>
              <Select value={selectedDrawerId} onValueChange={(val) => setSelectedDrawerId(val)}>
                <SelectTrigger className="w-[180px] h-8 text-xs bg-slate-50">
                  <SelectValue placeholder="All Shifts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL" className="text-xs">All Activity (Combined)</SelectItem>
                  {branchDrawers.map((d) => (
                    <SelectItem key={d.id} value={d.id} className="text-xs">
                      {formatDate(d.date)} ({d.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      {/* Financial Summary KPI Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Expected Cash In Custody (HERO) */}
          <Card className="p-4 bg-gradient-to-br from-[#2254E1] to-[#1B43B4] text-white border-0 shadow-md relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wide uppercase text-blue-100">Expected Cash In Custody</span>
              <Banknote className="w-5 h-5 text-blue-200" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold tracking-tight">
                {formatCurrency(summary.expectedCashInCustody)}
              </div>
              <p className="text-[11px] text-blue-100 mt-1">
                Opening Cash + Cash Inflows − Cash Outflows
              </p>
            </div>
          </Card>

          {/* Card 2: Cash Inflows */}
          <Card className="p-4 bg-white border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wide uppercase text-slate-500">Cash Inflows</span>
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <ArrowDownLeft className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-xl font-bold text-emerald-600">
                + {formatCurrency(summary.cashSalesTotal + summary.previousDuesCollectedTotal + summary.cashTipsTotal + summary.floatReceivedTotal + summary.cashReversalsRefundTotal)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 space-y-0.5">
                <div className="flex justify-between">
                  <span>Sales:</span> <span className="font-medium text-slate-700">{formatCurrency(summary.cashSalesTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Prev Dues:</span> <span className="font-medium text-slate-700">{formatCurrency(summary.previousDuesCollectedTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cash Tips:</span> <span className="font-medium text-purple-700">{formatCurrency(summary.cashTipsTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Float Replenished:</span> <span className="font-medium text-slate-700">{formatCurrency(summary.floatReceivedTotal)}</span>
                </div>
                {summary.cashReversalsRefundTotal > 0 && (
                  <div className="flex justify-between">
                    <span>Reversals:</span> <span className="font-medium text-amber-700">{formatCurrency(summary.cashReversalsRefundTotal)}</span>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Card 3: Cash Outflows */}
          <Card className="p-4 bg-white border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wide uppercase text-slate-500">Cash Outflows</span>
              <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-xl font-bold text-rose-600">
                - {formatCurrency(summary.cashExpensesPaidTotal + summary.approvedHandoversTotal)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 space-y-0.5">
                <div className="flex justify-between">
                  <span>Cash Expenses Paid:</span> <span className="font-medium text-slate-700">{formatCurrency(summary.cashExpensesPaidTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Settlement Handovers:</span> <span className="font-medium text-slate-700">{formatCurrency(summary.approvedHandoversTotal)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-100">
                  <span>Opening Float:</span> <span className="font-medium text-slate-700">{formatCurrency(summary.openingCash)}</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Card 4: Last Physical Count & Reconciliation */}
          <Card className="p-4 bg-white border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wide uppercase text-slate-500">Last Physical Count</span>
              <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-xl font-bold text-slate-900">
                {summary.lastCountedCash !== undefined ? formatCurrency(summary.lastCountedCash) : 'No Count Logged'}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 space-y-0.5">
                <div className="flex justify-between">
                  <span>Variance:</span>
                  <span
                    className={`font-semibold ${
                      (summary.lastVariance || 0) === 0
                        ? 'text-emerald-600'
                        : (summary.lastVariance || 0) > 0
                        ? 'text-amber-600'
                        : 'text-rose-600'
                    }`}
                  >
                    {(summary.lastVariance || 0) > 0 ? '+' : ''}
                    {formatCurrency(summary.lastVariance || 0)}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 truncate mt-1">
                  {summary.lastCountedTimestamp ? `Audited: ${new Date(summary.lastCountedTimestamp).toLocaleString()}` : 'Count separates from live expected cash'}
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Segregated Online Collections Banner */}
      {summary && (
        <Card className="p-4 bg-slate-50 border border-slate-200 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-[#2254E1] flex items-center justify-center mt-0.5">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">Segregated Online Collections</h3>
                  <Badge variant="outline" className="text-[10px] bg-white text-slate-600">
                    Processor / Bank Accounts
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Electronic payments processed into merchant bank accounts. These do{' '}
                  <span className="font-semibold text-slate-700">NOT</span> alter physical cash custody.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Total Online Processed</span>
                <span className="text-lg font-bold text-[#2254E1]">{formatCurrency(summary.onlineCollectionsTotal)}</span>
              </div>
            </div>
          </div>

          {summary.onlineCollectionsBreakdown.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {summary.onlineCollectionsBreakdown.map((item) => (
                <div key={item.paymentAccountId} className="bg-white border border-slate-200/80 rounded-lg p-2.5 flex items-center justify-between">
                  <div className="truncate pr-2">
                    <p className="text-xs font-semibold text-slate-800 truncate">{item.paymentAccountName}</p>
                    <p className="text-[10px] text-slate-400">{item.count} payment(s) processed</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold text-slate-900">{formatCurrency(item.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Filter Bar */}
      <Card className="p-4 bg-white border border-slate-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {/* Search */}
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <Input
              placeholder="Search reference, customer, or note..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          {/* Transaction Type Filter */}
          <div>
            <Select
              value={transactionTypeFilter}
              onValueChange={(val) => setTransactionTypeFilter(val as any)}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL" className="text-xs">All Types</SelectItem>
                <SelectItem value="POS_SALE" className="text-xs">POS Cash Sales</SelectItem>
                <SelectItem value="DUES_COLLECTION" className="text-xs">Dues Collections</SelectItem>
                <SelectItem value="TIP_RECEIVED" className="text-xs">Cash Tips</SelectItem>
                <SelectItem value="FLOAT_RECEIVED" className="text-xs">Float Received</SelectItem>
                <SelectItem value="EXPENSE_PAID" className="text-xs">Cash Expenses Paid</SelectItem>
                <SelectItem value="EXPENSE_REVERSAL_REFUND" className="text-xs">Reversal Refunds</SelectItem>
                <SelectItem value="HANDOVER_SETTLEMENT" className="text-xs">Vault Handovers</SelectItem>
                <SelectItem value="VARIANCE_ADJUSTMENT" className="text-xs">Variance Adjustments</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Start Date */}
          <div>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-9 text-xs"
              placeholder="Start Date"
            />
          </div>

          {/* End Date */}
          <div>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-9 text-xs"
              placeholder="End Date"
            />
          </div>

          {/* Reset Filters */}
          <div className="flex items-center gap-2">
            {(startDate || endDate || transactionTypeFilter !== 'ALL' || searchQuery) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                  setTransactionTypeFilter('ALL');
                  setSearchQuery('');
                }}
                className="h-9 text-xs text-slate-500 hover:text-slate-800"
              >
                <X className="w-3.5 h-3.5 mr-1" /> Reset
              </Button>
            )}
          </div>
        </div>

        {/* Carried Forward Balance Banner */}
        {startDate && (
          <div className="flex items-center justify-between text-xs bg-blue-50/70 border border-blue-100 rounded-lg px-3 py-1.5 text-blue-900">
            <span>
              Opening Balance Carried Forward prior to <span className="font-semibold">{formatDate(startDate)}</span>:
            </span>
            <span className="font-bold text-sm text-[#2254E1]">
              {formatCurrency(openingBalanceCarriedForward)}
            </span>
          </div>
        )}
      </Card>

      {/* Transaction Table */}
      <Card className="bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-slate-500" />
            <h3 className="font-semibold text-slate-800 text-sm">Custody Transaction Ledger</h3>
            <Badge variant="secondary" className="text-xs ml-1 font-semibold">
              {filteredTransactions.length}
            </Badge>
          </div>
          <span className="text-xs text-slate-400">Chronological running balance</span>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow>
                <TableHead className="w-[120px] text-xs font-semibold text-slate-600">Date & Time</TableHead>
                <TableHead className="w-[140px] text-xs font-semibold text-slate-600">Reference #</TableHead>
                <TableHead className="w-[150px] text-xs font-semibold text-slate-600">Type</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600">Description</TableHead>
                <TableHead className="text-right w-[110px] text-xs font-semibold text-slate-600">Cash In</TableHead>
                <TableHead className="text-right w-[110px] text-xs font-semibold text-slate-600">Cash Out</TableHead>
                <TableHead className="text-right w-[130px] text-xs font-semibold text-slate-600">Running Balance</TableHead>
                <TableHead className="w-[120px] text-xs font-semibold text-slate-600">Actor</TableHead>
                <TableHead className="text-center w-[80px] text-xs font-semibold text-slate-600">Document</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-xs text-slate-400">
                    Loading custody transactions...
                  </TableCell>
                </TableRow>
              ) : filteredTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-xs text-slate-400">
                    No cash custody transactions recorded for this period.
                  </TableCell>
                </TableRow>
              ) : (
                filteredTransactions.map((tx) => (
                  <TableRow key={tx.id} className="hover:bg-slate-50/60 transition-colors text-xs">
                    <TableCell className="font-mono text-slate-600">
                      <div>{formatDate(tx.date)}</div>
                      <div className="text-[10px] text-slate-400">{tx.time}</div>
                    </TableCell>
                    <TableCell className="font-mono font-medium text-slate-800">
                      {tx.referenceNumber}
                    </TableCell>
                    <TableCell>{getTypeBadge(tx.type)}</TableCell>
                    <TableCell className="max-w-[280px] truncate text-slate-700">
                      {tx.description}
                    </TableCell>
                    <TableCell className="text-right font-medium text-emerald-600">
                      {tx.cashIn > 0 ? `+ ${formatCurrency(tx.cashIn)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right font-medium text-rose-600">
                      {tx.cashOut > 0 ? `- ${formatCurrency(tx.cashOut)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right font-bold text-slate-900 font-mono">
                      {formatCurrency(tx.runningBalance)}
                    </TableCell>
                    <TableCell className="text-slate-600 truncate max-w-[120px]">
                      {tx.actorName}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedDocTransaction(tx);
                          setIsDocModalOpen(true);
                        }}
                        className="h-7 w-7 p-0 text-slate-500 hover:text-[#2254E1]"
                        title="View Linked Document"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Linked Document Modal */}
      <Dialog open={isDocModalOpen} onOpenChange={setIsDocModalOpen}>
        <DialogContent className="max-w-lg font-sans">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#2254E1]" />
              Linked Financial Document
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Audit snapshot of canonical document #{selectedDocTransaction?.referenceNumber}
            </DialogDescription>
          </DialogHeader>

          {selectedDocTransaction && (
            <div className="space-y-4 py-2 text-xs">
              <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Document Type:</span>
                  <Badge variant="outline" className="text-xs font-semibold uppercase">
                    {selectedDocTransaction.documentType}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Reference Number:</span>
                  <span className="font-mono font-bold text-slate-800">{selectedDocTransaction.referenceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Date & Time:</span>
                  <span className="font-medium text-slate-700">{formatDate(selectedDocTransaction.date)} at {selectedDocTransaction.time}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Logged Custodian / Actor:</span>
                  <span className="font-medium text-slate-700">{selectedDocTransaction.actorName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Cash Flow:</span>
                  <span className={`font-bold ${selectedDocTransaction.cashIn > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {selectedDocTransaction.cashIn > 0
                      ? `+ ${formatCurrency(selectedDocTransaction.cashIn)} (Cash In)`
                      : `- ${formatCurrency(selectedDocTransaction.cashOut)} (Cash Out)`}
                  </span>
                </div>
              </div>

              <div>
                <span className="font-semibold text-slate-700 block mb-1">Description / Notes:</span>
                <p className="text-slate-600 bg-white border border-slate-200 p-2.5 rounded-md leading-relaxed">
                  {selectedDocTransaction.description}
                </p>
              </div>

              {selectedDocTransaction.rawEntity && (
                <div className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded border border-slate-200">
                  <p className="font-semibold text-slate-700 mb-1">Entity Metadata:</p>
                  <pre className="overflow-x-auto text-[10px] text-slate-600 font-mono">
                    {JSON.stringify(
                      {
                        id: selectedDocTransaction.rawEntity.id,
                        status: selectedDocTransaction.rawEntity.status,
                        clientName: selectedDocTransaction.rawEntity.clientName,
                        voucherNumber: selectedDocTransaction.rawEntity.voucherNumber,
                        settlementNumber: selectedDocTransaction.rawEntity.settlementNumber,
                        total: selectedDocTransaction.rawEntity.total,
                        amount: selectedDocTransaction.rawEntity.amount,
                      },
                      null,
                      2
                    )}
                  </pre>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsDocModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Printable Statement Modal */}
      <Dialog open={isPrintModalOpen} onOpenChange={setIsPrintModalOpen}>
        <DialogContent className="max-w-3xl font-sans">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              Print Cash Custody Statement
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Preview printable statement for {summary?.user.name} ({summary?.branch.name})
            </DialogDescription>
          </DialogHeader>

          <div ref={printAreaRef} className="p-4 border border-slate-200 rounded-lg bg-white space-y-4 max-h-[60vh] overflow-y-auto text-xs">
            {/* Header */}
            <div className="border-b border-slate-300 pb-3 flex justify-between items-start">
              <div>
                <h2 className="text-lg font-bold text-slate-900">iSysware SalonOS</h2>
                <p className="text-xs text-slate-600">Cash Custody Statement & Continuous Reconciliation</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Branch: <span className="font-medium text-slate-800">{summary?.branch.name} ({summary?.branch.code})</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-slate-800">Custodian: {summary?.user.name}</p>
                <p className="text-[11px] text-slate-500">Role: {summary?.user.role}</p>
                <p className="text-[10px] text-slate-400 mt-1">Printed: {new Date().toLocaleString()}</p>
              </div>
            </div>

            {/* Summary Grid */}
            <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded border border-slate-200 text-[11px]">
              <div>
                <span className="text-slate-500 block">Opening Float:</span>
                <span className="font-bold text-slate-800">{formatCurrency(summary?.openingCash || 0)}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Total Inflows:</span>
                <span className="font-bold text-emerald-700">
                  + {formatCurrency(
                    (summary?.cashSalesTotal || 0) +
                    (summary?.previousDuesCollectedTotal || 0) +
                    (summary?.cashTipsTotal || 0) +
                    (summary?.floatReceivedTotal || 0) +
                    (summary?.cashReversalsRefundTotal || 0)
                  )}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Total Outflows:</span>
                <span className="font-bold text-rose-700">
                  - {formatCurrency(
                    (summary?.cashExpensesPaidTotal || 0) +
                    (summary?.approvedHandoversTotal || 0)
                  )}
                </span>
              </div>
              <div className="col-span-3 pt-2 mt-1 border-t border-slate-200 flex justify-between items-center text-sm font-bold text-slate-900">
                <span>Expected Cash In Custody:</span>
                <span className="text-[#2254E1]">{formatCurrency(summary?.expectedCashInCustody || 0)}</span>
              </div>
            </div>

            {/* Transactions table */}
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600 bg-slate-50">
                  <th className="py-1 text-left">Date</th>
                  <th className="py-1 text-left">Ref #</th>
                  <th className="py-1 text-left">Type</th>
                  <th className="py-1 text-left">Description</th>
                  <th className="py-1 text-right">In</th>
                  <th className="py-1 text-right">Out</th>
                  <th className="py-1 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-slate-100">
                    <td className="py-1 text-slate-600">{tx.date}</td>
                    <td className="py-1 font-mono font-medium text-slate-800">{tx.referenceNumber}</td>
                    <td className="py-1">{tx.type}</td>
                    <td className="py-1 text-slate-700 max-w-[180px] truncate">{tx.description}</td>
                    <td className="py-1 text-right text-emerald-600">{tx.cashIn > 0 ? formatCurrency(tx.cashIn) : '—'}</td>
                    <td className="py-1 text-right text-rose-600">{tx.cashOut > 0 ? formatCurrency(tx.cashOut) : '—'}</td>
                    <td className="py-1 text-right font-bold text-slate-900">{formatCurrency(tx.runningBalance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Signatures */}
            <div className="pt-8 grid grid-cols-2 gap-8 text-center text-xs text-slate-600">
              <div>
                <div className="border-t border-slate-400 pt-1 font-medium">Custodian Signature: {summary?.user.name}</div>
              </div>
              <div>
                <div className="border-t border-slate-400 pt-1 font-medium">Audited / Verified By Manager</div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsPrintModalOpen(false)}>
              Close
            </Button>
            <Button size="sm" onClick={handlePrint} className="bg-[#2254E1] hover:bg-[#1B43B4] text-white">
              <Printer className="w-3.5 h-3.5 mr-1.5" />
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
