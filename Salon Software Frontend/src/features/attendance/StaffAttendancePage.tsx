import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { salonService } from '../../services';
import {
  AttendanceRecord,
  StaffMember,
  Branch,
  LeaveRecord,
  CSVAttendanceImportRow,
  CSVAttendanceImportResult,
  AttendanceStatus,
  AttendanceSource,
  BranchHoliday,
} from '../../types/salon';
import {
  Clock,
  Calendar,
  Search,
  Filter,
  Plus,
  FileSpreadsheet,
  Printer,
  Upload,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  History,
  Edit,
  X,
  UserCheck,
  UserX,
  FileText,
  Radio,
  Download,
  Info,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { formatMinutesToTime, parseTimeToMinutes, evaluateLeaveAllowance } from '../../lib/attendanceCalculations';
import { AccessDeniedView } from '../scaffold/AccessDeniedView';
import { toast } from '../../context/ToastContext';

export const StaffAttendancePage: React.FC = () => {
  const { user, activeBranchId, allBranches, demoDate } = useAuth();

  // Role guard: Super Admin and Admin only (Accountant and Staff denied)
  if (!user || (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN')) {
    return <AccessDeniedView attemptedPath="/operations/attendance" />;
  }

  const initialDate = demoDate || new Date().toISOString().slice(0, 10);

  // State
  const [loading, setLoading] = useState<boolean>(true);
  const [attendanceList, setAttendanceList] = useState<AttendanceRecord[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [leavesList, setLeavesList] = useState<LeaveRecord[]>([]);
  const [holidaysList, setHolidaysList] = useState<BranchHoliday[]>([]);

  // Filter controls
  const [viewMode, setViewMode] = useState<'DAY' | 'MONTH'>('DAY');
  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [selectedMonth, setSelectedMonth] = useState<string>(initialDate.slice(0, 7));
  const [selectedBranchId, setSelectedBranchId] = useState<string>(activeBranchId);
  const [staffFilter, setStaffFilter] = useState<string>('ALL');
  const [designationFilter, setDesignationFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals state
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showMarkAllModal, setShowMarkAllModal] = useState<boolean>(false);
  const [showCorrectModal, setShowCorrectModal] = useState<boolean>(false);
  const [showLeaveModal, setShowLeaveModal] = useState<boolean>(false);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [showFinalizeModal, setShowFinalizeModal] = useState<boolean>(false);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);

  // Selected item for modals
  const [activeRecord, setActiveRecord] = useState<AttendanceRecord | null>(null);

  // Form states
  const [markAllForm, setMarkAllForm] = useState({
    date: selectedDate,
    status: 'PRESENT' as 'PRESENT' | 'ABSENT',
    checkIn: '09:00 AM',
    checkOut: '06:00 PM',
    notes: 'Bulk marked by manager',
  });

  const [addForm, setAddForm] = useState({
    staffId: '',
    date: selectedDate,
    checkIn: '09:00 AM',
    checkOut: '06:00 PM',
    isOvernightShift: false,
    notes: '',
  });

  const [correctForm, setCorrectForm] = useState({
    checkIn: '',
    checkOut: '',
    status: 'PRESENT' as AttendanceStatus,
    reason: '',
    notes: '',
  });

  const [leaveForm, setLeaveForm] = useState({
    staffId: '',
    startDate: selectedDate,
    endDate: selectedDate,
    type: 'PAID' as 'PAID' | 'UNPAID',
    reason: '',
  });

  // CSV Import State
  const [importCsvText, setImportCsvText] = useState<string>('');
  const [importPreview, setImportPreview] = useState<CSVAttendanceImportRow[]>([]);
  const [importResult, setImportResult] = useState<CSVAttendanceImportResult | null>(null);

  // Action status messages
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Effective branch
  const effectiveBranchId = user?.role === 'SUPER_ADMIN' ? selectedBranchId : (user?.branchId || activeBranchId);

  // Load data
  const loadData = async () => {
    try {
      setLoading(true);
      const [sysDate, allStaff, atts, leaves, holidays] = await Promise.all([
        salonService.getSystemDate(),
        salonService.getStaff(effectiveBranchId),
        salonService.getAttendance(effectiveBranchId, viewMode === 'DAY' ? selectedDate : undefined, undefined, user || undefined),
        salonService.getLeaves(effectiveBranchId, undefined, user || undefined),
        salonService.getBranchHolidays(effectiveBranchId),
      ]);

      if (!selectedDate) {
        setSelectedDate(sysDate);
        setSelectedMonth(sysDate.slice(0, 7));
      }

      setStaffList(allStaff);
      setLeavesList(leaves);
      setHolidaysList(holidays);

      if (viewMode === 'MONTH') {
        const monthAtts = atts.filter((a) => a.date.startsWith(selectedMonth));
        setAttendanceList(monthAtts);
      } else {
        setAttendanceList(atts);
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to load attendance records.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [effectiveBranchId, selectedDate, selectedMonth, viewMode]);

  // Unique designations for filter dropdown
  const uniqueDesignations = useMemo(() => {
    const set = new Set<string>();
    staffList.forEach((s) => {
      if (s.designation) set.add(s.designation);
      else if (s.roleTitle) set.add(s.roleTitle);
    });
    return Array.from(set);
  }, [staffList]);

  // Filtered records
  const filteredRecords = useMemo(() => {
    return attendanceList.filter((rec) => {
      if (staffFilter !== 'ALL' && rec.staffId !== staffFilter) return false;
      if (designationFilter !== 'ALL' && rec.designation !== designationFilter) return false;
      if (statusFilter !== 'ALL' && rec.status !== statusFilter) return false;
      if (sourceFilter !== 'ALL' && rec.source !== sourceFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = rec.staffName.toLowerCase().includes(q);
        const matchesCode = (rec.employeeCode || '').toLowerCase().includes(q);
        if (!matchesName && !matchesCode) return false;
      }
      return true;
    });
  }, [attendanceList, staffFilter, designationFilter, statusFilter, sourceFilter, searchQuery]);

  // KPI Calculations
  const summaryKpis = useMemo(() => {
    let present = 0;
    let absent = 0;
    let paidLeave = 0;
    let unpaidLeave = 0;
    let lateCount = 0;
    let earlyCount = 0;
    let missingPunches = 0;

    for (const r of filteredRecords) {
      if (r.status === 'PRESENT' || r.status === 'COMPLETED' || r.status === 'ON_TIME' || r.status === 'LATE') {
        present++;
      } else if (r.status === 'ABSENT') {
        absent++;
      } else if (r.status === 'PAID_LEAVE') {
        paidLeave++;
      } else if (r.status === 'UNPAID_LEAVE') {
        unpaidLeave++;
      } else if (r.status === 'MISSING_PUNCH') {
        missingPunches++;
      }

      if (r.isLate) lateCount++;
      if (r.isEarlyExit) earlyCount++;
    }

    return { present, absent, paidLeave, unpaidLeave, lateCount, earlyCount, missingPunches };
  }, [filteredRecords]);

  // Handle Mark All Attendance
  const handleMarkAllSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await salonService.markAllAttendance(
        {
          branchId: effectiveBranchId === 'ALL' ? undefined : effectiveBranchId,
          date: markAllForm.date,
          status: markAllForm.status,
          checkIn: markAllForm.checkIn,
          checkOut: markAllForm.checkOut || undefined,
          notes: markAllForm.notes,
        },
        user || undefined
      );

      if (res.markedCount > 0) {
        toast.success(`Marked ${res.markedCount} active employee(s) as ${markAllForm.status.toLowerCase()}!`);
      } else {
        toast.info(`All employees already marked or on leave for ${markAllForm.date}.`);
      }
      setShowMarkAllModal(false);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to mark all attendance.');
    }
  };

  // Handle Add Attendance
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.staffId) {
      toast.error('Please select an employee.');
      return;
    }
    try {
      await salonService.createAttendance(
        {
          branchId: effectiveBranchId === 'ALL' ? staffList[0]?.branchId : effectiveBranchId,
          staffId: addForm.staffId,
          date: addForm.date,
          checkIn: addForm.checkIn,
          checkOut: addForm.checkOut || undefined,
          isOvernightShift: addForm.isOvernightShift,
          notes: addForm.notes,
          source: 'MANUAL',
        },
        user || undefined
      );

      const staff = staffList.find((s) => s.id === addForm.staffId);
      toast.success(`Attendance recorded for ${staff?.name || 'staff member'}.`);
      setShowAddModal(false);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error creating attendance.');
    }
  };

  // Handle Correct Attendance
  const openCorrectModal = (rec: AttendanceRecord) => {
    setActiveRecord(rec);
    setCorrectForm({
      checkIn: rec.checkIn || '',
      checkOut: rec.checkOut || '',
      status: rec.status,
      reason: '',
      notes: rec.notes || '',
    });
    setShowCorrectModal(true);
  };

  const handleCorrectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRecord) return;
    if (!correctForm.reason.trim()) {
      toast.error('A correction reason is required.');
      return;
    }
    try {
      await salonService.correctAttendance(
        activeRecord.id,
        {
          checkIn: correctForm.checkIn,
          checkOut: correctForm.checkOut || undefined,
          status: correctForm.status,
          reason: correctForm.reason,
          notes: correctForm.notes,
        },
        user || undefined
      );

      toast.success(`Attendance corrected for ${activeRecord.staffName}.`);
      setShowCorrectModal(false);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to correct attendance.');
    }
  };

  // Handle Mark Leave
  const handleLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveForm.staffId) {
      toast.error('Please select an employee.');
      return;
    }
    try {
      const selectedStaff = staffList.find((s) => s.id === leaveForm.staffId);
      const bId = selectedStaff?.branchId || effectiveBranchId;
      const res = await salonService.markLeave(
        {
          branchId: bId,
          staffId: leaveForm.staffId,
          startDate: leaveForm.startDate,
          endDate: leaveForm.endDate,
          type: leaveForm.type,
          reason: leaveForm.reason,
        },
        user || undefined
      );

      toast.success(`Leave ${res.leaveNumber} marked for ${res.staffName} (${res.totalDays} working days).`);
      setShowLeaveModal(false);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to mark leave.');
    }
  };

  // Handle Finalize Day
  const handleFinalizeDay = async () => {
    try {
      const res = await salonService.finalizeDayAttendance(effectiveBranchId, selectedDate, user || undefined);
      toast.success(`Workday finalized: ${res.finalizedCount} records processed.`);
      setShowFinalizeModal(false);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to finalize attendance.');
    }
  };

  // Handle CSV Import
  const handleParseCsv = () => {
    if (!importCsvText.trim()) return;
    const lines = importCsvText.trim().split('\n');
    const parsedRows: CSVAttendanceImportRow[] = [];

    // Skip header if contains 'employee_code' or 'employee'
    const startIdx = lines[0].toLowerCase().includes('employee') ? 1 : 0;

    for (let i = startIdx; i < lines.length; i++) {
      const parts = lines[i].split(',').map((p) => p.trim());
      if (parts.length < 3) continue;

      const [code, date, checkIn, checkOut, deviceId] = parts;
      parsedRows.push({
        rowNumber: i + 1,
        employeeCode: code || '',
        date: date || selectedDate,
        checkIn: checkIn || '',
        checkOut: checkOut || undefined,
        deviceId: deviceId || 'BIO-IMPORT',
        status: 'VALID',
      });
    }

    setImportPreview(parsedRows);
  };

  const handleExecuteImport = async () => {
    try {
      const res = await salonService.importAttendanceCSV(effectiveBranchId, importPreview, user || undefined);
      setImportResult(res);
      toast.success(`Import complete: ${res.acceptedRows} accepted, ${res.duplicateRows} duplicates skipped, ${res.rejectedRows} rejected.`);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Import failed.');
    }
  };

  // Export filtered attendance to CSV
  const handleExportCsv = () => {
    const headers = [
      'Work Date',
      'Employee Code',
      'Employee Name',
      'Designation',
      'Scheduled Shift',
      'Check-In',
      'Check-Out',
      'Worked Hours',
      'Status',
      'Late (Mins)',
      'Early (Mins)',
      'Source',
      'Notes',
    ];

    const rows = filteredRecords.map((r) => [
      `"${r.date}"`,
      `"${r.employeeCode || ''}"`,
      `"${r.staffName}"`,
      `"${r.designation || ''}"`,
      `"${r.scheduledShift || ''}"`,
      `"${r.checkIn}"`,
      `"${r.checkOut || ''}"`,
      r.workedHours,
      `"${r.status}"`,
      r.lateMinutes || 0,
      r.earlyExitMinutes || 0,
      `"${r.source || 'MANUAL'}"`,
      `"${(r.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Attendance_Statement_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Selected leave preview helper
  const leaveStaffPreview = useMemo(() => {
    if (!leaveForm.staffId) return null;
    const staff = staffList.find((s) => s.id === leaveForm.staffId);
    if (!staff) return null;
    return evaluateLeaveAllowance(staff, leavesList, leaveForm.startDate, holidaysList);
  }, [leaveForm.staffId, leaveForm.startDate, staffList, leavesList, holidaysList]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 font-['Poppins']">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Staff Attendance & Punches</h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Operations
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Biometric and manual shift verification, grace threshold auditing, and leave tracking
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => {
              setMarkAllForm((prev) => ({ ...prev, date: selectedDate }));
              setShowMarkAllModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors shadow-xs cursor-pointer"
          >
            <UserCheck className="w-4 h-4" />
            Mark All Attendance
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#2254E1] text-white text-xs font-semibold hover:bg-blue-700 transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Individual
          </button>

          <button
            onClick={() => setShowLeaveModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
          >
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
            Mark Leave
          </button>

          <button
            onClick={() => setShowFinalizeModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-50 border border-amber-300 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors shadow-xs"
            title="Preview missing punches and mark completed day absences"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            Finalize Day
          </button>

          <button
            onClick={() => setShowImportModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
          >
            <Upload className="w-3.5 h-3.5 text-slate-500" />
            CSV Import
          </button>

          <button
            onClick={() => setShowPrintModal(true)}
            className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            title="Print Attendance Statement"
          >
            <Printer className="w-4 h-4" />
          </button>

          <button
            onClick={handleExportCsv}
            className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            title="Export CSV"
          >
            <FileSpreadsheet className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* FEEDBACK ALERT */}
      {feedbackMsg && (
        <div
          className={`p-3.5 rounded-lg flex items-center justify-between text-sm ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
          <button onClick={() => setFeedbackMsg(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SUMMARY KPI CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Present</span>
            <UserCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-1">{summaryKpis.present}</p>
          <p className="text-[10px] text-emerald-600 mt-0.5 font-medium">On-duty verified</p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Absent</span>
            <UserX className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-2xl font-bold text-rose-700 mt-1">{summaryKpis.absent}</p>
          <p className="text-[10px] text-rose-500 mt-0.5 font-medium">Unexcused off</p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Paid Leave</span>
            <Calendar className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-blue-700 mt-1">{summaryKpis.paidLeave}</p>
          <p className="text-[10px] text-blue-500 mt-0.5 font-medium">Approved voucher</p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Unpaid Leave</span>
            <Calendar className="w-4 h-4 text-slate-500" />
          </div>
          <p className="text-2xl font-bold text-slate-700 mt-1">{summaryKpis.unpaidLeave}</p>
          <p className="text-[10px] text-slate-400 mt-0.5 font-medium">No pay credit</p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Late Arrivals</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-amber-700 mt-1">{summaryKpis.lateCount}</p>
          <p className="text-[10px] text-amber-600 mt-0.5 font-medium">Past grace period</p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Early Exits</span>
            <Clock className="w-4 h-4 text-orange-600" />
          </div>
          <p className="text-2xl font-bold text-orange-700 mt-1">{summaryKpis.earlyCount}</p>
          <p className="text-[10px] text-orange-600 mt-0.5 font-medium">Prior to shift end</p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Missing Punches</span>
            <AlertTriangle className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-purple-700 mt-1">{summaryKpis.missingPunches}</p>
          <p className="text-[10px] text-purple-500 mt-0.5 font-medium">No check-out logged</p>
        </div>
      </div>

      {/* FILTER CONTROLS BAR */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Day vs Month Toggle */}
          <div className="inline-flex p-1 bg-slate-100 rounded-lg">
            <button
              onClick={() => setViewMode('DAY')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                viewMode === 'DAY' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Day View
            </button>
            <button
              onClick={() => setViewMode('MONTH')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                viewMode === 'MONTH' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Monthly View
            </button>
          </div>

          {/* Date Picker / Month Selector */}
          <div className="flex items-center gap-2">
            {viewMode === 'DAY' ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-slate-500">Work Date:</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-slate-500">Month:</span>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}

            {/* Super Admin Branch Switcher */}
            {user?.role === 'SUPER_ADMIN' && (
              <div className="flex items-center gap-1.5 ml-2">
                <span className="text-xs font-medium text-slate-500">Branch:</span>
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
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
          </div>
        </div>

        {/* Secondary filters row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5 pt-2 border-t border-slate-100">
          {/* Search query */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search name or employee code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Staff Filter */}
          <select
            value={staffFilter}
            onChange={(e) => setStaffFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-slate-700"
          >
            <option value="ALL">All Employees</option>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.employeeCode})
              </option>
            ))}
          </select>

          {/* Designation Filter */}
          <select
            value={designationFilter}
            onChange={(e) => setDesignationFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-slate-700"
          >
            <option value="ALL">All Designations</option>
            {uniqueDesignations.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-slate-700"
          >
            <option value="ALL">All Statuses</option>
            <option value="PRESENT">Present</option>
            <option value="ABSENT">Absent</option>
            <option value="PAID_LEAVE">Paid Leave</option>
            <option value="UNPAID_LEAVE">Unpaid Leave</option>
            <option value="MISSING_PUNCH">Missing Punch</option>
          </select>

          {/* Source Filter */}
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-slate-700"
          >
            <option value="ALL">All Sources</option>
            <option value="MANUAL">Manual Entry</option>
            <option value="IMPORT">CSV Import</option>
            <option value="BIOMETRIC">Biometric Machine</option>
          </select>
        </div>
      </div>

      {/* ATTENDANCE TABLE */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-3">Work Date</th>
                <th className="py-3 px-3">Scheduled Shift</th>
                <th className="py-3 px-3">Check-In</th>
                <th className="py-3 px-3">Check-Out</th>
                <th className="py-3 px-3">Duration</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Deduction Preview</th>
                <th className="py-3 px-3">Source</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <div className="inline-flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <span>Loading attendance records...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <Clock className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="text-sm font-semibold text-slate-600">No attendance records found for {selectedDate}</p>
                    <p className="text-xs text-slate-400 mt-1 mb-4">
                      No punches logged for this date. You can mark everyone with 1 click or record individual attendance.
                    </p>
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setMarkAllForm((prev) => ({ ...prev, date: selectedDate }));
                          setShowMarkAllModal(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors shadow-xs cursor-pointer"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        Mark All Attendance
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAddModal(true)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Individual
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((rec) => {
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Employee */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{rec.staffName}</div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {rec.employeeCode || 'N/A'} • {rec.designation || 'Staff'}
                        </div>
                      </td>

                      {/* Work Date */}
                      <td className="py-3 px-3 font-medium whitespace-nowrap text-slate-800">
                        {rec.date}
                      </td>

                      {/* Scheduled Shift */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-medium text-slate-700">
                          {rec.scheduledShift || '09:00 AM - 06:00 PM'}
                        </div>
                        {rec.isOvernightShift && (
                          <span className="inline-block mt-0.5 text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
                            Overnight
                          </span>
                        )}
                      </td>

                      {/* Check-In */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-medium text-slate-900">{rec.checkIn}</div>
                        {rec.isLate && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 mt-0.5">
                            Late: +{rec.lateMinutes}m
                          </span>
                        )}
                      </td>

                      {/* Check-Out */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {rec.checkOut ? (
                          <>
                            <div className="font-medium text-slate-900">{rec.checkOut}</div>
                            {rec.isEarlyExit && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-orange-700 bg-orange-50 px-1.5 py-0.2 rounded border border-orange-200 mt-0.5">
                                Early: -{rec.earlyExitMinutes}m
                              </span>
                            )}
                          </>
                        ) : rec.status === 'ABSENT' || rec.status === 'PAID_LEAVE' || rec.status === 'UNPAID_LEAVE' ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                            Missing Check-Out
                          </span>
                        )}
                      </td>

                      {/* Worked Duration */}
                      <td className="py-3 px-3 font-medium whitespace-nowrap text-slate-800">
                        {rec.workedHours > 0 ? `${rec.workedHours.toFixed(2)} hrs` : '0.00 hrs'}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {rec.status === 'PRESENT' || rec.status === 'COMPLETED' || rec.status === 'ON_TIME' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Present
                          </span>
                        ) : rec.status === 'ABSENT' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            Absent
                          </span>
                        ) : rec.status === 'PAID_LEAVE' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            Paid Leave
                          </span>
                        ) : rec.status === 'UNPAID_LEAVE' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            Unpaid Leave
                          </span>
                        ) : rec.status === 'MISSING_PUNCH' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                            Missing Punch
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
                            {rec.status}
                          </span>
                        )}
                      </td>

                      {/* Deduction Preview */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {rec.calculationSnapshot ? (
                          rec.calculationSnapshot.totalDeductionAmount > 0 ? (
                            <div className="group relative cursor-pointer">
                              <span className="font-semibold text-rose-600">
                                Rs. {rec.calculationSnapshot.totalDeductionAmount.toLocaleString()}
                              </span>
                              <div className="text-[10px] text-slate-400">
                                {rec.calculationSnapshot.combinationPolicy}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">Rs. 0</span>
                          )
                        ) : (
                          <span className="text-[11px] text-slate-400">Rs. 0</span>
                        )}
                      </td>

                      {/* Source */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {rec.source || 'MANUAL'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-1">
                        <button
                          onClick={() => openCorrectModal(rec)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors"
                        >
                          <Edit className="w-3 h-3" />
                          Correct
                        </button>

                        {rec.correctionHistory && rec.correctionHistory.length > 0 && (
                          <button
                            onClick={() => {
                              setActiveRecord(rec);
                              setShowHistoryModal(true);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                            title="View correction audit history"
                          >
                            <History className="w-3 h-3" />
                            {rec.correctionHistory.length}
                          </button>
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

      {/* MODAL 0: MARK ALL ATTENDANCE */}
      {showMarkAllModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-emerald-600" />
                  Mark All Attendance
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Record attendance for all active staff in {allBranches.find((b) => b.id === effectiveBranchId)?.name || 'current branch'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowMarkAllModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleMarkAllSubmit} className="p-5 space-y-4">
              <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200/80 text-emerald-900 text-xs flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-semibold text-emerald-950">
                    Bulk Attendance Action ({staffList.length} Active Employees)
                  </p>
                  <p className="text-[11px] text-emerald-800 leading-relaxed">
                    This will mark all scheduled active staff members who do not already have punches or approved leave for this date.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Work Date *</label>
                  <input
                    type="date"
                    required
                    value={markAllForm.date}
                    onChange={(e) => setMarkAllForm({ ...markAllForm, date: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Attendance Status *</label>
                  <select
                    value={markAllForm.status}
                    onChange={(e) => setMarkAllForm({ ...markAllForm, status: e.target.value as 'PRESENT' | 'ABSENT' })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white font-medium"
                  >
                    <option value="PRESENT">Mark Present (Full Day)</option>
                    <option value="ABSENT">Mark Absent</option>
                  </select>
                </div>
              </div>

              {markAllForm.status === 'PRESENT' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Default Check-In *</label>
                    <input
                      type="text"
                      required
                      placeholder="09:00 AM"
                      value={markAllForm.checkIn}
                      onChange={(e) => setMarkAllForm({ ...markAllForm, checkIn: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Default Check-Out *</label>
                    <input
                      type="text"
                      required
                      placeholder="06:00 PM"
                      value={markAllForm.checkOut}
                      onChange={(e) => setMarkAllForm({ ...markAllForm, checkOut: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Remarks / Audit Note</label>
                <input
                  type="text"
                  placeholder="e.g. Full salon team on duty"
                  value={markAllForm.notes}
                  onChange={(e) => setMarkAllForm({ ...markAllForm, notes: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Staff Roster Preview */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Employees to be updated ({staffList.length}):
                </label>
                <div className="max-h-32 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-100 text-xs">
                  {staffList.length === 0 ? (
                    <p className="text-slate-400 text-center py-2">No active staff registered in this branch.</p>
                  ) : (
                    staffList.map((st) => (
                      <div key={st.id} className="py-1 px-1.5 flex items-center justify-between text-slate-700">
                        <span className="font-medium text-slate-900">{st.name}</span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {st.employeeCode} • {st.designation || 'Stylist'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowMarkAllModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={staffList.length === 0}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs cursor-pointer disabled:opacity-50"
                >
                  Confirm & Mark All
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 1: ADD ATTENDANCE */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Add Staff Attendance</h3>
                <p className="text-xs text-slate-500 mt-0.5">Record check-in and check-out punches for a shift</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Employee *</label>
                <select
                  required
                  value={addForm.staffId}
                  onChange={(e) => {
                    const st = staffList.find((s) => s.id === e.target.value);
                    setAddForm({
                      ...addForm,
                      staffId: e.target.value,
                      isOvernightShift: st?.isOvernightShift || false,
                      checkIn: st ? formatMinutesToTime(parseTimeToMinutes(st.startTime)) : '09:00 AM',
                      checkOut: st ? formatMinutesToTime(parseTimeToMinutes(st.endTime)) : '06:00 PM',
                    });
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                >
                  <option value="">-- Choose Staff Member --</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.employeeCode}) • {s.designation || s.roleTitle}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Work Date *</label>
                  <input
                    type="date"
                    required
                    value={addForm.date}
                    onChange={(e) => setAddForm({ ...addForm, date: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center pt-6">
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addForm.isOvernightShift}
                      onChange={(e) => setAddForm({ ...addForm, isOvernightShift: e.target.checked })}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="font-medium">Overnight shift (spans midnight)</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Check-In Time *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 09:00 AM"
                    value={addForm.checkIn}
                    onChange={(e) => setAddForm({ ...addForm, checkIn: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Check-Out Time (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. 06:00 PM"
                    value={addForm.checkOut}
                    onChange={(e) => setAddForm({ ...addForm, checkOut: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Shift Notes</label>
                <textarea
                  rows={2}
                  placeholder="Optional operational or punctuality remarks..."
                  value={addForm.notes}
                  onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-blue-800 leading-relaxed">
                  Lateness and early exits will be calculated automatically against this employee's shift grace threshold.
                  Check-ins exactly at the grace threshold are considered on-time.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-[#2254E1] hover:bg-blue-700 shadow-xs"
                >
                  Save Attendance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CORRECT ATTENDANCE */}
      {showCorrectModal && activeRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Correct Attendance Punches</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Audit correction for {activeRecord.staffName} ({activeRecord.date})
                </p>
              </div>
              <button onClick={() => setShowCorrectModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCorrectSubmit} className="p-5 space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Scheduled Shift:</span>
                  <span className="font-medium text-slate-800">{activeRecord.scheduledShift || '09:00 AM - 06:00 PM'}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Current Check-In / Out:</span>
                  <span className="font-medium text-slate-800">
                    {activeRecord.checkIn} / {activeRecord.checkOut || 'Missing punch'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">New Check-In *</label>
                  <input
                    type="text"
                    required
                    value={correctForm.checkIn}
                    onChange={(e) => setCorrectForm({ ...correctForm, checkIn: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">New Check-Out</label>
                  <input
                    type="text"
                    placeholder="Leave empty if missing"
                    value={correctForm.checkOut}
                    onChange={(e) => setCorrectForm({ ...correctForm, checkOut: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Attendance Status *</label>
                <select
                  value={correctForm.status}
                  onChange={(e) => setCorrectForm({ ...correctForm, status: e.target.value as AttendanceStatus })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                >
                  <option value="PRESENT">Present</option>
                  <option value="MISSING_PUNCH">Missing Punch</option>
                  <option value="ABSENT">Absent</option>
                  <option value="PAID_LEAVE">Paid Leave</option>
                  <option value="UNPAID_LEAVE">Unpaid Leave</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Correction *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="Mandatory audit explanation (e.g. employee biometric punch failed, manager approved adjustment)..."
                  value={correctForm.reason}
                  onChange={(e) => setCorrectForm({ ...correctForm, reason: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCorrectModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-xs"
                >
                  Save Correction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: MARK LEAVE */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Mark Staff Leave</h3>
                <p className="text-xs text-slate-500 mt-0.5">Approve paid or unpaid absence with allowance preview</p>
              </div>
              <button onClick={() => setShowLeaveModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleLeaveSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Employee *</label>
                <select
                  required
                  value={leaveForm.staffId}
                  onChange={(e) => setLeaveForm({ ...leaveForm, staffId: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                >
                  <option value="">-- Choose Staff Member --</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.employeeCode})
                    </option>
                  ))}
                </select>
              </div>

              {/* Allowance preview badge */}
              {leaveStaffPreview && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                  <div className="font-semibold text-slate-800 flex items-center justify-between">
                    <span>Leave Entitlement Preview:</span>
                    <span className="text-[10px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {leaveStaffPreview.period} Policy
                    </span>
                  </div>
                  {leaveStaffPreview.isConfigured ? (
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <div>
                        <span className="text-slate-400 text-[10px]">Allowed:</span>
                        <div className="font-bold text-slate-900">{leaveStaffPreview.allowedDays} days</div>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px]">Used:</span>
                        <div className="font-bold text-amber-600">{leaveStaffPreview.usedDays} days</div>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px]">Remaining:</span>
                        <div className="font-bold text-emerald-600">{leaveStaffPreview.remainingDays} days</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-amber-800 font-medium text-xs">
                      Paid leave allowance: <strong>Not configured</strong> (Must use unpaid leave or configure staff profile first).
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={leaveForm.startDate}
                    onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">End Date *</label>
                  <input
                    type="date"
                    required
                    value={leaveForm.endDate}
                    onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Leave Type *</label>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer text-xs font-medium ${
                      leaveForm.type === 'PAID'
                        ? 'bg-blue-50 border-blue-300 text-blue-900 font-semibold'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="leaveType"
                      value="PAID"
                      checked={leaveForm.type === 'PAID'}
                      onChange={() => setLeaveForm({ ...leaveForm, type: 'PAID' })}
                      className="text-blue-600"
                    />
                    <span>Paid Leave (Counted)</span>
                  </label>

                  <label
                    className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer text-xs font-medium ${
                      leaveForm.type === 'UNPAID'
                        ? 'bg-slate-100 border-slate-400 text-slate-900 font-semibold'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="leaveType"
                      value="UNPAID"
                      checked={leaveForm.type === 'UNPAID'}
                      onChange={() => setLeaveForm({ ...leaveForm, type: 'UNPAID' })}
                      className="text-slate-600"
                    />
                    <span>Unpaid Leave (No Pay)</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Leave *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="Medical emergency, vacation, personal reason..."
                  value={leaveForm.reason}
                  onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowLeaveModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-[#2254E1] hover:bg-blue-700 shadow-xs"
                >
                  Confirm Leave
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: CORRECTION HISTORY AUDIT */}
      {showHistoryModal && activeRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Correction Audit Trail</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Historical adjustments for {activeRecord.staffName} ({activeRecord.date})
                </p>
              </div>
              <button onClick={() => setShowHistoryModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 max-h-96 overflow-y-auto space-y-3">
              {activeRecord.correctionHistory && activeRecord.correctionHistory.length > 0 ? (
                activeRecord.correctionHistory.map((corr, idx) => (
                  <div key={corr.id || idx} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800">
                        Adjusted by {corr.editedByName}
                      </span>
                      <span className="text-slate-400 text-[11px]">{new Date(corr.editedAt).toLocaleString()}</span>
                    </div>

                    <div className="text-xs text-slate-600 bg-white p-2 rounded border border-slate-200">
                      <strong>Reason:</strong> {corr.reason}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="p-2 rounded bg-rose-50/50 border border-rose-100 text-rose-900">
                        <span className="font-semibold block text-[10px] text-rose-700 uppercase">Before:</span>
                        <div>Check-In: {corr.beforeSnapshot.checkIn || 'N/A'}</div>
                        <div>Check-Out: {corr.beforeSnapshot.checkOut || 'N/A'}</div>
                        <div>Worked: {corr.beforeSnapshot.workedHours || 0} hrs</div>
                      </div>
                      <div className="p-2 rounded bg-emerald-50/50 border border-emerald-100 text-emerald-900">
                        <span className="font-semibold block text-[10px] text-emerald-700 uppercase">After:</span>
                        <div>Check-In: {corr.afterSnapshot.checkIn || 'N/A'}</div>
                        <div>Check-Out: {corr.afterSnapshot.checkOut || 'N/A'}</div>
                        <div>Worked: {corr.afterSnapshot.workedHours || 0} hrs</div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400 text-center py-6">No correction history recorded.</p>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: CSV IMPORT */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Biometric CSV Attendance Import</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Import punch files exported from standalone biometric punch clocks
                </p>
              </div>
              <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="flex items-center justify-between p-3 bg-blue-50/60 rounded-xl border border-blue-100 text-xs">
                <div>
                  <div className="font-semibold text-blue-900">Expected CSV Format:</div>
                  <div className="text-blue-700 font-mono text-[11px] mt-0.5">
                    employee_code,work_date,check_in_time,check_out_time,device_id
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const sample = `employee_code,work_date,check_in_time,check_out_time,device_id\nEMP-LHE-001,${selectedDate},08:55 AM,06:05 PM,BIO-01\nEMP-LHE-002,${selectedDate},09:12 AM,06:00 PM,BIO-01`;
                    setImportCsvText(sample);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-white px-2.5 py-1 rounded-md border border-blue-200 hover:bg-blue-50"
                >
                  <Download className="w-3 h-3" />
                  Load Sample
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Paste CSV Raw Content:
                </label>
                <textarea
                  rows={5}
                  value={importCsvText}
                  onChange={(e) => setImportCsvText(e.target.value)}
                  placeholder="Paste CSV rows here..."
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-between items-center">
                <button
                  type="button"
                  onClick={handleParseCsv}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300"
                >
                  Preview & Validate
                </button>
                {importPreview.length > 0 && (
                  <span className="text-xs text-slate-500">
                    {importPreview.length} rows parsed
                  </span>
                )}
              </div>

              {/* Preview Table */}
              {importPreview.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                  <div className="bg-slate-50 px-3 py-2 font-semibold text-slate-700 border-b border-slate-200">
                    Parsed Rows Preview:
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full text-left">
                      <thead className="bg-slate-100 text-[10px] text-slate-500 font-semibold uppercase">
                        <tr>
                          <th className="p-2">Row</th>
                          <th className="p-2">Code</th>
                          <th className="p-2">Date</th>
                          <th className="p-2">Check-In</th>
                          <th className="p-2">Check-Out</th>
                          <th className="p-2">Device</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {importPreview.map((r, i) => (
                          <tr key={i}>
                            <td className="p-2 text-slate-400 font-mono">{r.rowNumber}</td>
                            <td className="p-2 font-semibold text-slate-800">{r.employeeCode}</td>
                            <td className="p-2">{r.date}</td>
                            <td className="p-2">{r.checkIn}</td>
                            <td className="p-2">{r.checkOut || '—'}</td>
                            <td className="p-2 text-slate-500">{r.deviceId}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Import Results Banner */}
              {importResult && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                  <div className="font-semibold text-slate-900">Import Ingestion Report:</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 rounded bg-emerald-50 text-emerald-800 font-medium">
                      Accepted: {importResult.acceptedRows}
                    </div>
                    <div className="p-2 rounded bg-amber-50 text-amber-800 font-medium">
                      Duplicates: {importResult.duplicateRows}
                    </div>
                    <div className="p-2 rounded bg-rose-50 text-rose-800 font-medium">
                      Rejected: {importResult.rejectedRows}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowImportModal(false);
                  setImportPreview([]);
                  setImportResult(null);
                }}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Close
              </button>
              {importPreview.length > 0 && !importResult && (
                <button
                  type="button"
                  onClick={handleExecuteImport}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-xs"
                >
                  Confirm & Ingest Punches
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: FINALIZE DAY */}
      {showFinalizeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Finalize Workday Attendance</h3>
                <p className="text-xs text-slate-500 mt-0.5">Work Date: {selectedDate}</p>
              </div>
              <button onClick={() => setShowFinalizeModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs space-y-1.5">
                <div className="font-semibold flex items-center gap-1.5 text-amber-800">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  Finalization Rule Notice:
                </div>
                <p className="leading-relaxed">
                  Finalizing will scan all active scheduled staff in this branch for <strong>{selectedDate}</strong>.
                  Staff members without punches or approved leave will be marked <strong>ABSENT</strong>.
                  Any check-in missing a check-out punch will be locked as <strong>MISSING_PUNCH</strong>.
                </p>
              </div>

              <div className="text-xs text-slate-600 space-y-1">
                <div>• Weekly off days (e.g. Sunday) and branch holidays will be automatically excluded.</div>
                <div>• Future workdays cannot be finalized in advance.</div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowFinalizeModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFinalizeDay}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 shadow-xs"
              >
                Confirm Finalize
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 7: PRINT STATEMENT */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between print:hidden">
              <span className="font-bold text-slate-900 text-sm">Print Attendance Statement</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2254E1] text-white text-xs font-semibold hover:bg-blue-700"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Now
                </button>
                <button onClick={() => setShowPrintModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-8 space-y-6 print:p-0">
              <div className="border-b border-slate-200 pb-4 text-center">
                <h2 className="text-xl font-bold text-slate-900 uppercase tracking-tight">iSysware SalonOS</h2>
                <p className="text-sm font-semibold text-slate-700 mt-1">Official Attendance & Shift Verification Statement</p>
                <p className="text-xs text-slate-500">
                  Date: {selectedDate} • Branch: {allBranches.find((b) => b.id === effectiveBranchId)?.name || 'Consolidated'}
                </p>
              </div>

              <div className="grid grid-cols-4 gap-3 text-xs border border-slate-200 rounded-lg p-3">
                <div>
                  <span className="text-slate-400 block text-[10px]">Present Verified:</span>
                  <span className="font-bold text-slate-900">{summaryKpis.present}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Absent:</span>
                  <span className="font-bold text-rose-700">{summaryKpis.absent}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">On Leave:</span>
                  <span className="font-bold text-blue-700">{summaryKpis.paidLeave + summaryKpis.unpaidLeave}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Late / Early Flags:</span>
                  <span className="font-bold text-amber-700">{summaryKpis.lateCount} / {summaryKpis.earlyCount}</span>
                </div>
              </div>

              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-300 font-semibold text-slate-800 text-[11px]">
                    <th className="py-2">Code</th>
                    <th className="py-2">Staff Name</th>
                    <th className="py-2">Shift</th>
                    <th className="py-2">In</th>
                    <th className="py-2">Out</th>
                    <th className="py-2">Worked</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredRecords.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 font-mono text-[11px]">{r.employeeCode || '—'}</td>
                      <td className="py-2 font-medium">{r.staffName}</td>
                      <td className="py-2 text-[11px]">{r.scheduledShift || '—'}</td>
                      <td className="py-2">{r.checkIn}</td>
                      <td className="py-2">{r.checkOut || '—'}</td>
                      <td className="py-2">{r.workedHours.toFixed(2)}h</td>
                      <td className="py-2 font-semibold">{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="pt-8 grid grid-cols-2 gap-8 text-xs text-center border-t border-slate-200">
                <div>
                  <div className="border-b border-slate-300 w-48 mx-auto pb-6" />
                  <p className="mt-2 text-slate-600 font-medium">Branch Operations Manager</p>
                </div>
                <div>
                  <div className="border-b border-slate-300 w-48 mx-auto pb-6" />
                  <p className="mt-2 text-slate-600 font-medium">Verified by Administrator</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
