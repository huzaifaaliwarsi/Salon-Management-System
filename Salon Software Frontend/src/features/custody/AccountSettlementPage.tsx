import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from '@/context/RouterContext';
import { salonService } from '@/services';
import {
  Settlement,
  SettlementStatus,
  CashDrawer,
  CreateSettlementInput,
  ApproveSettlementInput,
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
  Plus,
  Printer,
  Eye,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Building2,
  Banknote,
  ArrowRightLeft,
  Check,
  X,
  FileText,
  Calculator,
  ShieldCheck,
  Scale,
  Lock,
} from 'lucide-react';

const DENOMINATIONS = [5000, 1000, 500, 100, 50, 20, 10];

export const AccountSettlementPage: React.FC = () => {
  const { user, activeBranchId, allBranches } = useAuth();
  const { navigate } = useRouter();

  // Role guard: Super Admin, Admin, and Accountant
  if (!user || user.role === 'STAFF') {
    return <AccessDeniedView attemptedPath="/accounts/account-settlement" />;
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const isAdmin = user.role === 'ADMIN';
  const isAccountant = user.role === 'ACCOUNTANT';
  const canReview = isSuperAdmin || isAdmin;

  // Tabs: 'MY_SETTLEMENTS' or 'REVIEW_QUEUE'
  const [activeTab, setActiveTab] = useState<'MY_SETTLEMENTS' | 'REVIEW_QUEUE'>('MY_SETTLEMENTS');

  // Branch scope
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    isSuperAdmin ? activeBranchId && activeBranchId !== 'ALL' ? activeBranchId : (user.branchId || allBranches[0]?.id || '') : (user.branchId as string)
  );

  useEffect(() => {
    if (isSuperAdmin && activeBranchId && activeBranchId !== 'ALL') {
      setSelectedBranchId(activeBranchId);
    }
  }, [activeBranchId, isSuperAdmin]);

  // Main state
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [myDrawers, setMyDrawers] = useState<CashDrawer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | SettlementStatus>('ALL');

  // Modals state
  const [isNewSettlementModalOpen, setIsNewSettlementModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [selectedSettlement, setSelectedSettlement] = useState<Settlement | null>(null);

  // New Settlement Form state
  const [formDrawerId, setFormDrawerId] = useState('');
  const [formExpectedCash, setFormExpectedCash] = useState(0);
  const [formCountedCash, setFormCountedCash] = useState<number | ''>('');
  const [formHandoverAmount, setFormHandoverAmount] = useState<number | ''>('');
  const [formRetainedFloat, setFormRetainedFloat] = useState<number | ''>(0);
  const [formVarianceExplanation, setFormVarianceExplanation] = useState('');
  const [formDestinationVaultName, setFormDestinationVaultName] = useState('Main Branch Safe');
  const [formNotes, setFormNotes] = useState('');
  const [formDenominations, setFormDenominations] = useState<Record<number, number>>({
    5000: 0,
    1000: 0,
    500: 0,
    100: 0,
    50: 0,
    20: 0,
    10: 0,
  });
  const [showDenominations, setShowDenominations] = useState(false);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);

  // Approval Form state
  const [approvalActualCash, setApprovalActualCash] = useState<number | ''>('');
  const [approvalAcceptVariance, setApprovalAcceptVariance] = useState(false);
  const [approvalDestinationVault, setApprovalDestinationVault] = useState('Main Branch Vault');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);

  // Rejection Form state
  const [rejectionReason, setRejectionReason] = useState('');
  const [isSubmittingRejection, setIsSubmittingRejection] = useState(false);

  // Load settlements and user drawers
  const loadData = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const list = await salonService.getSettlements(selectedBranchId, undefined, user);
      setSettlements(list);

      // Load open drawers for this user
      const drawers = await salonService.getCashDrawers(selectedBranchId, user.id);
      setMyDrawers(drawers);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load settlements.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedBranchId, activeTab]);

  // When drawer is selected in New Settlement form, fetch its expected cash
  useEffect(() => {
    async function fetchDrawerCustody() {
      if (!user || !formDrawerId) {
        setFormExpectedCash(0);
        return;
      }
      try {
        const res = await salonService.getCashCustodyStatement(
          { branchId: selectedBranchId, userId: user.id, drawerId: formDrawerId },
          user
        );
        const expected = res.summary.expectedCashInCustody;
        setFormExpectedCash(expected);
      } catch {
        const d = myDrawers.find((item) => item.id === formDrawerId);
        setFormExpectedCash(d?.expectedInDrawer || 0);
      }
    }
    if (isNewSettlementModalOpen) {
      fetchDrawerCustody();
    }
  }, [formDrawerId, isNewSettlementModalOpen]);

  // Denominations sum helper
  const handleDenominationChange = (denom: number, count: number) => {
    const updated = { ...formDenominations, [denom]: Math.max(0, count || 0) };
    setFormDenominations(updated);
    let total = 0;
    for (const d of DENOMINATIONS) {
      total += d * (updated[d] || 0);
    }
    setFormCountedCash(total);
  };

  // Calculated variance in form
  const formVariance = useMemo(() => {
    const counted = typeof formCountedCash === 'number' ? formCountedCash : 0;
    return counted - formExpectedCash;
  }, [formCountedCash, formExpectedCash]);

  // Filtered settlements by active tab and search
  const displayedSettlements = useMemo(() => {
    return settlements.filter((s) => {
      // Tab filter
      if (activeTab === 'MY_SETTLEMENTS') {
        if (s.submittedByUserId !== user.id) return false;
      } else if (activeTab === 'REVIEW_QUEUE') {
        if (s.status !== 'SUBMITTED' && s.status !== 'PENDING_VERIFICATION') return false;
      }

      // Status filter
      if (statusFilter !== 'ALL' && s.status !== statusFilter) {
        return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesNum = s.settlementNumber.toLowerCase().includes(q);
        const matchesSubmitter = s.submittedByName.toLowerCase().includes(q);
        const matchesNotes = (s.notes || '').toLowerCase().includes(q);
        if (!matchesNum && !matchesSubmitter && !matchesNotes) return false;
      }

      return true;
    });
  }, [settlements, activeTab, statusFilter, searchQuery, user.id]);

  const reviewQueueCount = useMemo(() => {
    return settlements.filter((s) => s.status === 'SUBMITTED' || s.status === 'PENDING_VERIFICATION').length;
  }, [settlements]);

  // Open New Settlement Modal
  const handleOpenNewSettlement = () => {
    const openDrawer = myDrawers.find((d) => d.status === 'OPEN') || myDrawers[0];
    setFormDrawerId(openDrawer ? openDrawer.id : '');
    setFormCountedCash('');
    setFormHandoverAmount('');
    setFormRetainedFloat(0);
    setFormVarianceExplanation('');
    setFormNotes('');
    setFormDenominations({ 5000: 0, 1000: 0, 500: 0, 100: 0, 50: 0, 20: 0, 10: 0 });
    setShowDenominations(false);
    setErrorMessage(null);
    setIsNewSettlementModalOpen(true);
  };

  // Submit Settlement Handler
  const handleSubmitSettlement = async (isDraft: boolean) => {
    setErrorMessage(null);
    const counted = typeof formCountedCash === 'number' ? formCountedCash : 0;
    const handover = typeof formHandoverAmount === 'number' ? formHandoverAmount : 0;
    const retained = typeof formRetainedFloat === 'number' ? formRetainedFloat : 0;

    if (!formDrawerId) {
      setErrorMessage('Please select a cash drawer.');
      return;
    }
    if (counted < 0 || handover < 0 || retained < 0) {
      setErrorMessage('Amounts must be non-negative.');
      return;
    }
    if (handover + retained !== counted) {
      setErrorMessage(
        `Proposed handover (${formatCurrency(handover)}) + Retained float (${formatCurrency(retained)}) must equal total counted cash (${formatCurrency(counted)}).`
      );
      return;
    }
    if (!isDraft && Math.abs(formVariance) > 0.001 && !formVarianceExplanation.trim()) {
      setErrorMessage(
        `A variance explanation is required for a cash shortage or overage of ${formatCurrency(formVariance)}.`
      );
      return;
    }

    setIsSubmittingForm(true);
    try {
      const payload: CreateSettlementInput = {
        drawerId: formDrawerId,
        branchId: selectedBranchId,
        countedCash: counted,
        handoverAmount: handover,
        retainedFloat: retained,
        varianceExplanation: formVarianceExplanation.trim() || undefined,
        destinationVaultName: formDestinationVaultName.trim() || 'Main Safe',
        denominationBreakdown: showDenominations ? (formDenominations as any) : undefined,
        notes: formNotes.trim() || undefined,
      };

      if (isDraft) {
        await salonService.createSettlementDraft(payload, user);
        setSuccessMessage('Settlement draft saved successfully.');
      } else {
        await salonService.submitSettlement(payload, user);
        setSuccessMessage('Settlement submitted for manager review. The cash drawer is now locked against further postings.');
      }

      setIsNewSettlementModalOpen(false);
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit settlement.');
    } finally {
      setIsSubmittingForm(false);
    }
  };

  // Open Approval Modal
  const handleOpenApproveModal = (settlement: Settlement) => {
    setSelectedSettlement(settlement);
    setApprovalActualCash(settlement.handoverAmount ?? settlement.amount);
    setApprovalAcceptVariance(false);
    setApprovalDestinationVault(settlement.destinationVaultName || 'Main Branch Vault');
    setApprovalNotes('');
    setErrorMessage(null);
    setIsApproveModalOpen(true);
  };

  // Submit Approval Handler
  const handleSubmitApproval = async () => {
    if (!selectedSettlement) return;
    setErrorMessage(null);

    const actualReceived = typeof approvalActualCash === 'number' ? approvalActualCash : 0;
    const submittedHandover = selectedSettlement.handoverAmount ?? selectedSettlement.amount;

    if (actualReceived !== submittedHandover) {
      setErrorMessage(
        `Count disputed: Actual cash received (${formatCurrency(actualReceived)}) does not match submitted handover (${formatCurrency(submittedHandover)}). Disputed settlements must be rejected for recounting rather than altered.`
      );
      return;
    }

    if (selectedSettlement.variance && Math.abs(selectedSettlement.variance) > 0.001 && !approvalAcceptVariance) {
      setErrorMessage('Manager variance acceptance confirmation is required to approve a non-zero variance.');
      return;
    }

    setIsSubmittingApproval(true);
    try {
      const input: ApproveSettlementInput = {
        actualCashReceived: actualReceived,
        acceptVariance: approvalAcceptVariance,
        destinationVaultName: approvalDestinationVault,
        notes: approvalNotes.trim() || undefined,
      };

      await salonService.approveSettlement(selectedSettlement.id, input, user);
      setSuccessMessage(`Settlement ${selectedSettlement.settlementNumber} approved and cash custody received into vault.`);
      setIsApproveModalOpen(false);
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to approve settlement.');
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  // Open Rejection Modal
  const handleOpenRejectModal = (settlement: Settlement) => {
    setSelectedSettlement(settlement);
    setRejectionReason('');
    setErrorMessage(null);
    setIsRejectModalOpen(true);
  };

  // Submit Rejection Handler
  const handleSubmitRejection = async () => {
    if (!selectedSettlement) return;
    if (!rejectionReason.trim()) {
      setErrorMessage('A rejection reason is required.');
      return;
    }

    setIsSubmittingRejection(true);
    try {
      await salonService.rejectSettlement(selectedSettlement.id, rejectionReason.trim(), user);
      setSuccessMessage(`Settlement ${selectedSettlement.settlementNumber} rejected. The cash drawer has been unlocked.`);
      setIsRejectModalOpen(false);
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to reject settlement.');
    } finally {
      setIsSubmittingRejection(false);
    }
  };

  // Status Badge Component
  const getStatusBadge = (status: SettlementStatus) => {
    switch (status) {
      case 'DRAFT':
        return <Badge className="bg-slate-100 text-slate-700 border-slate-200">Draft</Badge>;
      case 'SUBMITTED':
      case 'PENDING_VERIFICATION':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200 animate-pulse">Submitted</Badge>;
      case 'APPROVED':
      case 'APPROVED_TRANSFERRED':
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Approved & Received</Badge>;
      case 'REJECTED':
        return <Badge className="bg-rose-100 text-rose-800 border-rose-200">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 font-sans">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#2254E1]/10 flex items-center justify-center text-[#2254E1]">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Account Settlement</h1>
              <p className="text-xs text-slate-500 font-medium">Cash Custody Handover, Reconciliation & Safe Transfers</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Branch selector for Super Admin */}
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

          {/* Quick link to Balance Sheet */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/accounts/my-balance-sheet')}
            className="text-xs h-9 font-medium gap-1.5 text-slate-700 bg-white"
          >
            <Scale className="w-3.5 h-3.5 text-[#2254E1]" />
            My Balance Sheet
          </Button>

          {/* New Settlement Button */}
          <Button
            size="sm"
            onClick={handleOpenNewSettlement}
            className="bg-[#2254E1] hover:bg-[#1B43B4] text-white text-xs h-9 font-medium gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Settlement
          </Button>
        </div>
      </div>

      {/* Alert Messages */}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-4 py-3 rounded-lg flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs px-4 py-3 rounded-lg flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200 flex items-center justify-between">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveTab('MY_SETTLEMENTS')}
            className={`py-2.5 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'MY_SETTLEMENTS'
                ? 'border-[#2254E1] text-[#2254E1]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            My Settlements
          </button>

          {canReview && (
            <button
              onClick={() => setActiveTab('REVIEW_QUEUE')}
              className={`py-2.5 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'REVIEW_QUEUE'
                  ? 'border-[#2254E1] text-[#2254E1]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Review Queue
              {reviewQueueCount > 0 && (
                <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {reviewQueueCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="p-4 bg-white border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex-1 w-full sm:w-auto relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <Input
              placeholder="Search settlement #, submitter, or notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Select
              value={statusFilter}
              onValueChange={(val) => setStatusFilter(val as any)}
            >
              <SelectTrigger className="w-[160px] h-9 text-xs">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL" className="text-xs">All Statuses</SelectItem>
                <SelectItem value="DRAFT" className="text-xs">Draft</SelectItem>
                <SelectItem value="SUBMITTED" className="text-xs">Submitted</SelectItem>
                <SelectItem value="APPROVED" className="text-xs">Approved</SelectItem>
                <SelectItem value="REJECTED" className="text-xs">Rejected</SelectItem>
              </SelectContent>
            </Select>

            {(searchQuery || statusFilter !== 'ALL') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                }}
                className="h-9 text-xs text-slate-500 hover:text-slate-800"
              >
                <X className="w-3.5 h-3.5 mr-1" /> Reset
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Settlement Table */}
      <Card className="bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Banknote className="w-4 h-4 text-slate-500" />
            <h3 className="font-semibold text-slate-800 text-sm">
              {activeTab === 'MY_SETTLEMENTS' ? 'My Drawer Settlements' : 'Manager Review & Handover Queue'}
            </h3>
            <Badge variant="secondary" className="text-xs ml-1 font-semibold">
              {displayedSettlements.length}
            </Badge>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow>
                <TableHead className="w-[150px] text-xs font-semibold text-slate-600">Settlement #</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600">Submitter</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600">Cutoff Time</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">Expected</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">Counted</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">Variance</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">Handover</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">Retained Float</TableHead>
                <TableHead className="text-center text-xs font-semibold text-slate-600">Status</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600">Reviewer</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-32 text-center text-xs text-slate-400">
                    Loading settlements...
                  </TableCell>
                </TableRow>
              ) : displayedSettlements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-32 text-center text-xs text-slate-400">
                    No settlements found matching the criteria.
                  </TableCell>
                </TableRow>
              ) : (
                displayedSettlements.map((s) => {
                  const isOwnSubmission = s.submittedByUserId === user.id;
                  const canApproveThis = canReview && !isOwnSubmission && (s.status === 'SUBMITTED' || s.status === 'PENDING_VERIFICATION');

                  return (
                    <TableRow key={s.id} className="hover:bg-slate-50/60 transition-colors text-xs">
                      <TableCell className="font-mono font-medium text-slate-900">
                        {s.settlementNumber}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-slate-800">{s.submittedByName}</div>
                        <div className="text-[10px] text-slate-400">{s.submittedByRole}</div>
                      </TableCell>
                      <TableCell className="font-mono text-slate-600">
                        <div>{formatDate(s.date)}</div>
                        <div className="text-[10px] text-slate-400">{s.time}</div>
                      </TableCell>
                      <TableCell className="text-right font-medium text-slate-800">
                        {formatCurrency(s.expectedCash || 0)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-slate-900">
                        {formatCurrency(s.countedCash || 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={`font-semibold ${
                            (s.variance || 0) === 0
                              ? 'text-emerald-600'
                              : (s.variance || 0) > 0
                              ? 'text-amber-600'
                              : 'text-rose-600'
                          }`}
                        >
                          {(s.variance || 0) > 0 ? '+' : ''}
                          {formatCurrency(s.variance || 0)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-bold text-slate-900">
                        {formatCurrency(s.handoverAmount ?? s.amount ?? 0)}
                      </TableCell>
                      <TableCell className="text-right text-slate-700">
                        {formatCurrency(s.retainedFloat || 0)}
                      </TableCell>
                      <TableCell className="text-center">
                        {getStatusBadge(s.status)}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {s.receivedByName ? (
                          <div>
                            <div>{s.receivedByName}</div>
                            {s.reviewedAt && (
                              <div className="text-[10px] text-slate-400">
                                {new Date(s.reviewedAt).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View details */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedSettlement(s);
                              setIsViewModalOpen(true);
                            }}
                            className="h-7 w-7 p-0 text-slate-500 hover:text-[#2254E1]"
                            title="View Settlement Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>

                          {/* Print */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedSettlement(s);
                              setIsPrintModalOpen(true);
                            }}
                            className="h-7 w-7 p-0 text-slate-500 hover:text-slate-800"
                            title="Print Settlement Receipt"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </Button>

                          {/* Approve (Only for managers in Review Queue or submitted status) */}
                          {canReview && (s.status === 'SUBMITTED' || s.status === 'PENDING_VERIFICATION') && (
                            <>
                              <Button
                                size="sm"
                                disabled={isOwnSubmission}
                                onClick={() => handleOpenApproveModal(s)}
                                className={`h-7 px-2 text-[11px] font-medium ${
                                  isOwnSubmission
                                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                }`}
                                title={
                                  isOwnSubmission
                                    ? 'Independent review required. You cannot approve your own settlement.'
                                    : 'Approve & Receive Handover'
                                }
                              >
                                <Check className="w-3 h-3 mr-1" />
                                Approve
                              </Button>

                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isOwnSubmission}
                                onClick={() => handleOpenRejectModal(s)}
                                className={`h-7 px-2 text-[11px] font-medium ${
                                  isOwnSubmission
                                    ? 'text-slate-300 border-slate-200 cursor-not-allowed'
                                    : 'text-rose-600 border-rose-200 hover:bg-rose-50'
                                }`}
                                title={
                                  isOwnSubmission
                                    ? 'You cannot reject your own settlement.'
                                    : 'Reject with Reason'
                                }
                              >
                                <X className="w-3 h-3 mr-1" />
                                Reject
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* ========================================================================= */}
      {/* MODAL 1: NEW SETTLEMENT FORM                                              */}
      {/* ========================================================================= */}
      <Dialog open={isNewSettlementModalOpen} onOpenChange={setIsNewSettlementModalOpen}>
        <DialogContent className="max-w-2xl font-sans max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-[#2254E1]" />
              New Cash Drawer Settlement
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Count drawer cash, calculate variance, and prepare physical handover for manager verification.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {/* Drawer Selection */}
            <div>
              <label className="font-semibold text-slate-700 block mb-1.5">Select Cash Drawer / Shift *</label>
              <Select value={formDrawerId} onValueChange={(val) => setFormDrawerId(val)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select owned drawer..." />
                </SelectTrigger>
                <SelectContent>
                  {myDrawers
                    .filter((d) => d.status === 'OPEN')
                    .map((d) => (
                      <SelectItem key={d.id} value={d.id} className="text-xs">
                        Drawer #{d.id.slice(-6).toUpperCase()} ({formatDate(d.date)}) — Expected: {formatCurrency(d.expectedInDrawer)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {myDrawers.filter((d) => d.status === 'OPEN').length === 0 && (
                <p className="text-[11px] text-amber-600 mt-1">
                  No open drawers available. All your drawers are already settled or pending review.
                </p>
              )}
            </div>

            {/* Expected vs Counted Comparison Banner */}
            <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
              <div>
                <span className="text-slate-500 block text-[11px]">System Expected Cash:</span>
                <span className="font-bold text-sm text-slate-900">{formatCurrency(formExpectedCash)}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Physically Counted:</span>
                <span className="font-bold text-sm text-slate-900">
                  {typeof formCountedCash === 'number' ? formatCurrency(formCountedCash) : 'PKR 0.00'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Variance:</span>
                <span
                  className={`font-bold text-sm ${
                    formVariance === 0
                      ? 'text-emerald-600'
                      : formVariance > 0
                      ? 'text-amber-600'
                      : 'text-rose-600'
                  }`}
                >
                  {formVariance > 0 ? '+' : ''}
                  {formatCurrency(formVariance)}
                </span>
              </div>
            </div>

            {/* Physical Count Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-700">Total Counted Physical Cash (PKR) *</label>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => setShowDenominations(!showDenominations)}
                  className="h-6 text-[11px] text-[#2254E1] hover:text-[#1B43B4] p-0"
                >
                  <Calculator className="w-3 h-3 mr-1" />
                  {showDenominations ? 'Hide Denominations' : 'Use Denomination Counter'}
                </Button>
              </div>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={formCountedCash}
                onChange={(e) => setFormCountedCash(e.target.value === '' ? '' : parseFloat(e.target.value))}
                className="h-9 text-xs font-mono font-medium"
              />
            </div>

            {/* Optional Denomination Breakdown Counter */}
            {showDenominations && (
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
                <span className="text-[11px] font-semibold text-slate-700 block">Currency Denomination Breakdown:</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {DENOMINATIONS.map((denom) => (
                    <div key={denom} className="space-y-1">
                      <label className="text-[10px] text-slate-500 block">PKR {denom} x Notes</label>
                      <Input
                        type="number"
                        min="0"
                        value={formDenominations[denom] || ''}
                        onChange={(e) => handleDenominationChange(denom, parseInt(e.target.value, 10) || 0)}
                        className="h-7 text-xs font-mono bg-white"
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Required Variance Explanation if variance != 0 */}
            {Math.abs(formVariance) > 0.001 && (
              <div className="bg-rose-50/70 border border-rose-200 p-3 rounded-lg space-y-1.5">
                <div className="flex items-center gap-1.5 text-rose-800 font-semibold text-xs">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Non-Zero Variance Explanation Required *
                </div>
                <p className="text-[11px] text-rose-600">
                  {formVariance > 0
                    ? `Physical cash exceeds expected balance by ${formatCurrency(formVariance)} (Cash Overage).`
                    : `Physical cash is less than expected balance by ${formatCurrency(Math.abs(formVariance))} (Cash Shortage).`}
                  {' '}Please record the investigation reason for manager auditing.
                </p>
                <Input
                  placeholder="Reason for discrepancy (e.g. unrecorded tip, change rounding, customer recount)..."
                  value={formVarianceExplanation}
                  onChange={(e) => setFormVarianceExplanation(e.target.value)}
                  className="h-8 text-xs bg-white border-rose-200"
                />
              </div>
            )}

            {/* Handover & Retained Float Allocation */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 block">Proposed Handover to Safe (PKR) *</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={formHandoverAmount}
                  onChange={(e) => setFormHandoverAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="h-9 text-xs font-mono"
                />
                <span className="text-[10px] text-slate-400">Cash deposited into main safe</span>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 block">Retained Float for Next Shift (PKR)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={formRetainedFloat}
                  onChange={(e) => setFormRetainedFloat(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="h-9 text-xs font-mono"
                />
                <span className="text-[10px] text-slate-400">Carried forward into successor drawer</span>
              </div>
            </div>

            {/* Destination Safe & Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 block">Destination Safe / Vault</label>
                <Input
                  value={formDestinationVaultName}
                  onChange={(e) => setFormDestinationVaultName(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 block">Submission Notes</label>
                <Input
                  placeholder="Optional shift notes..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {/* Handover + Retained Sum Validation Notice */}
            <div className="text-[11px] flex justify-between items-center bg-slate-50 p-2.5 rounded border border-slate-200">
              <span className="text-slate-500">
                Handover ({formatCurrency(typeof formHandoverAmount === 'number' ? formHandoverAmount : 0)}) + Retained ({formatCurrency(typeof formRetainedFloat === 'number' ? formRetainedFloat : 0)}):
              </span>
              <span className="font-bold text-slate-800">
                {formatCurrency((typeof formHandoverAmount === 'number' ? formHandoverAmount : 0) + (typeof formRetainedFloat === 'number' ? formRetainedFloat : 0))}
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setIsNewSettlementModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isSubmittingForm}
              onClick={() => handleSubmitSettlement(true)}
              className="text-slate-700"
            >
              Save Draft
            </Button>
            <Button
              size="sm"
              disabled={isSubmittingForm}
              onClick={() => handleSubmitSettlement(false)}
              className="bg-[#2254E1] hover:bg-[#1B43B4] text-white"
            >
              {isSubmittingForm ? 'Submitting...' : 'Submit Settlement'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL 2: VIEW SETTLEMENT DETAILS                                          */}
      {/* ========================================================================= */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-lg font-sans">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#2254E1]" />
              Settlement Snapshot #{selectedSettlement?.settlementNumber}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Audit snapshot frozen at submission cutoff
            </DialogDescription>
          </DialogHeader>

          {selectedSettlement && (
            <div className="space-y-3.5 py-2 text-xs">
              <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Status:</span>
                  <div>{getStatusBadge(selectedSettlement.status)}</div>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Submitted By:</span>
                  <span className="font-semibold text-slate-800">{selectedSettlement.submittedByName} ({selectedSettlement.submittedByRole})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Cutoff Date & Time:</span>
                  <span className="font-medium text-slate-700">{formatDate(selectedSettlement.date)} at {selectedSettlement.time}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Destination Safe:</span>
                  <span className="font-medium text-slate-700">{selectedSettlement.destinationVaultName || 'Main Safe'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <span className="text-[11px] text-slate-500 block">Expected Cash:</span>
                  <span className="font-bold text-sm text-slate-800">{formatCurrency(selectedSettlement.expectedCash || 0)}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Counted Cash:</span>
                  <span className="font-bold text-sm text-slate-900">{formatCurrency(selectedSettlement.countedCash || 0)}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Handover Amount:</span>
                  <span className="font-bold text-sm text-[#2254E1]">{formatCurrency(selectedSettlement.handoverAmount ?? selectedSettlement.amount ?? 0)}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Retained Float:</span>
                  <span className="font-bold text-sm text-slate-800">{formatCurrency(selectedSettlement.retainedFloat || 0)}</span>
                </div>
                <div className="col-span-2 pt-1 border-t border-slate-200 flex justify-between items-center">
                  <span className="text-slate-500">Variance:</span>
                  <span
                    className={`font-bold ${
                      (selectedSettlement.variance || 0) === 0
                        ? 'text-emerald-600'
                        : (selectedSettlement.variance || 0) > 0
                        ? 'text-amber-600'
                        : 'text-rose-600'
                    }`}
                  >
                    {(selectedSettlement.variance || 0) > 0 ? '+' : ''}
                    {formatCurrency(selectedSettlement.variance || 0)}
                  </span>
                </div>
              </div>

              {selectedSettlement.varianceExplanation && (
                <div className="bg-amber-50 p-2.5 rounded border border-amber-200 text-amber-900">
                  <span className="font-semibold block mb-0.5">Variance Explanation:</span>
                  <p className="text-[11px] leading-relaxed">{selectedSettlement.varianceExplanation}</p>
                </div>
              )}

              {selectedSettlement.rejectionReason && (
                <div className="bg-rose-50 p-2.5 rounded border border-rose-200 text-rose-900">
                  <span className="font-semibold block mb-0.5">Rejection Reason:</span>
                  <p className="text-[11px] leading-relaxed">{selectedSettlement.rejectionReason}</p>
                </div>
              )}

              {selectedSettlement.notes && (
                <div>
                  <span className="font-semibold text-slate-700 block mb-1">Notes:</span>
                  <p className="text-slate-600 bg-white border border-slate-200 p-2 rounded leading-relaxed text-[11px]">
                    {selectedSettlement.notes}
                  </p>
                </div>
              )}

              {selectedSettlement.receivedByName && (
                <div className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded border border-slate-200 flex justify-between">
                  <span>Reviewed / Received By:</span>
                  <span className="font-semibold text-slate-700">{selectedSettlement.receivedByName}</span>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsViewModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL 3: APPROVE & RECEIVE (MANAGER)                                      */}
      {/* ========================================================================= */}
      <Dialog open={isApproveModalOpen} onOpenChange={setIsApproveModalOpen}>
        <DialogContent className="max-w-md font-sans">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Approve Settlement & Receive Cash Handover
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Verify actual physical cash received before debiting drawer and crediting vault safe.
            </DialogDescription>
          </DialogHeader>

          {selectedSettlement && (
            <div className="space-y-4 py-2 text-xs">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Settlement:</span>
                  <span className="font-mono font-bold text-slate-800">{selectedSettlement.settlementNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Submitter:</span>
                  <span className="font-semibold text-slate-800">{selectedSettlement.submittedByName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Submitted Handover:</span>
                  <span className="font-bold text-sm text-[#2254E1]">
                    {formatCurrency(selectedSettlement.handoverAmount ?? selectedSettlement.amount ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Submitted Retained Float:</span>
                  <span className="font-medium text-slate-700">
                    {formatCurrency(selectedSettlement.retainedFloat || 0)}
                  </span>
                </div>
              </div>

              {/* Confirm Actual Cash Received */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 block">Actual Cash Received by Manager (PKR) *</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={approvalActualCash}
                  onChange={(e) => setApprovalActualCash(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="h-9 text-xs font-mono font-bold"
                />
                <p className="text-[10px] text-slate-400">
                  Disputed count? If physical cash received does not match submitted amount, reject the settlement for custodian recount instead of modifying figures.
                </p>
              </div>

              {/* Explicit Variance Acceptance Checkbox */}
              {selectedSettlement.variance && Math.abs(selectedSettlement.variance) > 0.001 && (
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg space-y-2">
                  <div className="flex items-center gap-1.5 text-amber-900 font-semibold text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    Manager Variance Acceptance
                  </div>
                  <p className="text-[11px] text-amber-800">
                    This drawer has an audited variance of{' '}
                    <span className="font-bold">{formatCurrency(selectedSettlement.variance)}</span>. Approving will create an auditable Cash Variance Adjustment (CVA) linked to this settlement.
                  </p>
                  <label className="flex items-start gap-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={approvalAcceptVariance}
                      onChange={(e) => setApprovalAcceptVariance(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-[#2254E1] focus:ring-0"
                    />
                    <span className="text-[11px] text-amber-950 font-medium">
                      I have verified and explicitly accept this variance adjustment.
                    </span>
                  </label>
                </div>
              )}

              {/* Review notes */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 block">Review Notes</label>
                <Input
                  placeholder="Optional manager handover receipt notes..."
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsApproveModalOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isSubmittingApproval}
              onClick={handleSubmitApproval}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
            >
              {isSubmittingApproval ? 'Receiving...' : 'Confirm & Receive Handover'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL 4: REJECT WITH REASON (MANAGER)                                     */}
      {/* ========================================================================= */}
      <Dialog open={isRejectModalOpen} onOpenChange={setIsRejectModalOpen}>
        <DialogContent className="max-w-md font-sans">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <XCircle className="w-4 h-4 text-rose-600" />
              Reject Settlement for Correction
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Rejecting unlocks the submitted drawer so the custodian can recount and correct figures. No funds will be moved.
            </DialogDescription>
          </DialogHeader>

          {selectedSettlement && (
            <div className="space-y-3 py-2 text-xs">
              <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                <p className="text-slate-600 font-medium">
                  Settlement #{selectedSettlement.settlementNumber} ({selectedSettlement.submittedByName})
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Counted: {formatCurrency(selectedSettlement.countedCash || 0)} | Proposed Handover: {formatCurrency(selectedSettlement.handoverAmount ?? selectedSettlement.amount ?? 0)}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 block">Rejection Reason *</label>
                <Input
                  placeholder="Explain why the settlement is being returned for recount or correction..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsRejectModalOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isSubmittingRejection}
              onClick={handleSubmitRejection}
              className="bg-rose-600 hover:bg-rose-700 text-white text-xs"
            >
              {isSubmittingRejection ? 'Rejecting...' : 'Reject Settlement'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL 5: PRINTABLE SETTLEMENT RECEIPT                                     */}
      {/* ========================================================================= */}
      <Dialog open={isPrintModalOpen} onOpenChange={setIsPrintModalOpen}>
        <DialogContent className="max-w-2xl font-sans">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              Settlement Handover Receipt
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Official printed custody handover transfer voucher
            </DialogDescription>
          </DialogHeader>

          {selectedSettlement && (
            <div className="p-4 border border-slate-200 rounded-lg bg-white space-y-4 max-h-[60vh] overflow-y-auto text-xs">
              <div className="border-b border-slate-300 pb-3 flex justify-between items-start">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">iSysware SalonOS</h2>
                  <p className="text-xs text-slate-600">Official Cash Settlement & Handover Receipt</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Voucher: <span className="font-mono font-bold text-slate-800">{selectedSettlement.settlementNumber}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-slate-700">Date: {formatDate(selectedSettlement.date)}</p>
                  <p className="text-[11px] text-slate-500">Status: {selectedSettlement.status}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded border border-slate-200 text-[11px]">
                <div>
                  <span className="text-slate-500 block">Custodian (Submitter):</span>
                  <span className="font-bold text-slate-800">{selectedSettlement.submittedByName} ({selectedSettlement.submittedByRole})</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Destination Safe:</span>
                  <span className="font-bold text-slate-800">{selectedSettlement.destinationVaultName || 'Main Branch Safe'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Expected Cash:</span>
                  <span className="font-semibold text-slate-700">{formatCurrency(selectedSettlement.expectedCash || 0)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Counted Cash:</span>
                  <span className="font-semibold text-slate-700">{formatCurrency(selectedSettlement.countedCash || 0)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Variance:</span>
                  <span className="font-semibold text-slate-800">
                    {(selectedSettlement.variance || 0) > 0 ? '+' : ''}
                    {formatCurrency(selectedSettlement.variance || 0)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Retained Float:</span>
                  <span className="font-semibold text-slate-700">{formatCurrency(selectedSettlement.retainedFloat || 0)}</span>
                </div>
                <div className="col-span-2 pt-2 mt-1 border-t border-slate-200 flex justify-between items-center text-sm font-bold text-slate-900">
                  <span>Actual Cash Handover Amount:</span>
                  <span className="text-[#2254E1]">{formatCurrency(selectedSettlement.handoverAmount ?? selectedSettlement.amount ?? 0)}</span>
                </div>
              </div>

              {selectedSettlement.varianceExplanation && (
                <div className="text-[11px] bg-amber-50 p-2.5 rounded border border-amber-200 text-amber-900">
                  <span className="font-bold block">Discrepancy / Variance Explanation:</span>
                  <span>{selectedSettlement.varianceExplanation}</span>
                </div>
              )}

              {/* Signatures */}
              <div className="pt-8 grid grid-cols-2 gap-8 text-center text-xs text-slate-600">
                <div>
                  <div className="border-t border-slate-400 pt-1 font-medium">
                    Handed Over By: {selectedSettlement.submittedByName}
                  </div>
                </div>
                <div>
                  <div className="border-t border-slate-400 pt-1 font-medium">
                    Received By Manager: {selectedSettlement.receivedByName || 'Pending Review'}
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsPrintModalOpen(false)}>
              Close
            </Button>
            <Button size="sm" onClick={() => window.print()} className="bg-[#2254E1] hover:bg-[#1B43B4] text-white">
              <Printer className="w-3.5 h-3.5 mr-1.5" />
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
