import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from '@/context/RouterContext';
import { salonService } from '@/services';
import {
  AppointmentBillingStatus,
  AppointmentReportRecord,
  AppointmentReportSummary,
  AppointmentStatus,
  Branch,
  CustomerSource,
  StaffMember,
} from '@/types/salon';
import { formatCurrency, formatPhoneNumber } from '@/lib/formatters';
import { AccessDeniedView } from '@/features/scaffold/AccessDeniedView';
import {
  CalendarRange,
  Calendar,
  Clock,
  Filter,
  Search,
  Printer,
  Download,
  Building2,
  Users,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Receipt,
  FileSpreadsheet,
  RefreshCw,
  ExternalLink,
  DollarSign,
  TrendingUp,
  FileText,
  Info,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string }
> = {
  PENDING: {
    label: 'Pending',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
  },
  CONFIRMED: {
    label: 'Confirmed',
    bg: 'bg-blue-50',
    text: 'text-blue-800',
    border: 'border-blue-200',
  },
  CHECKED_IN: {
    label: 'Checked In',
    bg: 'bg-purple-50',
    text: 'text-purple-800',
    border: 'border-purple-200',
  },
  IN_SERVICE: {
    label: 'In Service',
    bg: 'bg-indigo-50',
    text: 'text-indigo-800',
    border: 'border-indigo-200',
  },
  COMPLETED: {
    label: 'Completed',
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
  },
  CANCELLED: {
    label: 'Cancelled',
    bg: 'bg-rose-50',
    text: 'text-rose-800',
    border: 'border-rose-200',
  },
  NO_SHOW: {
    label: 'No-Show',
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-300',
  },
};

