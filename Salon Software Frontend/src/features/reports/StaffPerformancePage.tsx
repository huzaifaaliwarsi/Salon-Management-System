import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { salonService } from '../../services';
import {
  StaffPerformanceRecord,
  StaffPerformanceServiceItem,
  Branch,
  StaffMember,
  ServiceItem,
  PackageItem,
} from '../../types/salon';
import {
  TrendingUp,
  Award,
  Users,
  DollarSign,
  Calendar,
  Filter,
  Search,
  RotateCcw,
  Printer,
  Download,
  Building2,
  Clock,
  Sparkles,
  ChevronRight,
  Eye,
  X,
  FileSpreadsheet,
  AlertCircle,
  Briefcase,
  Layers,
  Percent,
} from 'lucide-react';
import { AccessDeniedView } from '../scaffold/AccessDeniedView';

function formatCurrency(val: number): string {
  return `PKR ${val.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export const StaffPerformancePage: React.FC = () => {
  const { user } = useAuth();

  // Role guard: Super Admin and Branch Admin only. Accountant and Staff denied.
  if (!user || (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN')) {
    return <AccessDeniedView attemptedPath="/reports/staff-performance" />;
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN';

  // Filters State
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    isSuperAdmin ? 'ALL' : user.branchId || ''
  );
  const [allStaff, setAllStaff] = useState<StaffMember[]>([]);
  const [servicesList, setServicesList] = useState<ServiceItem[]>([]);
  const [packagesList, setPackagesList] = useState<PackageItem[]>([]);

  // Default date window: Current month
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const monthStartStr = useMemo(() => todayStr.slice(0, 7) + '-01', [todayStr]);

  const [startDate, setStartDate] = useState<string>(monthStartStr);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('ALL');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('ALL');
  const [selectedPackageId, setSelectedPackageId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Data State
  const [loading, setLoading] = useState<boolean>(true);
  const [performanceRecords, setPerformanceRecords] = useState<StaffPerformanceRecord[]>([]);

  // Drilldown Modal State
  const [selectedStaffRecord, setSelectedStaffRecord] = useState<StaffPerformanceRecord | null>(null);
  const [drilldownSearch, setDrilldownSearch] = useState<string>('');
  const [drilldownFilterType, setDrilldownFilterType] = useState<'ALL' | 'SERVICE' | 'PACKAGE_COMPONENT'>('ALL');

  // Print Modal State
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);

  // Load auxiliary data
  useEffect(() => {
    const loadAux = async () => {
      try {
        const branchParam = isSuperAdmin ? 'ALL' : user.branchId || '';
        const [bList, sList, svcList, pkgList] = await Promise.all([
          salonService.getBranches(),
          salonService.getStaff(branchParam),
          salonService.getServices(branchParam),
          salonService.getPackages(branchParam),
        ]);
        setBranches(bList);
        setAllStaff(sList);
        setServicesList(svcList);
        setPackagesList(pkgList);
      } catch (err) {
        console.error('Failed to load auxiliary staff performance data', err);
      }
    };
    loadAux();
  }, [user, isSuperAdmin]);

  // Load performance report data
  const fetchReport = async () => {
    try {
      setLoading(true);
      const data = await salonService.getStaffPerformanceReport(
        selectedBranchId,
        startDate,
        endDate,
        {
          staffId: selectedStaffId !== 'ALL' ? selectedStaffId : undefined,
          serviceId: selectedServiceId !== 'ALL' ? selectedServiceId : undefined,
          packageId: selectedPackageId !== 'ALL' ? selectedPackageId : undefined,
        },
        user
      );
      setPerformanceRecords(data);
    } catch (err) {
      console.error('Failed to load staff performance report', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [selectedBranchId, startDate, endDate, selectedStaffId, selectedServiceId, selectedPackageId]);

  // Quick Date Preset Helpers
  const handleApplyPreset = (preset: 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_30_DAYS' | 'TODAY') => {
    const now = new Date();
    if (preset === 'TODAY') {
      const today = now.toISOString().slice(0, 10);
      setStartDate(today);
      setEndDate(today);
    } else if (preset === 'THIS_MONTH') {
      const start = now.toISOString().slice(0, 7) + '-01';
      const end = now.toISOString().slice(0, 10);
      setStartDate(start);
      setEndDate(end);
    } else if (preset === 'LAST_MONTH') {
      const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      setStartDate(prevMonthDate.toISOString().slice(0, 10));
      setEndDate(lastDayPrevMonth.toISOString().slice(0, 10));
    } else if (preset === 'LAST_30_DAYS') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);
      setStartDate(thirtyDaysAgo.toISOString().slice(0, 10));
      setEndDate(now.toISOString().slice(0, 10));
    }
  };

  const handleResetFilters = () => {
    setSelectedBranchId(isSuperAdmin ? 'ALL' : user.branchId || '');
    setStartDate(monthStartStr);
    setEndDate(todayStr);
    setSelectedStaffId('ALL');
    setSelectedServiceId('ALL');
    setSelectedPackageId('ALL');
    setSearchQuery('');
  };

  // Filter records by search query
  const filteredRecords = useMemo(() => {
    if (!searchQuery.trim()) return performanceRecords;
    const q = searchQuery.toLowerCase().trim();
    return performanceRecords.filter(
      (r) =>
        r.staffName.toLowerCase().includes(q) ||
        r.staffCode.toLowerCase().includes(q) ||
        r.roleTitle.toLowerCase().includes(q)
    );
  }, [performanceRecords, searchQuery]);

  // Consolidated Aggregated Summary Metrics across active records
  const aggregatedMetrics = useMemo(() => {
    let totalDirectServices = 0;
    let totalPackageComponents = 0;
    let totalUnits = 0;
    let totalUniqueClients = 0;
    let totalGrossSales = 0;
    let totalDiscount = 0;
    let totalNetSales = 0;
    let totalEstimatedCommission = 0;
    let totalFinalizedCommission = 0;
    let totalAllocatedTips = 0;
    let totalPaidTips = 0;
    let totalOutstandingTips = 0;
    let totalWorkedHours = 0;
    let totalOvertimeMinutes = 0;

    filteredRecords.forEach((r) => {
      totalDirectServices += r.directServicesCount;
      totalPackageComponents += r.packageComponentsCount;
      totalUnits += r.totalServiceUnits;
      totalUniqueClients += r.uniqueClientsCount;
      totalGrossSales += r.attributedGrossSales;
      totalDiscount += r.discountAllocation;
      totalNetSales += r.attributedNetSales;
      totalEstimatedCommission += r.estimatedCommission;
      totalFinalizedCommission += r.finalizedCommission;
      totalAllocatedTips += r.allocatedTips;
      totalPaidTips += r.paidTips;
      totalOutstandingTips += r.outstandingTips;
      totalWorkedHours += r.workedHours;
      totalOvertimeMinutes += r.approvedOvertimeMinutes;
    });

    return {
      totalDirectServices,
      totalPackageComponents,
      totalUnits,
      totalUniqueClients,
      totalGrossSales,
      totalDiscount,
      totalNetSales,
      totalEstimatedCommission,
      totalFinalizedCommission,
      totalAllocatedTips,
      totalPaidTips,
      totalOutstandingTips,
      totalWorkedHours,
      totalOvertimeMinutes,
    };
  }, [filteredRecords]);

  // Filtered detailed services for drilldown modal
  const filteredDetailedServices = useMemo(() => {
    if (!selectedStaffRecord) return [];
    let items = selectedStaffRecord.detailedServices || [];

    if (drilldownFilterType !== 'ALL') {
      items = items.filter((item) => item.itemType === drilldownFilterType);
    }

    if (drilldownSearch.trim()) {
      const q = drilldownSearch.toLowerCase().trim();
      items = items.filter(
        (item) =>
          item.serviceName.toLowerCase().includes(q) ||
          item.invoiceNumber.toLowerCase().includes(q) ||
          (item.clientName && item.clientName.toLowerCase().includes(q))
      );
    }

    return items;
  }, [selectedStaffRecord, drilldownFilterType, drilldownSearch]);

  // CSV Export for Main Table
  const handleExportCSV = () => {
    const headers = [
      'Staff Code',
      'Staff Name',
      'Designation',
      'Branch',
      'Direct Services',
      'Package Components',
      'Total Service Units',
      'Unique Clients',
      'Gross Sales (PKR)',
      'Discount Allocated (PKR)',
      'Attributed Net Sales (PKR)',
      'Estimated Commission (PKR)',
      'Finalized Commission (PKR)',
      'Allocated Tips (PKR)',
      'Paid Tips (PKR)',
      'Outstanding Tips (PKR)',
      'Worked Hours',
      'Present Days',
      'Late Punches',
      'Approved OT (Mins)',
    ];

    const rows = filteredRecords.map((r) => [
      r.staffCode,
      `"${r.staffName.replace(/"/g, '""')}"`,
      `"${r.roleTitle.replace(/"/g, '""')}"`,
      `"${r.branchName.replace(/"/g, '""')}"`,
      r.directServicesCount,
      r.packageComponentsCount,
      r.totalServiceUnits,
      r.uniqueClientsCount,
      r.attributedGrossSales.toFixed(2),
      r.discountAllocation.toFixed(2),
      r.attributedNetSales.toFixed(2),
      r.estimatedCommission.toFixed(2),
      r.finalizedCommission.toFixed(2),
      r.allocatedTips.toFixed(2),
      r.paidTips.toFixed(2),
      r.outstandingTips.toFixed(2),
      r.workedHours.toFixed(1),
      r.presentDays,
      r.latePunchesCount,
      r.approvedOvertimeMinutes,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `Staff_Performance_Report_${startDate}_to_${endDate}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // CSV Export for Drilldown
  const handleExportDrilldownCSV = () => {
    if (!selectedStaffRecord) return;
    const headers = [
      'Date',
      'Time',
      'Invoice #',
      'Client Name',
      'Item Type',
      'Service / Component Name',
      'Catalogue Price (PKR)',
      'Discount Allocated (PKR)',
      'Attributed Net Sales (PKR)',
      'Commission Rate (%)',
      'Commission Earned (PKR)',
    ];

    const rows = (selectedStaffRecord.detailedServices || []).map((s) => [
      s.date,
      s.time || '',
      s.invoiceNumber,
      `"${(s.clientName || 'Walk-in Client').replace(/"/g, '""')}"`,
      s.itemType,
      `"${s.serviceName.replace(/"/g, '""')}"`,
      s.cataloguePrice.toFixed(2),
      s.discountAllocated.toFixed(2),
      s.netSales.toFixed(2),
      s.commissionRatePercent.toFixed(1),
      s.commissionEarned.toFixed(2),
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `Staff_${selectedStaffRecord.staffCode}_Services_${startDate}_to_${endDate}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 font-sans">
      {/* Top Banner */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 text-[#2254E1] rounded-xl">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Staff Performance Report</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Read-Only Analytics
                </span>
              </div>
              <p className="text-sm text-slate-500">
                Staff service attribution, completed units, discount allocations, estimated commission, tips, and punctuality audit.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPrintModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            Print Report
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#2254E1] text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition-colors shadow-xs"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filters Bar Card */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
            <Filter className="w-4 h-4 text-slate-500" />
            Filters & Date Window
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleApplyPreset('TODAY')}
              className="px-2.5 py-1 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => handleApplyPreset('THIS_MONTH')}
              className="px-2.5 py-1 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              This Month
            </button>
            <button
              onClick={() => handleApplyPreset('LAST_MONTH')}
              className="px-2.5 py-1 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Last Month
            </button>
            <button
              onClick={() => handleApplyPreset('LAST_30_DAYS')}
              className="px-2.5 py-1 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Last 30 Days
            </button>
            <button
              onClick={handleResetFilters}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors ml-1"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Branch Filter */}
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">
              Branch Scope
            </label>
            <select
              disabled={!isSuperAdmin}
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:bg-white disabled:opacity-60"
            >
              {isSuperAdmin && <option value="ALL">All Branches (Consolidated)</option>}
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Start */}
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">
              From Date
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:bg-white"
              />
            </div>
          </div>

          {/* Date Range End */}
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">
              To Date
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:bg-white"
              />
            </div>
          </div>

          {/* Staff Filter */}
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">
              Employee Filter
            </label>
            <select
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:bg-white"
            >
              <option value="ALL">All Staff Members</option>
              {allStaff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.employeeCode || s.id.slice(-4)})
                </option>
              ))}
            </select>
          </div>

          {/* Service / Package Filter */}
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">
              Catalogue Filter
            </label>
            <select
              value={
                selectedServiceId !== 'ALL'
                  ? `svc:${selectedServiceId}`
                  : selectedPackageId !== 'ALL'
                  ? `pkg:${selectedPackageId}`
                  : 'ALL'
              }
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'ALL') {
                  setSelectedServiceId('ALL');
                  setSelectedPackageId('ALL');
                } else if (val.startsWith('svc:')) {
                  setSelectedServiceId(val.replace('svc:', ''));
                  setSelectedPackageId('ALL');
                } else if (val.startsWith('pkg:')) {
                  setSelectedPackageId(val.replace('pkg:', ''));
                  setSelectedServiceId('ALL');
                }
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:bg-white"
            >
              <option value="ALL">All Services & Packages</option>
              <optgroup label="Direct Services">
                {servicesList.map((svc) => (
                  <option key={svc.id} value={`svc:${svc.id}`}>
                    {svc.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Bundled Packages">
                {packagesList.map((pkg) => (
                  <option key={pkg.id} value={`pkg:${pkg.id}`}>
                    {pkg.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>

        {/* Search Bar */}
        <div className="pt-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by staff employee code, name or role title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:bg-white placeholder:text-slate-400"
            />
          </div>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Attributed Net Sales */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Attributed Net Sales
            </span>
            <div className="p-2.5 bg-blue-50 text-[#2254E1] rounded-xl">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              {formatCurrency(aggregatedMetrics.totalNetSales)}
            </div>
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-1">
              <span>Gross: {formatCurrency(aggregatedMetrics.totalGrossSales)}</span>
              <span>·</span>
              <span className="text-amber-600">Disc: {formatCurrency(aggregatedMetrics.totalDiscount)}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Completed Service Units */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Service Units Delivered
            </span>
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
              <Briefcase className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              {aggregatedMetrics.totalUnits.toLocaleString()} units
            </div>
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-1">
              <span>Direct: {aggregatedMetrics.totalDirectServices}</span>
              <span>·</span>
              <span className="text-indigo-600">Package: {aggregatedMetrics.totalPackageComponents}</span>
              <span>·</span>
              <span>{aggregatedMetrics.totalUniqueClients} clients</span>
            </div>
          </div>
        </div>

        {/* Card 3: Commission Earnings */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Staff Commission
            </span>
            <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
              <Percent className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-purple-700 tracking-tight">
              {formatCurrency(aggregatedMetrics.totalEstimatedCommission)}
            </div>
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-1">
              <span>Estimated: {formatCurrency(aggregatedMetrics.totalEstimatedCommission)}</span>
              <span>·</span>
              <span className="text-emerald-600">Finalized: {formatCurrency(aggregatedMetrics.totalFinalizedCommission)}</span>
            </div>
          </div>
        </div>

        {/* Card 4: Allocated Gratuity & Punctuality */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Gratuity & Overtime
            </span>
            <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
              <Sparkles className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-amber-700 tracking-tight">
              {formatCurrency(aggregatedMetrics.totalAllocatedTips)}
            </div>
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-1">
              <span>Paid: {formatCurrency(aggregatedMetrics.totalPaidTips)}</span>
              <span>·</span>
              <span className="text-rose-600">Due: {formatCurrency(aggregatedMetrics.totalOutstandingTips)}</span>
              <span>·</span>
              <span>OT: {aggregatedMetrics.totalOvertimeMinutes}m</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Staff Performance Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Staff Member Performance Ledger
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Ranked by attributed net service sales. Click on any employee to inspect detailed line items.
            </p>
          </div>
          <div className="text-xs font-semibold text-slate-500">
            Showing {filteredRecords.length} staff members
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-100 text-slate-600 font-semibold uppercase text-[11px] tracking-wider">
                <th className="py-3 px-4">#</th>
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Branch</th>
                <th className="py-3 px-4 text-center">Units (Dir / Pkg)</th>
                <th className="py-3 px-4 text-center">Clients</th>
                <th className="py-3 px-4 text-right">Attributed Net Sales</th>
                <th className="py-3 px-4 text-right">Commission (Est / Fin)</th>
                <th className="py-3 px-4 text-right">Tips (Alloc / Due)</th>
                <th className="py-3 px-4 text-center">Attendance & OT</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <p className="text-xs">Computing staff performance metrics...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <AlertCircle className="w-8 h-8 text-slate-300" />
                      <p className="text-xs font-medium">No service performance records found for the selected criteria.</p>
                      <button
                        onClick={handleResetFilters}
                        className="text-xs text-[#2254E1] font-semibold hover:underline mt-1"
                      >
                        Reset filters
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record, idx) => (
                  <tr
                    key={record.staffId}
                    className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
                    onClick={() => setSelectedStaffRecord(record)}
                  >
                    {/* Index Rank */}
                    <td className="py-3.5 px-4 font-semibold text-slate-400 font-mono text-[11px]">
                      {idx + 1}
                    </td>

                    {/* Employee Profile */}
                    <td className="py-3.5 px-4">
                      <div>
                        <div className="font-bold text-slate-900 group-hover:text-[#2254E1] transition-colors flex items-center gap-1.5">
                          {record.staffName}
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                            {record.staffCode}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{record.roleTitle}</div>
                      </div>
                    </td>

                    {/* Branch */}
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                        {record.branchName}
                      </span>
                    </td>

                    {/* Service Units */}
                    <td className="py-3.5 px-4 text-center">
                      <div className="font-bold text-slate-900">{record.totalServiceUnits}</div>
                      <div className="text-[10px] text-slate-400">
                        {record.directServicesCount} dir · {record.packageComponentsCount} pkg
                      </div>
                    </td>

                    {/* Clients Served */}
                    <td className="py-3.5 px-4 text-center">
                      <span className="font-semibold text-slate-800">{record.uniqueClientsCount}</span>
                    </td>

                    {/* Attributed Net Sales */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="font-bold text-slate-900">{formatCurrency(record.attributedNetSales)}</div>
                      <div className="text-[10px] text-slate-400">
                        Gross: {formatCurrency(record.attributedGrossSales)}
                      </div>
                    </td>

                    {/* Commission */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="font-bold text-purple-700">{formatCurrency(record.estimatedCommission)}</div>
                      <div className="text-[10px] text-emerald-600 font-medium">
                        Fin: {formatCurrency(record.finalizedCommission)}
                      </div>
                    </td>

                    {/* Tips */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="font-bold text-amber-700">{formatCurrency(record.allocatedTips)}</div>
                      <div className="text-[10px] text-slate-400">
                        Due: {formatCurrency(record.outstandingTips)}
                      </div>
                    </td>

                    {/* Attendance & OT */}
                    <td className="py-3.5 px-4 text-center">
                      <div className="font-medium text-slate-800">
                        {record.presentDays} days ({record.workedHours}h)
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {record.latePunchesCount > 0 ? (
                          <span className="text-amber-600 font-medium">{record.latePunchesCount} late · </span>
                        ) : null}
                        OT: {record.approvedOvertimeMinutes}m
                      </div>
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedStaffRecord(record);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-[#2254E1] hover:bg-blue-100 font-semibold text-xs transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Drilldown
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {/* Table Footer Totals */}
            {filteredRecords.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold text-slate-900 text-xs">
                  <td colSpan={3} className="py-3 px-4 uppercase tracking-wider text-slate-600 text-right">
                    Total Consolidated:
                  </td>
                  <td className="py-3 px-4 text-center">
                    {aggregatedMetrics.totalUnits}
                    <div className="text-[10px] font-normal text-slate-500">
                      ({aggregatedMetrics.totalDirectServices} dir / {aggregatedMetrics.totalPackageComponents} pkg)
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center">{aggregatedMetrics.totalUniqueClients}</td>
                  <td className="py-3 px-4 text-right">
                    {formatCurrency(aggregatedMetrics.totalNetSales)}
                  </td>
                  <td className="py-3 px-4 text-right text-purple-700">
                    {formatCurrency(aggregatedMetrics.totalEstimatedCommission)}
                  </td>
                  <td className="py-3 px-4 text-right text-amber-700">
                    {formatCurrency(aggregatedMetrics.totalAllocatedTips)}
                  </td>
                  <td className="py-3 px-4 text-center text-slate-600">
                    OT: {aggregatedMetrics.totalOvertimeMinutes}m
                  </td>
                  <td className="py-3 px-4"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Employee Service Drilldown Modal */}
      {selectedStaffRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-50 text-[#2254E1] rounded-xl">
                  <Award className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                      {selectedStaffRecord.staffName}
                    </h3>
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {selectedStaffRecord.staffCode}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-[#2254E1] font-medium">
                      {selectedStaffRecord.branchName}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedStaffRecord.roleTitle} · Detailed Service Ledger ({startDate} to {endDate})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportDrilldownCSV}
                  className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Items CSV
                </button>
                <button
                  onClick={() => setSelectedStaffRecord(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Sub-Banner Summary Metrics */}
            <div className="bg-slate-50/70 p-4 border-b border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-[11px] text-slate-500 block uppercase font-medium">Attributed Net Sales</span>
                <span className="text-base font-bold text-slate-900">
                  {formatCurrency(selectedStaffRecord.attributedNetSales)}
                </span>
                <span className="text-[10px] text-slate-400 block">
                  Gross: {formatCurrency(selectedStaffRecord.attributedGrossSales)}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block uppercase font-medium">Total Units</span>
                <span className="text-base font-bold text-slate-900">
                  {selectedStaffRecord.totalServiceUnits} units
                </span>
                <span className="text-[10px] text-slate-400 block">
                  {selectedStaffRecord.directServicesCount} Direct · {selectedStaffRecord.packageComponentsCount} Package
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block uppercase font-medium">Estimated Commission</span>
                <span className="text-base font-bold text-purple-700">
                  {formatCurrency(selectedStaffRecord.estimatedCommission)}
                </span>
                <span className="text-[10px] text-slate-400 block">
                  Finalized: {formatCurrency(selectedStaffRecord.finalizedCommission)}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block uppercase font-medium">Gratuity Entitlement</span>
                <span className="text-base font-bold text-amber-700">
                  {formatCurrency(selectedStaffRecord.allocatedTips)}
                </span>
                <span className="text-[10px] text-slate-400 block">
                  Paid: {formatCurrency(selectedStaffRecord.paidTips)} · Due: {formatCurrency(selectedStaffRecord.outstandingTips)}
                </span>
              </div>
            </div>

            {/* Drilldown Filters */}
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDrilldownFilterType('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    drilldownFilterType === 'ALL'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All Items ({selectedStaffRecord.detailedServices.length})
                </button>
                <button
                  onClick={() => setDrilldownFilterType('SERVICE')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    drilldownFilterType === 'SERVICE'
                      ? 'bg-[#2254E1] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Direct Services ({selectedStaffRecord.directServicesCount})
                </button>
                <button
                  onClick={() => setDrilldownFilterType('PACKAGE_COMPONENT')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    drilldownFilterType === 'PACKAGE_COMPONENT'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Package Components ({selectedStaffRecord.packageComponentsCount})
                </button>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search invoice or service name..."
                  value={drilldownSearch}
                  onChange={(e) => setDrilldownSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:bg-white placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Drilldown Table */}
            <div className="p-4 flex-1 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Invoice #</th>
                    <th className="py-2.5 px-3">Client</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Service / Component</th>
                    <th className="py-2.5 px-3 text-right">Catalogue Price</th>
                    <th className="py-2.5 px-3 text-right">Discount</th>
                    <th className="py-2.5 px-3 text-right">Net Sales</th>
                    <th className="py-2.5 px-3 text-right">Rate %</th>
                    <th className="py-2.5 px-3 text-right">Earned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredDetailedServices.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400">
                        No service line items found matching filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredDetailedServices.map((item, idx) => (
                      <tr key={`${item.invoiceId}-${item.itemId}-${idx}`} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {item.date} {item.time ? `· ${item.time}` : ''}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] font-semibold text-slate-800">
                          {item.invoiceNumber}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 font-medium">
                          {item.clientName || 'Walk-in Client'}
                        </td>
                        <td className="py-2.5 px-3">
                          {item.itemType === 'SERVICE' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-[#2254E1]">
                              Direct Service
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700">
                              Package Comp
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-900">{item.serviceName}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                          {formatCurrency(item.cataloguePrice)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-amber-600">
                          {item.discountAllocated > 0 ? `-${formatCurrency(item.discountAllocated)}` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold font-mono text-slate-900">
                          {formatCurrency(item.netSales)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                          {item.commissionRatePercent > 0 ? `${item.commissionRatePercent}%` : '0%'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold font-mono text-purple-700">
                          {formatCurrency(item.commissionEarned)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
              <span className="text-xs text-slate-500">
                Derived directly from completed invoices and immutable line item attributions.
              </span>
              <button
                onClick={() => setSelectedStaffRecord(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
              >
                Close Drilldown
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Statement Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[95vh] flex flex-col shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-[#2254E1]" />
                <h3 className="font-bold text-slate-900 text-sm">Print Staff Performance Report</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2254E1] text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  Print Now
                </button>
                <button
                  onClick={() => setShowPrintModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Document Sheet */}
            <div className="p-8 overflow-y-auto space-y-6 print:p-0" id="printable-performance-report">
              {/* Report Header */}
              <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-start">
                <div>
                  <h1 className="text-2xl font-black text-slate-900 tracking-tight">iSysware SalonOS</h1>
                  <h2 className="text-base font-bold text-slate-700 mt-0.5">Staff Performance & Attribution Audit</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Branch: {selectedBranchId === 'ALL' ? 'All Branches Consolidated' : branches.find((b) => b.id === selectedBranchId)?.name || selectedBranchId}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-500 space-y-1">
                  <div><strong>Period:</strong> {startDate} to {endDate}</div>
                  <div><strong>Generated:</strong> {new Date().toLocaleString()}</div>
                  <div><strong>Auditor:</strong> {user.name} ({user.role})</div>
                </div>
              </div>

              {/* Summary KPIs Row */}
              <div className="grid grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div>
                  <div className="text-slate-500 uppercase text-[10px] font-semibold">Total Net Sales</div>
                  <div className="text-base font-bold text-slate-900 mt-0.5">
                    {formatCurrency(aggregatedMetrics.totalNetSales)}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Gross: {formatCurrency(aggregatedMetrics.totalGrossSales)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 uppercase text-[10px] font-semibold">Service Units</div>
                  <div className="text-base font-bold text-slate-900 mt-0.5">
                    {aggregatedMetrics.totalUnits} units
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {aggregatedMetrics.totalDirectServices} dir · {aggregatedMetrics.totalPackageComponents} pkg
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 uppercase text-[10px] font-semibold">Estimated Comm.</div>
                  <div className="text-base font-bold text-purple-700 mt-0.5">
                    {formatCurrency(aggregatedMetrics.totalEstimatedCommission)}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Finalized: {formatCurrency(aggregatedMetrics.totalFinalizedCommission)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 uppercase text-[10px] font-semibold">Staff Gratuity</div>
                  <div className="text-base font-bold text-amber-700 mt-0.5">
                    {formatCurrency(aggregatedMetrics.totalAllocatedTips)}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Paid: {formatCurrency(aggregatedMetrics.totalPaidTips)}
                  </div>
                </div>
              </div>

              {/* Staff Table */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Employee Performance Ranking ({filteredRecords.length})
                </h4>
                <table className="w-full text-left text-[11px] border border-slate-200">
                  <thead className="bg-slate-100 font-semibold text-slate-700 border-b border-slate-200">
                    <tr>
                      <th className="py-1.5 px-2">#</th>
                      <th className="py-1.5 px-2">Code</th>
                      <th className="py-1.5 px-2">Staff Name</th>
                      <th className="py-1.5 px-2">Role</th>
                      <th className="py-1.5 px-2 text-center">Units</th>
                      <th className="py-1.5 px-2 text-right">Net Sales</th>
                      <th className="py-1.5 px-2 text-right">Est. Comm</th>
                      <th className="py-1.5 px-2 text-right">Tips</th>
                      <th className="py-1.5 px-2 text-center">Present / OT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRecords.map((r, i) => (
                      <tr key={r.staffId}>
                        <td className="py-1.5 px-2 font-mono text-slate-400">{i + 1}</td>
                        <td className="py-1.5 px-2 font-mono">{r.staffCode}</td>
                        <td className="py-1.5 px-2 font-semibold text-slate-900">{r.staffName}</td>
                        <td className="py-1.5 px-2 text-slate-600">{r.roleTitle}</td>
                        <td className="py-1.5 px-2 text-center">{r.totalServiceUnits}</td>
                        <td className="py-1.5 px-2 text-right font-semibold">{formatCurrency(r.attributedNetSales)}</td>
                        <td className="py-1.5 px-2 text-right text-purple-700">{formatCurrency(r.estimatedCommission)}</td>
                        <td className="py-1.5 px-2 text-right text-amber-700">{formatCurrency(r.allocatedTips)}</td>
                        <td className="py-1.5 px-2 text-center">{r.presentDays}d / {r.approvedOvertimeMinutes}m</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Signatures block */}
              <div className="pt-10 grid grid-cols-2 gap-12 text-center text-slate-500 text-[11px]">
                <div className="border-t border-slate-300 pt-2 font-medium">Branch Administrator Signature</div>
                <div className="border-t border-slate-300 pt-2 font-medium">Salon General Manager / Auditor</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
