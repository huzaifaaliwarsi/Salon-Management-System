import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { salonService } from '@/services';
import {
  AttendanceOvertimeReport,
  AttendanceOvertimeReportRow,
  AttendanceOvertimeReportQuery,
  StaffMember,
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
  Clock,
  ClockAlert,
  CalendarCheck,
  UserCheck,
  UserX,
  Calendar,
  Building2,
  Timer,
  AlertTriangle,
  RotateCcw,
  Info,
} from 'lucide-react';

const selectField = 'text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-hidden focus:ring-1 focus:ring-[#0047AB] h-8';
const inputField = 'text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-hidden focus:ring-1 focus:ring-[#0047AB] h-8';
const filterLabel = 'block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1';

export const AttendanceOvertimeReportPage: React.FC = () => {
  const { user, activeBranchId, allBranches } = useAuth();

  // Role guard: Super Admin and Admin only (Accountants denied confidential HR data)
  if (!user || (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN')) {
    return <AccessDeniedView attemptedPath="/reports/attendance" />;
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const defaultBranch = isSuperAdmin ? (activeBranchId || 'ALL') : (user.branchId || '');

  // Filter Form State
  const [selectedBranch, setSelectedBranch] = useState<string>(defaultBranch);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedOtStatus, setSelectedOtStatus] = useState<string>('ALL');
  const [selectedPreset, setSelectedPreset] = useState<DatePreset>('THIS_MONTH');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Applied Query State (triggers API fetch)
  const [appliedQuery, setAppliedQuery] = useState<AttendanceOvertimeReportQuery>({
    branchId: defaultBranch,
    staffId: 'ALL',
    status: 'ALL',
    otStatus: 'ALL',
    preset: 'THIS_MONTH',
  });

  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [reportData, setReportData] = useState<AttendanceOvertimeReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load staff list for filter
  useEffect(() => {
    salonService.getStaff(selectedBranch || 'ALL').then(setStaffList).catch(() => setStaffList([]));
  }, [selectedBranch]);

  // Load report data when appliedQuery changes
  const loadReportData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await salonService.getAttendanceOvertimeReport(appliedQuery);
      setReportData(data);
    } catch (err: any) {
      console.error('Failed to load Attendance & Overtime report:', err);
      setErrorMessage(err.message || 'Unable to load attendance and overtime report data.');
    } finally {
      setIsLoading(false);
    }
  }, [appliedQuery]);

  useEffect(() => {
    loadReportData();
  }, [loadReportData]);

  // Filter submission handler
  const handleApplyFilter = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAppliedQuery({
      branchId: selectedBranch,
      staffId: selectedStaffId,
      status: selectedStatus,
      otStatus: selectedOtStatus,
      preset: selectedPreset,
      from: selectedPreset === 'CUSTOM' ? customFrom : undefined,
      to: selectedPreset === 'CUSTOM' ? customTo : undefined,
      search: searchQuery.trim() || undefined,
    });
  };

  const handleResetFilter = () => {
    setSelectedBranch(defaultBranch);
    setSelectedStaffId('ALL');
    setSelectedStatus('ALL');
    setSelectedOtStatus('ALL');
    setSelectedPreset('THIS_MONTH');
    setCustomFrom('');
    setCustomTo('');
    setSearchQuery('');
    setAppliedQuery({
      branchId: defaultBranch,
      staffId: 'ALL',
      status: 'ALL',
      otStatus: 'ALL',
      preset: 'THIS_MONTH',
    });
  };

  // Status badge styling helper
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'PRESENT':
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Present</Badge>;
      case 'ABSENT':
        return <Badge className="bg-rose-100 text-rose-800 border-rose-200">Absent</Badge>;
      case 'PAID_LEAVE':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Paid Leave</Badge>;
      case 'UNPAID_LEAVE':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Unpaid Leave</Badge>;
      case 'HALF_DAY':
        return <Badge className="bg-purple-100 text-purple-800 border-purple-200">Half Day</Badge>;
      case 'MISSING_PUNCH':
        return <Badge className="bg-orange-100 text-orange-800 border-orange-200">Missing Punch</Badge>;
      case 'OFF_DAY':
        return <Badge className="bg-slate-100 text-slate-700 border-slate-200">Off Day</Badge>;
      case 'HOLIDAY':
        return <Badge className="bg-teal-100 text-teal-800 border-teal-200">Holiday</Badge>;
      case 'APPROVED_OVERTIME':
        return <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200">Overtime Only</Badge>;
      default:
        return <Badge variant="outline" className="text-slate-600">{status}</Badge>;
    }
  };

  const renderOtBadge = (otStatus: string, otHours: number) => {
    if (otStatus === 'APPROVED' && otHours > 0) {
      return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 font-semibold">{otHours.toFixed(1)}h Approved</Badge>;
    }
    if (otStatus === 'SUBMITTED') {
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Pending Review</Badge>;
    }
    if (otStatus === 'REJECTED') {
      return <Badge className="bg-rose-100 text-rose-800 border-rose-200">Rejected</Badge>;
    }
    return <span className="text-slate-400 text-xs">—</span>;
  };

  // Landscape Table Column Definitions
  const columns: ColumnDef<AttendanceOvertimeReportRow>[] = useMemo(() => [
    {
      key: 'date',
      header: 'Date',
      render: (row: AttendanceOvertimeReportRow) => (
        <span className="font-mono font-semibold text-slate-800 text-xs">{row.date}</span>
      ),
    },
    {
      key: 'staffName',
      header: 'Staff Member',
      render: (row: AttendanceOvertimeReportRow) => (
        <div>
          <div className="font-semibold text-slate-900">{row.staffName}</div>
          <div className="text-[10px] text-slate-500 font-mono">
            {row.employeeCode} • {row.designation}
          </div>
        </div>
      ),
    },
    {
      key: 'branchName',
      header: 'Branch',
      render: (row: AttendanceOvertimeReportRow) => (
        <span className="text-slate-700 text-xs">{row.branchName}</span>
      ),
    },
    {
      key: 'shift',
      header: 'Shift / Schedule',
      render: (row: AttendanceOvertimeReportRow) => (
        <span className="text-slate-600 text-[11px] font-mono">{row.shift}</span>
      ),
    },
    {
      key: 'checkIn',
      header: 'In / Out',
      render: (row: AttendanceOvertimeReportRow) => (
        <div className="text-[11px] font-mono">
          <span className="text-emerald-700 font-semibold">{row.checkIn}</span>
          <span className="text-slate-400 mx-1">→</span>
          <span className="text-slate-700">{row.checkOut}</span>
        </div>
      ),
    },
    {
      key: 'scheduledHours',
      header: 'Sched.',
      align: 'right',
      render: (row: AttendanceOvertimeReportRow) => (
        <span className="text-slate-600 text-xs font-mono">{row.scheduledHours}h</span>
      ),
    },
    {
      key: 'workedHours',
      header: 'Worked',
      align: 'right',
      render: (row: AttendanceOvertimeReportRow) => (
        <span className={`text-xs font-mono font-bold ${row.workedHours > 0 ? 'text-indigo-700' : 'text-slate-400'}`}>
          {row.workedHours}h
        </span>
      ),
    },
    {
      key: 'lateMinutes',
      header: 'Late / Early',
      render: (row: AttendanceOvertimeReportRow) => (
        <div className="text-[11px]">
          {row.lateMinutes > 0 ? (
            <span className="text-amber-700 font-semibold">{row.lateMinutes}m late</span>
          ) : row.earlyExitMinutes > 0 ? (
            <span className="text-rose-700 font-semibold">{row.earlyExitMinutes}m early</span>
          ) : (
            <span className="text-emerald-600">On time</span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Attendance Status',
      align: 'center',
      render: (row: AttendanceOvertimeReportRow) => renderStatusBadge(row.status),
    },
    {
      key: 'otHours',
      header: 'Overtime',
      align: 'center',
      render: (row: AttendanceOvertimeReportRow) => renderOtBadge(row.otStatus, row.otHours),
    },
    {
      key: 'otAmount',
      header: 'OT Amount',
      align: 'right',
      render: (row: AttendanceOvertimeReportRow) => (
        <span className={`text-xs font-mono font-semibold ${row.otAmount > 0 ? 'text-purple-700' : 'text-slate-400'}`}>
          {row.otAmount > 0 ? formatCurrency(row.otAmount) : '—'}
        </span>
      ),
    },
    {
      key: 'otApprovedBy',
      header: 'Approved By',
      render: (row: AttendanceOvertimeReportRow) => (
        <span className="text-slate-600 text-[11px]">{row.otApprovedBy}</span>
      ),
    },
    {
      key: 'notes',
      header: 'Reason / Notes',
      render: (row: AttendanceOvertimeReportRow) => (
        <span className="text-slate-500 text-[11px] max-w-xs truncate block" title={row.notes || row.otReason}>
          {row.notes || row.otReason || '—'}
        </span>
      ),
    },
  ], []);

  // Export metadata & rows
  const exportHeaders = [
    'Date',
    'Staff Name',
    'Code',
    'Designation',
    'Branch',
    'Shift',
    'Check-In',
    'Check-Out',
    'Scheduled Hours',
    'Worked Hours',
    'Late Minutes',
    'Early Exit Minutes',
    'Status',
    'OT Hours',
    'OT Amount',
    'OT Status',
    'Approved By',
    'Notes',
  ];

  const exportRows = useMemo(() => {
    if (!reportData) return [];
    return reportData.rows.map((r) => [
      r.date,
      r.staffName,
      r.employeeCode,
      r.designation,
      r.branchName,
      r.shift,
      r.checkIn,
      r.checkOut,
      r.scheduledHours,
      r.workedHours,
      r.lateMinutes,
      r.earlyExitMinutes,
      r.status,
      r.otHours,
      r.otAmount,
      r.otStatus,
      r.otApprovedBy,
      r.notes || r.otReason,
    ]);
  }, [reportData]);

  const exportMeta: [string, string][] = useMemo(() => [
    ['Report', 'Staff Attendance & Overtime Report'],
    ['Branch', reportData?.meta.branchName || 'All Branches'],
    ['Period', `${reportData?.meta.from || ''} to ${reportData?.meta.to || ''}`],
    ['Date Basis', reportData?.meta.dateBasis || 'WORK_DATE'],
    ['Generated By', reportData?.meta.generatedBy || user?.name || 'Administrator'],
    ['Generated At', reportData?.meta.generatedAt || new Date().toISOString()],
  ], [reportData, user]);

  const handleExportExcel = () => {
    if (!reportData || !reportData.rows.length) return;
    downloadReportExcel('attendance_overtime_report', exportMeta, [
      { title: 'Attendance & Overtime', headers: exportHeaders, rows: exportRows },
    ]);
  };

  const handleExportCsv = () => {
    if (!reportData || !reportData.rows.length) return;
    const fileName = `Attendance_Overtime_Report_${reportData.meta.from}_${reportData.meta.to}.csv`;
    downloadReportCsv(
      fileName,
      exportMeta,
      [{ headers: exportHeaders, rows: exportRows }]
    );
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
      totals?.scheduledHours ?? 0,
      totals?.workedHours ?? 0,
      totals?.lateMinutes ?? 0,
      '',
      '',
      totals?.otHours ?? 0,
      totals?.otAmount ?? 0,
      '',
      '',
      '',
    ];
    printReportWindow({
      title: 'Staff Attendance & Overtime Report',
      subtitle: `Branch: ${reportData.meta.branchName} · Window: ${reportData.meta.from.slice(0, 10)} to ${reportData.meta.to.slice(0, 10)}`,
      meta: exportMeta,
      headers: exportHeaders,
      rows: exportRows,
      totals: totalsRow,
    });
  };

  const kpis = reportData?.kpis;
  const totals = reportData?.totals;

  return (
    <ReportShell
      title="Staff Attendance & Overtime Report"
      description="Consolidated daily attendance records, punch timelines, late arrival infractions, and authorized overtime allowances."
      icon={CalendarCheck}
      bannerTitle="Staff Attendance & Overtime Audit"
      onExportExcel={handleExportExcel}
      onExportCsv={handleExportCsv}
      onExportPdf={handlePrint}
      onExportPrint={handlePrint}
      isFilterLoading={isLoading}
      onFilterSubmit={handleApplyFilter}
      filterChildren={
        <>
          {/* Branch Filter */}
          {isSuperAdmin && (
            <div>
              <label className={filterLabel}>Branch</label>
              <select
                className={selectField}
                value={selectedBranch}
                onChange={(e) => {
                  setSelectedBranch(e.target.value);
                  setSelectedStaffId('ALL');
                }}
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

          {/* Date Presets */}
          <div>
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

          {/* Custom Date Inputs */}
          {selectedPreset === 'CUSTOM' && (
            <>
              <div>
                <label className={filterLabel}>From</label>
                <input
                  type="date"
                  className={inputField}
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className={filterLabel}>To</label>
                <input
                  type="date"
                  className={inputField}
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  required
                />
              </div>
            </>
          )}

          {/* Staff Member */}
          <div>
            <label className={filterLabel}>Staff Member</label>
            <select
              className={selectField}
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
            >
              <option value="ALL">All Staff</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.employeeCode || s.designation || 'Staff'})
                </option>
              ))}
            </select>
          </div>

          {/* Attendance Status */}
          <div>
            <label className={filterLabel}>Status</label>
            <select
              className={selectField}
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              <option value="PRESENT">Present</option>
              <option value="ABSENT">Absent</option>
              <option value="PAID_LEAVE">Paid Leave</option>
              <option value="UNPAID_LEAVE">Unpaid Leave</option>
              <option value="HALF_DAY">Half Day</option>
              <option value="MISSING_PUNCH">Missing Punch</option>
              <option value="HOLIDAY">Holiday</option>
            </select>
          </div>

          {/* Overtime Status */}
          <div>
            <label className={filterLabel}>Overtime</label>
            <select
              className={selectField}
              value={selectedOtStatus}
              onChange={(e) => setSelectedOtStatus(e.target.value)}
            >
              <option value="ALL">All Overtime</option>
              <option value="APPROVED">Approved OT Only</option>
              <option value="SUBMITTED">Pending Approval</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>

          {/* Keyword Search */}
          <div>
            <label className={filterLabel}>Search</label>
            <input
              type="text"
              placeholder="Staff, code, or role..."
              className={inputField}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Reset button */}
          <div className="pt-1">
            <button
              type="button"
              onClick={handleResetFilter}
              className="p-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 rounded-lg text-xs h-8 transition-colors"
              title="Reset Filters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      }
      metaNotice={
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-[#0047AB] shrink-0" />
          <span>
            <strong>Regulatory Rule:</strong> Overtime is authorized exclusively by Administrators via approved manual entry (§11.1). Biometric duration never automatically generates payable overtime without managerial sanction.
          </span>
        </div>
      }
      kpiStrip={
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-1.5 text-slate-500 text-[10px] font-semibold uppercase tracking-wider mb-1">
              <CalendarCheck className="w-3.5 h-3.5 text-slate-400" />
              <span>Records</span>
            </div>
            <div className="text-lg font-bold text-slate-900">{kpis?.totalRecords ?? 0}</div>
            <div className="text-[10px] text-slate-400">Total days tracked</div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-1.5 text-emerald-700 text-[10px] font-semibold uppercase tracking-wider mb-1">
              <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Present</span>
            </div>
            <div className="text-lg font-bold text-emerald-700">{kpis?.presentCount ?? 0}</div>
            <div className="text-[10px] text-emerald-600">Days attended</div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-1.5 text-rose-700 text-[10px] font-semibold uppercase tracking-wider mb-1">
              <UserX className="w-3.5 h-3.5 text-rose-500" />
              <span>Absent</span>
            </div>
            <div className="text-lg font-bold text-rose-700">{kpis?.absentCount ?? 0}</div>
            <div className="text-[10px] text-rose-600">Unexcused days</div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-1.5 text-amber-700 text-[10px] font-semibold uppercase tracking-wider mb-1">
              <Calendar className="w-3.5 h-3.5 text-amber-500" />
              <span>On Leave</span>
            </div>
            <div className="text-lg font-bold text-amber-700">{kpis?.leaveCount ?? 0}</div>
            <div className="text-[10px] text-amber-600">Paid / Unpaid leaves</div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-1.5 text-orange-700 text-[10px] font-semibold uppercase tracking-wider mb-1">
              <ClockAlert className="w-3.5 h-3.5 text-orange-500" />
              <span>Late Arrivals</span>
            </div>
            <div className="text-lg font-bold text-orange-700">{kpis?.lateCount ?? 0}</div>
            <div className="text-[10px] text-orange-600">Infractions logged</div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-1.5 text-indigo-700 text-[10px] font-semibold uppercase tracking-wider mb-1">
              <Clock className="w-3.5 h-3.5 text-indigo-500" />
              <span>Worked Hours</span>
            </div>
            <div className="text-lg font-bold text-indigo-700">{kpis?.totalWorkedHours ?? 0}h</div>
            <div className="text-[10px] text-indigo-600">Cumulative time</div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-1.5 text-purple-700 text-[10px] font-semibold uppercase tracking-wider mb-1">
              <Timer className="w-3.5 h-3.5 text-purple-500" />
              <span>Auth. Overtime</span>
            </div>
            <div className="text-lg font-bold text-purple-700">{kpis?.authorizedOtHours ?? 0}h</div>
            <div className="text-[10px] text-purple-600">Approved OT hours</div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-1.5 text-purple-800 text-[10px] font-semibold uppercase tracking-wider mb-1">
              <Building2 className="w-3.5 h-3.5 text-purple-600" />
              <span>OT Payable</span>
            </div>
            <div className="text-lg font-bold text-purple-900">{formatCurrency(kpis?.authorizedOtAmount ?? 0)}</div>
            <div className="text-[10px] text-purple-600">Total authorized pay</div>
          </div>
        </div>
      }
    >
      {/* Error state */}
      {errorMessage && (
        <div className="mb-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Landscape Scrolling Table */}
      <ReportTable
        columns={columns}
        data={reportData?.rows || []}
        loading={isLoading}
        emptyMessage="No attendance or overtime records found for this period and filter criteria."
        renderTotals={() =>
          totals && reportData && reportData.rows.length > 0 ? (
            <tr className="bg-slate-100/90 font-bold text-slate-900 border-t-2 border-slate-300 text-xs">
              <td colSpan={6} className="py-2.5 px-3">
                Summary Totals ({reportData.rows.length} records)
              </td>
              <td className="py-2.5 px-3 text-right font-mono">{totals.scheduledHours}h</td>
              <td className="py-2.5 px-3 text-right font-mono text-indigo-700">{totals.workedHours}h</td>
              <td className="py-2.5 px-3 text-amber-700 font-mono">
                {totals.lateMinutes > 0 ? `${totals.lateMinutes}m total late` : '—'}
              </td>
              <td className="py-2.5 px-3 text-center">—</td>
              <td className="py-2.5 px-3 text-center text-emerald-700 font-mono">{totals.otHours}h OT</td>
              <td className="py-2.5 px-3 text-right font-mono text-purple-700">{formatCurrency(totals.otAmount)}</td>
              <td colSpan={2} />
            </tr>
          ) : null
        }
      />
    </ReportShell>
  );
};