export const AppointmentReportPage: React.FC = () => {
  const { user } = useAuth();
  const { navigate } = useRouter();

  // Role guard: Super Admin and Branch Admin only. Accountant and Staff denied.
  if (!user || (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN')) {
    return <AccessDeniedView attemptedPath="/reports/appointments" />;
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN';

  // Filters State
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    isSuperAdmin ? 'ALL' : user.branchId || ''
  );
  const [staffList, setStaffList] = useState<StaffMember[]>([]);

  // Date range presets (default: current month)
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const monthStartStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;

  const [startDate, setStartDate] = useState<string>(monthStartStr);
  const [endDate, setEndDate] = useState<string>(todayStr);

  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedBillingStatus, setSelectedBillingStatus] = useState<string>('ALL');
  const [selectedStaffId, setSelectedStaffId] = useState<string>('ALL');
  const [selectedSource, setSelectedSource] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Data State
  const [records, setRecords] = useState<AppointmentReportRecord[]>([]);
  const [summary, setSummary] = useState<AppointmentReportSummary>({
    totalAppointments: 0,
    pendingCount: 0,
    confirmedCount: 0,
    checkedInCount: 0,
    inServiceCount: 0,
    completedCount: 0,
    cancelledCount: 0,
    noShowCount: 0,
    billedCount: 0,
    unbilledCount: 0,
    totalQuotedValue: 0,
    totalActualNetSales: 0,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Print modal state
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);

  // Load auxiliary branches and staff
  useEffect(() => {
    async function loadAux() {
      try {
        const [bList, sList] = await Promise.all([
          salonService.getBranches(),
          salonService.getStaff('ALL'),
        ]);
        setBranches(bList);
        setStaffList(sList);
      } catch (err) {
        console.error('Failed to load branches and staff for appointment report', err);
      }
    }
    loadAux();
  }, []);

  // Fetch report data
  const fetchReport = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await salonService.getAppointmentReport(
        selectedBranchId,
        startDate,
        endDate,
        {
          status: selectedStatus !== 'ALL' ? (selectedStatus as AppointmentStatus) : undefined,
          billingStatus: selectedBillingStatus !== 'ALL' ? (selectedBillingStatus as AppointmentBillingStatus) : undefined,
          staffId: selectedStaffId !== 'ALL' ? selectedStaffId : undefined,
          customerSource: selectedSource !== 'ALL' ? (selectedSource as CustomerSource) : undefined,
          search: searchQuery.trim() || undefined,
        },
        user || undefined
      );

      setRecords(data.records);
      setSummary(data.summary);
    } catch (err) {
      console.error('Failed to fetch appointment report', err);
    } finally {
      setIsLoading(false);
    }
  }, [
    selectedBranchId,
    startDate,
    endDate,
    selectedStatus,
    selectedBillingStatus,
    selectedStaffId,
    selectedSource,
    searchQuery,
    user,
  ]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Date Preset Helpers
  const handleSetDatePreset = (preset: 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'LAST_MONTH') => {
    const now = new Date();
    if (preset === 'TODAY') {
      const s = now.toISOString().slice(0, 10);
      setStartDate(s);
      setEndDate(s);
    } else if (preset === 'THIS_WEEK') {
      const day = now.getDay();
      const diff = now.getDate() - day;
      const start = new Date(now.setDate(diff));
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      setStartDate(start.toISOString().slice(0, 10));
      setEndDate(end.toISOString().slice(0, 10));
    } else if (preset === 'THIS_MONTH') {
      const s = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const e = now.toISOString().slice(0, 10);
      setStartDate(s);
      setEndDate(e);
    } else if (preset === 'LAST_MONTH') {
      const firstOfLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastOfLast = new Date(now.getFullYear(), now.getMonth(), 0);
      setStartDate(firstOfLast.toISOString().slice(0, 10));
      setEndDate(lastOfLast.toISOString().slice(0, 10));
    }
  };

  // CSV Export Handler
  const handleExportCSV = () => {
    let csv = 'APPOINTMENT AUDIT & REVENUE REPORT\n';
    csv += `Scope: ${selectedBranchId === 'ALL' ? 'All Branches' : selectedBranchId}\n`;
    csv += `Scheduled Date Window: ${startDate} to ${endDate}\n`;
    csv += `Generated On: ${new Date().toLocaleString()}\n\n`;

    // Summary Section
    csv += '--- REPORT KPI SUMMARY ---\n';
    csv += `Total Scheduled Appointments,${summary.totalAppointments}\n`;
    csv += `Pending Reservations,${summary.pendingCount}\n`;
    csv += `Confirmed & Checked In,${summary.confirmedCount + summary.checkedInCount + summary.inServiceCount}\n`;
    csv += `Completed Appointments,${summary.completedCount}\n`;
    csv += `Cancelled Bookings,${summary.cancelledCount}\n`;
    csv += `No-Show Bookings,${summary.noShowCount}\n`;
    csv += `Billed Appointments,${summary.billedCount}\n`;
    csv += `Unbilled Appointments,${summary.unbilledCount}\n`;
    csv += `Total Quoted Booking Value (PKR),${summary.totalQuotedValue}\n`;
    csv += `Actual Linked Invoice Net Sales (PKR),${summary.totalActualNetSales}\n\n`;

    // Detail Records Section
    csv += '--- APPOINTMENT DETAIL RECORDS ---\n';
    csv += 'Ref #,Scheduled Date,Time,Customer Name,Phone,Branch,Services / Packages,Staff,Status,Billing Status,Quoted Price (PKR),Linked Invoice #,Invoice Net Sales (PKR),Invoice Status\n';

    records.forEach((r) => {
      csv += `"${r.appointmentNumber || r.id}","${r.date}","${r.startTime}","${r.clientName}","${r.clientPhone}","${r.branchName || r.branchId}","${r.serviceSummary}","${r.staffSummary}","${r.status}","${r.billingStatus}","${r.quotedPrice}","${r.linkedInvoiceNumber || '-'}","${r.actualNetSales || 0}","${r.invoicePaymentStatus || '-'}"\n`;
    });

    const encodedUri = encodeURI('data:text/csv;charset=utf-8,' + csv);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Appointments_Report_${selectedBranchId}_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const branchNameDisplay = useMemo(() => {
    if (selectedBranchId === 'ALL') return 'All Branches Consolidated';
    return branches.find((b) => b.id === selectedBranchId)?.name || selectedBranchId;
  }, [selectedBranchId, branches]);

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <CalendarRange className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Dedicated Appointment Report
                </h1>
                <Badge variant="outline" className="text-[10px] font-semibold bg-slate-50 text-slate-600">
                  Read-Only Audit
                </Badge>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Analysis of scheduled reservations, status velocity, estimated booking values & actual POS conversions.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchReport}
            disabled={isLoading}
            className="text-xs gap-1.5 h-9"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowPrintModal(true)}
            className="text-xs gap-1.5 h-9 border-indigo-200 text-indigo-700 bg-indigo-50/60 hover:bg-indigo-100"
          >
            <Printer className="w-4 h-4" />
            Print Report
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleExportCSV}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold gap-1.5 h-9 shadow-xs"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Discrepancy & Methodology Notice Alert */}
      <div className="p-3.5 bg-blue-50/60 border border-blue-200/80 rounded-xl text-xs text-blue-900 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-bold">Scheduled Date Basis & Revenue Conversion Notice</span>
          <p className="text-[11px] text-blue-800/90 leading-relaxed">
            All filters and metrics in this report correspond to the <strong>appointment scheduled reservation date</strong>. Estimated Quoted Value represents original booking estimates. Actual Linked Net Sales derive exclusively from finalized, deduplicated POS sales invoices linked to these appointments. Appointment-scheduled sales must not be confused with invoice-date sales reports.
          </p>
        </div>
      </div>

      {/* Filter Control Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-3">
        {/* Date presets and Date Inputs Row */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-slate-500 mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              Presets:
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleSetDatePreset('TODAY')}
              className="h-7 text-xs px-2.5"
            >
              Today
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleSetDatePreset('THIS_WEEK')}
              className="h-7 text-xs px-2.5"
            >
              This Week
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleSetDatePreset('THIS_MONTH')}
              className="h-7 text-xs px-2.5"
            >
              This Month
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleSetDatePreset('LAST_MONTH')}
              className="h-7 text-xs px-2.5"
            >
              Last Month
            </Button>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">Scheduled From:</span>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 text-xs w-36 bg-slate-50 font-medium"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">To:</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-8 text-xs w-36 bg-slate-50 font-medium"
              />
            </div>
          </div>
        </div>

        {/* Multi-dimension Dropdown Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {/* Branch Filter */}
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
              Branch Scope
            </label>
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              disabled={!isSuperAdmin}
              className="w-full h-8 px-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium disabled:opacity-60"
            >
              {isSuperAdmin && <option value="ALL">All Branches</option>}
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
              Appointment Status
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full h-8 px-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="CHECKED_IN">Checked In</option>
              <option value="IN_SERVICE">In Service</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="NO_SHOW">No-Show</option>
            </select>
          </div>

          {/* Billing Status Filter */}
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
              Billing Status
            </label>
            <select
              value={selectedBillingStatus}
              onChange={(e) => setSelectedBillingStatus(e.target.value)}
              className="w-full h-8 px-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium"
            >
              <option value="ALL">All Billing States</option>
              <option value="BILLED">Billed (POS Invoice Created)</option>
              <option value="UNBILLED">Unbilled Bookings</option>
            </select>
          </div>

          {/* Staff Filter */}
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
              Assigned Staff
            </label>
            <select
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              className="w-full h-8 px-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium"
            >
              <option value="ALL">All Stylists & Staff</option>
              {staffList
                .filter((s) => selectedBranchId === 'ALL' || s.branchId === selectedBranchId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Acquisition Source Filter */}
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
              Acquisition Source
            </label>
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="w-full h-8 px-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium"
            >
              <option value="ALL">All Sources</option>
              <option value="WALK_IN">Walk-In</option>
              <option value="INSTAGRAM">Instagram</option>
              <option value="FACEBOOK">Facebook</option>
              <option value="TIKTOK">TikTok</option>
              <option value="GOOGLE">Google Search / Maps</option>
              <option value="WORD_OF_MOUTH">Word of Mouth</option>
              <option value="REFERRAL">Client Referral</option>
              <option value="OTHER">Other Channels</option>
            </select>
          </div>

          {/* Search Query */}
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
              Search Text
            </label>
            <div className="relative">
              <Search className="w-3 h-3 absolute left-2.5 top-2.5 text-slate-400" />
              <Input
                type="text"
                placeholder="Client, phone, ref..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-7 h-8 text-xs bg-slate-50"
              />
            </div>
          </div>
        </div>
      </div>

      {/* KPI Summary Cards Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Total Bookings
          </span>
          <span className="text-xl font-bold text-slate-900 mt-1 block">
            {summary.totalAppointments}
          </span>
          <span className="text-[10px] text-slate-400">Scheduled in window</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider block">
            Pending Holds
          </span>
          <span className="text-xl font-bold text-amber-700 mt-1 block">
            {summary.pendingCount}
          </span>
          <span className="text-[10px] text-slate-400">Awaiting confirmation</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider block">
            Confirmed & Active
          </span>
          <span className="text-xl font-bold text-blue-700 mt-1 block">
            {summary.confirmedCount + summary.checkedInCount + summary.inServiceCount}
          </span>
          <span className="text-[10px] text-slate-400">Ready or in progress</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider block">
            Completed
          </span>
          <span className="text-xl font-bold text-emerald-700 mt-1 block">
            {summary.completedCount}
          </span>
          <span className="text-[10px] text-slate-400">Service fulfilled</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider block">
            Lost / Cancelled
          </span>
          <span className="text-xl font-bold text-rose-700 mt-1 block">
            {summary.cancelledCount + summary.noShowCount}
          </span>
          <span className="text-[10px] text-slate-400">
            {summary.cancelledCount} cncl / {summary.noShowCount} no-show
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Quoted Value (Est.)
          </span>
          <span className="text-lg font-bold text-slate-900 mt-1 block truncate">
            {formatCurrency(summary.totalQuotedValue)}
          </span>
          <span className="text-[10px] text-slate-400">Total estimated bookings</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-xs">
          <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider block">
            Actual POS Net Sales
          </span>
          <span className="text-lg font-bold text-emerald-700 mt-1 block truncate">
            {formatCurrency(summary.totalActualNetSales)}
          </span>
          <span className="text-[10px] text-emerald-600/90 font-medium">
            {summary.billedCount} billed appointments
          </span>
        </div>
      </div>

      {/* Main Report Data Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Appointment Audit Records ({records.length} Entries)
            </h3>
            <span className="text-xs text-slate-500">
              Branch: <span className="font-semibold text-slate-700">{branchNameDisplay}</span> • Scheduled Range: {startDate} to {endDate}
            </span>
          </div>

          {/* Operational Page Link */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigate('/operations/appointments')}
            className="text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 gap-1 h-8"
          >
            Go to Operational Calendar
            <ExternalLink className="w-3.5 h-3.5" />
          </Button>
        </div>

        {records.length === 0 ? (
          <div className="p-16 text-center text-slate-500">
            <CalendarRange className="w-10 h-10 mx-auto text-slate-300 mb-2 stroke-1" />
            <p className="text-sm font-semibold">No appointments match the selected criteria</p>
            <p className="text-xs text-slate-400 mt-1">Try widening the scheduled date window or removing filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Scheduled Date</th>
                  <th className="py-3 px-4">Ref #</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Branch</th>
                  <th className="py-3 px-4">Services & Staff</th>
                  <th className="py-3 px-4 text-right">Quoted Value</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Billing State</th>
                  <th className="py-3 px-4">Linked Invoice</th>
                  <th className="py-3 px-4 text-right">Invoice Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((r) => {
                  const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.CONFIRMED;
                  const isBilled = r.billingStatus === 'BILLED';

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Scheduled Date */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-bold text-slate-900 block">{r.date}</span>
                      </td>

                      {/* Ref */}
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-slate-600 text-[11px]">
                        {r.appointmentNumber || r.id.slice(-6)}
                      </td>

                      {/* Customer */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-bold text-slate-900 block">{r.clientName}</span>
                        <span className="text-slate-500 text-[11px]">{formatPhoneNumber(r.clientPhone)}</span>
                      </td>

                      {/* Branch */}
                      <td className="py-3 px-4 whitespace-nowrap text-slate-700">
                        {r.branchName || r.branchId}
                      </td>

                      {/* Services & Staff */}
                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-medium text-slate-800 truncate" title={r.serviceSummary}>
                          {r.serviceSummary}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate" title={r.staffSummary}>
                          Stylists: {r.staffSummary}
                        </div>
                      </td>

                      {/* Quoted Price */}
                      <td className="py-3 px-4 text-right font-bold text-slate-900 whitespace-nowrap">
                        {formatCurrency(r.quotedPrice)}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                          {cfg.label}
                        </span>
                      </td>

                      {/* Billing State */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {isBilled ? (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold text-[10px]">
                            Billed
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-slate-600 border-slate-300 font-semibold text-[10px]">
                            Unbilled
                          </Badge>
                        )}
                      </td>

                      {/* Linked Invoice */}
                      <td className="py-3 px-4 whitespace-nowrap text-[11px]">
                        {r.linkedInvoiceNumber ? (
                          <div>
                            <span className="font-bold text-slate-900 block">{r.linkedInvoiceNumber}</span>
                            <span className="text-slate-500 text-[10px]">Status: {r.invoicePaymentStatus || 'PAID'}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Actual Invoice Net Sales */}
                      <td className="py-3 px-4 text-right font-bold whitespace-nowrap">
                        {r.actualNetSales ? (
                          <span className="text-emerald-700">{formatCurrency(r.actualNetSales)}</span>
                        ) : (
                          <span className="text-slate-400 font-normal">PKR 0</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Print Preview Modal */}
      <Dialog open={showPrintModal} onOpenChange={setShowPrintModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center justify-between">
              <span>Appointment Report - Print Preview</span>
              <Button
                type="button"
                size="sm"
                onClick={() => window.print()}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Now
              </Button>
            </DialogTitle>
          </DialogHeader>

          <div className="p-6 bg-white space-y-6 text-xs text-slate-800" id="appointment-report-print-area">
            {/* Report Header */}
            <div className="border-b pb-4">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">iSysware SalonOS</h2>
                  <p className="text-slate-500 font-medium">Dedicated Appointment Audit & Conversion Statement</p>
                </div>
                <div className="text-right">
                  <span className="font-bold text-slate-900 block">{branchNameDisplay}</span>
                  <span className="text-slate-500 text-[11px] block">Range: {startDate} to {endDate}</span>
                  <span className="text-slate-400 text-[10px] block">Printed: {new Date().toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Summary KPIs Table */}
            <div className="grid grid-cols-4 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase block">Total Bookings</span>
                <span className="text-sm font-bold text-slate-900">{summary.totalAppointments}</span>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase block">Completed</span>
                <span className="text-sm font-bold text-emerald-700">{summary.completedCount}</span>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase block">Total Quoted Value</span>
                <span className="text-sm font-bold text-slate-900">{formatCurrency(summary.totalQuotedValue)}</span>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase block">Actual POS Net Sales</span>
                <span className="text-sm font-bold text-emerald-700">{formatCurrency(summary.totalActualNetSales)}</span>
              </div>
            </div>

            {/* Detailed Table */}
            <div>
              <h4 className="font-bold text-slate-900 mb-2">Scheduled Reservations Breakdown ({records.length} Records)</h4>
              <table className="w-full text-left text-[11px] border-collapse border border-slate-200">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                    <th className="p-1.5">Scheduled Date</th>
                    <th className="p-1.5">Customer</th>
                    <th className="p-1.5">Services & Staff</th>
                    <th className="p-1.5">Status</th>
                    <th className="p-1.5">Billing</th>
                    <th className="p-1.5 text-right">Quoted Value</th>
                    <th className="p-1.5 text-right">Actual Net Sales</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.map((r) => (
                    <tr key={r.id}>
                      <td className="p-1.5 whitespace-nowrap">{r.date} {r.startTime}</td>
                      <td className="p-1.5">{r.clientName}</td>
                      <td className="p-1.5">{r.serviceSummary} ({r.staffSummary})</td>
                      <td className="p-1.5">{r.status}</td>
                      <td className="p-1.5">{r.billingStatus}</td>
                      <td className="p-1.5 text-right font-semibold">{formatCurrency(r.quotedPrice)}</td>
                      <td className="p-1.5 text-right font-bold text-emerald-700">
                        {formatCurrency(r.actualNetSales || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-4 border-t border-slate-200 text-[10px] text-slate-400">
              iSysware SalonOS • Enterprise Multi-Branch Salon Management Platform • Audit Verification Copy
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowPrintModal(false)}
              className="text-xs"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
