import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { salonService } from '@/services';
import {
  InventoryReportData,
  InventorySubReportType,
  InventoryReportQuery,
  InventoryValuationRow,
  InventoryMovementRow,
  InventoryPurchaseRow,
  InventorySupplierLedgerRow,
  InventoryConsumptionRow,
  InventoryExpiryRow,
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
  Boxes,
  History,
  ShoppingCart,
  BookOpen,
  Scissors,
  AlertTriangle,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';

const selectField = 'text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-hidden focus:ring-1 focus:ring-[#0047AB] h-8';
const inputField = 'text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-hidden focus:ring-1 focus:ring-[#0047AB] h-8';
const filterLabel = 'block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1';

export const InventoryReportsPage: React.FC = () => {
  const { user, activeBranchId, allBranches } = useAuth();

  // Role Guard: SUPER_ADMIN, ADMIN, ACCOUNTANT (Staff cannot access)
  if (!user || user.role === 'STAFF') {
    return <AccessDeniedView attemptedPath="/reports/inventory" />;
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const defaultBranch = isSuperAdmin ? (activeBranchId || 'ALL') : (user.branchId || '');

  // Sub-report type
  const [activeTab, setActiveTab] = useState<InventorySubReportType>('valuation');

  // Filter Form State
  const [selectedBranch, setSelectedBranch] = useState<string>(defaultBranch);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedItemType, setSelectedItemType] = useState<string>('ALL');
  const [selectedPreset, setSelectedPreset] = useState<DatePreset>('THIS_MONTH');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Applied Query State (triggers API fetch)
  const [appliedQuery, setAppliedQuery] = useState<InventoryReportQuery>({
    branchId: defaultBranch,
    type: 'valuation',
    categoryId: 'ALL',
    itemType: 'ALL',
    preset: 'THIS_MONTH',
  });

  const [reportData, setReportData] = useState<InventoryReportData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch Report Data from Live Express Backend
  const fetchReport = useCallback(async (q: InventoryReportQuery) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await salonService.getInventoryReport(q);
      setReportData(data);
    } catch (err: any) {
      console.error('Failed to load Inventory report:', err);
      setErrorMessage(err.message || 'Failed to fetch live inventory report from server.');
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
  }, [activeBranchId, isSuperAdmin, selectedBranch]);

  // Re-fetch whenever appliedQuery changes
  useEffect(() => {
    fetchReport(appliedQuery);
  }, [appliedQuery, fetchReport]);

  // Tab switch handler
  const handleTabChange = (tab: InventorySubReportType) => {
    setActiveTab(tab);
    setAppliedQuery((prev) => ({
      ...prev,
      type: tab,
    }));
  };

  // Filter submit handler
  const handleApplyFilter = () => {
    setAppliedQuery({
      branchId: selectedBranch,
      type: activeTab,
      categoryId: selectedCategory !== 'ALL' ? selectedCategory : undefined,
      itemType: selectedItemType !== 'ALL' ? selectedItemType : undefined,
      preset: selectedPreset,
      from: selectedPreset === 'CUSTOM' ? customFrom : undefined,
      to: selectedPreset === 'CUSTOM' ? customTo : undefined,
      search: searchQuery.trim() || undefined,
    });
  };

  // Reset filters handler
  const handleResetFilters = () => {
    setSelectedBranch(defaultBranch);
    setSelectedCategory('ALL');
    setSelectedItemType('ALL');
    setSelectedPreset('THIS_MONTH');
    setCustomFrom('');
    setCustomTo('');
    setSearchQuery('');
    setAppliedQuery({
      branchId: defaultBranch,
      type: activeTab,
      categoryId: 'ALL',
      itemType: 'ALL',
      preset: 'THIS_MONTH',
    });
  };

  // Branch Name helper
  const branchNameDisplay = useMemo(() => {
    if (appliedQuery.branchId === 'ALL') return 'All Branches';
    const found = allBranches.find((b: Branch) => b.id === appliedQuery.branchId);
    return found ? `${found.name} (${found.city})` : reportData?.meta?.branchName || 'Selected Branch';
  }, [appliedQuery.branchId, allBranches, reportData]);

  // ── Column Definitions Per Sub-Report ──────────────────────────────────────

  // 1. Valuation Columns
  const valuationColumns: ColumnDef<InventoryValuationRow>[] = [
    {
      key: 'item',
      header: 'Item & SKU',
      render: (r) => (
        <div>
          <span className="font-semibold text-slate-900 block">{r.itemName}</span>
          <span className="text-[11px] font-mono text-slate-500 tracking-wider">SKU: {r.sku}</span>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category / Type',
      render: (r) => (
        <div>
          <span className="font-medium text-slate-800 text-xs block">{r.category}</span>
          <span className="text-[10px] text-slate-400 uppercase tracking-wider">{r.itemType}</span>
        </div>
      ),
    },
    {
      key: 'batchNumber',
      header: 'Batch #',
      render: (r) => (
        <span className="font-mono text-xs text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
          {r.batchNumber}
        </span>
      ),
    },
    {
      key: 'branch',
      header: 'Branch',
      render: (r) => <span className="text-slate-600 text-xs">{r.branchName}</span>,
    },
    {
      key: 'remainingQuantity',
      header: 'Remaining Qty',
      align: 'right',
      render: (r) => (
        <span className="font-mono font-bold text-slate-900 text-xs">
          {r.remainingQuantity.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'unitCost',
      header: 'Landed Unit Cost',
      align: 'right',
      render: (r) => (
        <span className="font-mono text-slate-700 text-xs">
          {formatCurrency(r.unitCost)}
        </span>
      ),
    },
    {
      key: 'costValue',
      header: 'Inventory Cost Value',
      align: 'right',
      render: (r) => (
        <span className="font-mono font-bold text-blue-900 text-xs">
          {formatCurrency(r.costValue)}
        </span>
      ),
    },
    {
      key: 'sellingPrice',
      header: 'Selling Price',
      align: 'right',
      render: (r) => (
        <span className="font-mono text-slate-600 text-xs">
          {formatCurrency(r.sellingPrice)}
        </span>
      ),
    },
    {
      key: 'retailValue',
      header: 'Potential Retail',
      align: 'right',
      render: (r) => (
        <span className="font-mono font-semibold text-slate-900 text-xs">
          {formatCurrency(r.retailValue)}
        </span>
      ),
    },
    {
      key: 'potentialMargin',
      header: 'Potential Margin',
      align: 'right',
      render: (r) => (
        <span className={`font-mono text-xs font-semibold ${r.potentialMargin >= 40 ? 'text-emerald-700' : 'text-amber-700'}`}>
          {r.potentialMargin.toFixed(1)}%
        </span>
      ),
    },
    {
      key: 'stockStatus',
      header: 'Stock Status',
      render: (r) => {
        if (r.stockStatus === 'OUT_OF_STOCK') {
          return <Badge className="bg-red-50 text-red-700 border-red-200 text-[10px]">Out of Stock</Badge>;
        }
        if (r.stockStatus === 'LOW_STOCK') {
          return <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">Low Stock</Badge>;
        }
        return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">In Stock</Badge>;
      },
    },
    {
      key: 'expiryStatus',
      header: 'Expiry Status',
      render: (r) => {
        if (r.expiryStatus === 'EXPIRED') {
          return <Badge className="bg-red-100 text-red-800 border-red-300 text-[10px]">Expired</Badge>;
        }
        if (r.expiryStatus === 'NEAR_EXPIRY') {
          return <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]">Near Expiry</Badge>;
        }
        return <Badge className="bg-slate-50 text-slate-600 border-slate-200 text-[10px]">Valid</Badge>;
      },
    },
  ];

  // 2. Movements Columns
  const movementsColumns: ColumnDef<InventoryMovementRow>[] = [
    {
      key: 'movementNumber',
      header: 'Movement #',
      render: (r) => (
        <span className="font-mono font-bold text-[#0047AB] bg-blue-50 px-2 py-0.5 rounded text-xs border border-blue-200">
          {r.movementNumber}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Date & Time',
      render: (r) => (
        <div>
          <span className="text-slate-800 text-xs font-medium block">{r.date}</span>
          <span className="text-[10px] text-slate-400 font-mono">{r.time}</span>
        </div>
      ),
    },
    {
      key: 'item',
      header: 'Item & SKU',
      render: (r) => (
        <div>
          <span className="font-semibold text-slate-900 text-xs block">{r.itemName}</span>
          <span className="text-[10px] font-mono text-slate-500">SKU: {r.sku}</span>
        </div>
      ),
    },
    {
      key: 'movementType',
      header: 'Movement Type',
      render: (r) => (
        <Badge className={`text-[10px] ${
          r.direction === 'IN'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-rose-50 text-rose-700 border-rose-200'
        }`}>
          {r.movementType.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    {
      key: 'direction',
      header: 'Direction',
      render: (r) => (
        <span className={`inline-flex items-center gap-1 text-xs font-bold ${
          r.direction === 'IN' ? 'text-emerald-700' : 'text-rose-700'
        }`}>
          {r.direction === 'IN' ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
          {r.direction}
        </span>
      ),
    },
    {
      key: 'quantity',
      header: 'Quantity',
      align: 'right',
      render: (r) => (
        <span className="font-mono font-bold text-slate-900 text-xs">
          {r.quantity.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'unitCost',
      header: 'Unit Cost',
      align: 'right',
      render: (r) => (
        <span className="font-mono text-slate-600 text-xs">
          {formatCurrency(r.unitCost)}
        </span>
      ),
    },
    {
      key: 'totalCost',
      header: 'Total Cost Impact',
      align: 'right',
      render: (r) => (
        <span className="font-mono font-bold text-slate-900 text-xs">
          {formatCurrency(r.totalCost)}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Ref & Reason',
      render: (r) => (
        <div>
          <span className="text-slate-800 text-xs block font-medium">{r.reason || 'N/A'}</span>
          <span className="text-[10px] text-slate-400 font-mono">Ref: {r.sourceReferenceNumber || '-'}</span>
        </div>
      ),
    },
    {
      key: 'userName',
      header: 'Logged By',
      render: (r) => <span className="text-slate-600 text-xs">{r.userName}</span>,
    },
  ];

  // 3. Purchases Columns
  const purchasesColumns: ColumnDef<InventoryPurchaseRow>[] = [
    {
      key: 'purchaseNumber',
      header: 'Purchase #',
      render: (r) => (
        <span className="font-mono font-bold text-[#0047AB] bg-blue-50 px-2 py-0.5 rounded text-xs border border-blue-200">
          {r.purchaseNumber}
        </span>
      ),
    },
    {
      key: 'purchaseDate',
      header: 'Date',
      render: (r) => <span className="text-slate-800 text-xs font-medium">{r.purchaseDate}</span>,
    },
    {
      key: 'supplier',
      header: 'Supplier',
      render: (r) => (
        <div>
          <span className="font-semibold text-slate-900 text-xs block">{r.supplierName}</span>
          {r.supplierInvoiceNumber && (
            <span className="text-[10px] font-mono text-slate-500">Inv #{r.supplierInvoiceNumber}</span>
          )}
        </div>
      ),
    },
    {
      key: 'branch',
      header: 'Branch',
      render: (r) => <span className="text-slate-600 text-xs">{r.branchName}</span>,
    },
    {
      key: 'items',
      header: 'Items / Qty',
      align: 'right',
      render: (r) => (
        <span className="font-mono text-slate-700 text-xs">
          {r.linesCount} lines ({r.totalQuantity} units)
        </span>
      ),
    },
    {
      key: 'netAmount',
      header: 'Net Landed Amount',
      align: 'right',
      render: (r) => (
        <span className="font-mono font-bold text-slate-900 text-xs">
          {formatCurrency(r.netAmount)}
        </span>
      ),
    },
    {
      key: 'paidAmount',
      header: 'Paid Amount',
      align: 'right',
      render: (r) => (
        <span className="font-mono font-bold text-emerald-700 text-xs">
          {formatCurrency(r.paidAmount)}
        </span>
      ),
    },
    {
      key: 'balanceDue',
      header: 'Balance Due (Payable)',
      align: 'right',
      render: (r) => (
        <span className={`font-mono text-xs font-bold ${r.balanceDue > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
          {formatCurrency(r.balanceDue)}
        </span>
      ),
    },
    {
      key: 'paymentMethod',
      header: 'Payment Tender',
      render: (r) => (
        <div>
          <span className="text-xs font-medium text-slate-800 block">{r.paymentMethod}</span>
          {r.paymentAccountName && (
            <span className="text-[10px] text-blue-700 font-medium">{r.paymentAccountName}</span>
          )}
        </div>
      ),
    },
    {
      key: 'paymentStatus',
      header: 'Payment Status',
      render: (r) => {
        if (r.paymentStatus === 'PAID') {
          return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">Paid</Badge>;
        }
        if (r.paymentStatus === 'PARTIALLY_PAID') {
          return <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">Partial</Badge>;
        }
        return <Badge className="bg-red-50 text-red-700 border-red-200 text-[10px]">Unpaid</Badge>;
      },
    },
  ];

  // 4. Supplier Ledger Columns
  const supplierLedgerColumns: ColumnDef<InventorySupplierLedgerRow>[] = [
    {
      key: 'date',
      header: 'Date',
      render: (r) => <span className="text-slate-800 text-xs font-medium">{r.date}</span>,
    },
    {
      key: 'supplier',
      header: 'Supplier',
      render: (r) => <span className="font-semibold text-slate-900 text-xs">{r.supplierName}</span>,
    },
    {
      key: 'entryType',
      header: 'Entry Type',
      render: (r) => (
        <Badge className={`text-[10px] ${
          r.entryType.includes('PAYMENT') || r.entryType.includes('RETURN')
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-blue-50 text-blue-700 border-blue-200'
        }`}>
          {r.entryType.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    {
      key: 'referenceNumber',
      header: 'Reference',
      render: (r) => (
        <span className="font-mono text-xs text-slate-700 font-medium">
          {r.referenceNumber}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      render: (r) => <span className="text-slate-600 text-xs">{r.description}</span>,
    },
    {
      key: 'debit',
      header: 'Debit (Paid/Return)',
      align: 'right',
      render: (r) => (
        <span className="font-mono font-bold text-emerald-700 text-xs">
          {r.debit > 0 ? formatCurrency(r.debit) : '-'}
        </span>
      ),
    },
    {
      key: 'credit',
      header: 'Credit (Bill Added)',
      align: 'right',
      render: (r) => (
        <span className="font-mono font-bold text-slate-900 text-xs">
          {r.credit > 0 ? formatCurrency(r.credit) : '-'}
        </span>
      ),
    },
    {
      key: 'runningBalance',
      header: 'Running Balance',
      align: 'right',
      render: (r) => (
        <span className={`font-mono text-xs font-extrabold ${r.runningBalance > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>
          {formatCurrency(Math.abs(r.runningBalance))} {r.runningBalance < 0 ? '(Advance)' : '(Payable)'}
        </span>
      ),
    },
    {
      key: 'userName',
      header: 'Logged By',
      render: (r) => <span className="text-slate-600 text-xs">{r.userName}</span>,
    },
  ];

  // 5. Consumption Columns
  const consumptionColumns: ColumnDef<InventoryConsumptionRow>[] = [
    {
      key: 'movementNumber',
      header: 'Movement #',
      render: (r) => (
        <span className="font-mono font-bold text-[#0047AB] bg-blue-50 px-2 py-0.5 rounded text-xs border border-blue-200">
          {r.movementNumber}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Date & Time',
      render: (r) => (
        <div>
          <span className="text-slate-800 text-xs font-medium block">{r.date}</span>
          <span className="text-[10px] text-slate-400 font-mono">{r.time}</span>
        </div>
      ),
    },
    {
      key: 'item',
      header: 'Item & SKU',
      render: (r) => (
        <div>
          <span className="font-semibold text-slate-900 text-xs block">{r.itemName}</span>
          <span className="text-[10px] font-mono text-slate-500">SKU: {r.sku}</span>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (r) => <span className="text-slate-700 text-xs">{r.category}</span>,
    },
    {
      key: 'quantity',
      header: 'Consumed Qty',
      align: 'right',
      render: (r) => (
        <span className="font-mono font-bold text-slate-900 text-xs">
          {r.quantity.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'unitCost',
      header: 'Unit Landed Cost',
      align: 'right',
      render: (r) => (
        <span className="font-mono text-slate-600 text-xs">
          {formatCurrency(r.unitCost)}
        </span>
      ),
    },
    {
      key: 'totalCost',
      header: 'Total Material Cost',
      align: 'right',
      render: (r) => (
        <span className="font-mono font-bold text-rose-800 text-xs">
          {formatCurrency(r.totalCost)}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason / Service Ref',
      render: (r) => (
        <div>
          <span className="text-slate-800 text-xs block font-medium">{r.reason}</span>
          {r.notes && <span className="text-[10px] text-slate-400">{r.notes}</span>}
        </div>
      ),
    },
    {
      key: 'userName',
      header: 'Issued To / By',
      render: (r) => <span className="text-slate-600 text-xs">{r.userName}</span>,
    },
  ];

  // 6. Expiry Columns
  const expiryColumns: ColumnDef<InventoryExpiryRow>[] = [
    {
      key: 'item',
      header: 'Item & SKU',
      render: (r) => (
        <div>
          <span className="font-semibold text-slate-900 text-xs block">{r.itemName}</span>
          <span className="text-[10px] font-mono text-slate-500">SKU: {r.sku}</span>
        </div>
      ),
    },
    {
      key: 'batchNumber',
      header: 'Batch #',
      render: (r) => (
        <span className="font-mono text-xs text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
          {r.batchNumber}
        </span>
      ),
    },
    {
      key: 'branch',
      header: 'Branch',
      render: (r) => <span className="text-slate-600 text-xs">{r.branchName}</span>,
    },
    {
      key: 'expiryDate',
      header: 'Expiry Date',
      render: (r) => <span className="font-mono font-medium text-slate-900 text-xs">{r.expiryDate}</span>,
    },
    {
      key: 'daysRemaining',
      header: 'Days Remaining',
      align: 'right',
      render: (r) => (
        <span className={`font-mono text-xs font-bold ${
          r.daysRemaining < 0
            ? 'text-red-700'
            : r.daysRemaining <= 30
            ? 'text-amber-700'
            : 'text-slate-700'
        }`}>
          {r.daysRemaining < 0 ? `${Math.abs(r.daysRemaining)} days ago` : `${r.daysRemaining} days`}
        </span>
      ),
    },
    {
      key: 'remainingQuantity',
      header: 'Remaining Qty',
      align: 'right',
      render: (r) => (
        <span className="font-mono font-bold text-slate-900 text-xs">
          {r.remainingQuantity.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'unitCost',
      header: 'Unit Cost',
      align: 'right',
      render: (r) => (
        <span className="font-mono text-slate-600 text-xs">
          {formatCurrency(r.unitCost)}
        </span>
      ),
    },
    {
      key: 'costAtRisk',
      header: 'Cost At Risk / Lost',
      align: 'right',
      render: (r) => (
        <span className={`font-mono text-xs font-extrabold ${r.status === 'EXPIRED' ? 'text-red-700' : 'text-amber-700'}`}>
          {formatCurrency(r.costAtRisk)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Risk Level',
      render: (r) => {
        if (r.status === 'EXPIRED') {
          return <Badge className="bg-red-100 text-red-800 border-red-300 text-[10px]">Expired</Badge>;
        }
        if (r.status === 'CRITICAL') {
          return <Badge className="bg-orange-100 text-orange-800 border-orange-300 text-[10px]">Critical (&lt; 30d)</Badge>;
        }
        if (r.status === 'NEAR_EXPIRY') {
          return <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]">Near Expiry (&lt; 60d)</Badge>;
        }
        return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">Valid</Badge>;
      },
    },
  ];

  // ── Active Table Configuration ─────────────────────────────────────────────
  const activeTableConfig = useMemo(() => {
    switch (activeTab) {
      case 'movements':
        return {
          columns: movementsColumns as any,
          rows: reportData?.rows || [],
          subHeaderTitle: 'STOCK MOVEMENTS AUDIT TRAIL',
        };
      case 'purchases':
        return {
          columns: purchasesColumns as any,
          rows: reportData?.rows || [],
          subHeaderTitle: 'SUPPLIER PURCHASE ORDERS & DELIVERIES',
        };
      case 'supplier-ledger':
        return {
          columns: supplierLedgerColumns as any,
          rows: reportData?.rows || [],
          subHeaderTitle: 'SUPPLIER PAYABLES RUNNING LEDGER',
        };
      case 'consumption':
        return {
          columns: consumptionColumns as any,
          rows: reportData?.rows || [],
          subHeaderTitle: 'SALON IN-HOUSE CONSUMABLE MATERIAL USAGE',
        };
      case 'expiry':
        return {
          columns: expiryColumns as any,
          rows: reportData?.rows || [],
          subHeaderTitle: 'EXPIRY & RISK AUDIT TRAIL',
        };
      case 'valuation':
      default:
        return {
          columns: valuationColumns as any,
          rows: reportData?.rows || [],
          subHeaderTitle: 'STOCK VALUATION & HISTORICAL COST LAYERS',
        };
    }
  }, [activeTab, reportData]);

  // ── Export Meta & Rows ─────────────────────────────────────────────────────
  const exportMeta: [string, string][] = useMemo(() => [
    ['Report', `Inventory Report (${activeTab.toUpperCase()})`],
    ['Branch', branchNameDisplay],
    ['Date Range', `${reportData?.meta?.from || ''} to ${reportData?.meta?.to || ''}`],
    ['Preset', reportData?.meta?.preset || selectedPreset],
    ['Date Basis', reportData?.meta?.dateBasis || 'HISTORICAL COST BASIS'],
    ['Generated By', reportData?.meta?.generatedBy || user?.name || 'System'],
    ['Generated At', reportData?.meta?.generatedAt || new Date().toISOString()],
  ], [activeTab, branchNameDisplay, reportData, selectedPreset, user]);

  const exportHeaders = useMemo(() => {
    return activeTableConfig.columns.map((c: any) => c.header);
  }, [activeTableConfig]);

  const exportRows = useMemo(() => {
    return (reportData?.rows || []).map((row: any) => {
      switch (activeTab) {
        case 'valuation':
          return [
            `${row.itemName} (${row.sku})`,
            `${row.category} / ${row.itemType}`,
            row.batchNumber,
            row.branchName,
            row.remainingQuantity,
            row.unitCost,
            row.costValue,
            row.sellingPrice,
            row.retailValue,
            `${row.potentialMargin}%`,
            row.stockStatus,
            row.expiryStatus,
          ];
        case 'movements':
          return [
            row.movementNumber,
            `${row.date} ${row.time}`,
            `${row.itemName} (${row.sku})`,
            row.movementType,
            row.direction,
            row.quantity,
            row.unitCost,
            row.totalCost,
            `${row.reason} (Ref: ${row.sourceReferenceNumber})`,
            row.userName,
          ];
        case 'purchases':
          return [
            row.purchaseNumber,
            row.purchaseDate,
            row.supplierName,
            row.branchName,
            `${row.linesCount} lines (${row.totalQuantity} units)`,
            row.netAmount,
            row.paidAmount,
            row.balanceDue,
            row.paymentMethod,
            row.paymentStatus,
          ];
        case 'supplier-ledger':
          return [
            row.date,
            row.supplierName,
            row.entryType,
            row.referenceNumber,
            row.description,
            row.debit,
            row.credit,
            row.runningBalance,
            row.userName,
          ];
        case 'consumption':
          return [
            row.movementNumber,
            `${row.date} ${row.time}`,
            `${row.itemName} (${row.sku})`,
            row.category,
            row.quantity,
            row.unitCost,
            row.totalCost,
            row.reason,
            row.userName,
          ];
        case 'expiry':
          return [
            `${row.itemName} (${row.sku})`,
            row.batchNumber,
            row.branchName,
            row.expiryDate,
            row.daysRemaining,
            row.remainingQuantity,
            row.unitCost,
            row.costAtRisk,
            row.status,
          ];
        default:
          return [];
      }
    });
  }, [activeTab, reportData]);

  const handleExportCsv = () => {
    if (!reportData || !reportData.rows.length) return;
    downloadReportCsv(`inventory_${activeTab}_report`, exportMeta, [
      { headers: exportHeaders, rows: exportRows },
    ]);
  };

  const handleExportExcel = () => {
    if (!reportData || !reportData.rows.length) return;
    downloadReportExcel(`inventory_${activeTab}_report`, exportMeta, [
      { headers: exportHeaders, rows: exportRows },
    ]);
  };

  const handleExportPrint = () => {
    if (!reportData || !reportData.rows.length) return;
    printReportWindow({
      title: `Inventory Report (${activeTab.toUpperCase()})`,
      subtitle: branchNameDisplay,
      meta: exportMeta,
      headers: exportHeaders,
      rows: exportRows,
    });
  };

  const kpis = reportData?.kpis || {};
  const tender = reportData?.tenderBreakdown;

  // Render Totals row for ReportTable
  const renderTotalsRow = () => {
    const totals = reportData?.totals;
    if (!totals || Object.keys(totals).length === 0) return null;

    if (activeTab === 'valuation') {
      return (
        <tr className="bg-slate-100/90 font-bold text-slate-900 border-t-2 border-slate-300">
          <td className="py-2.5 px-3 text-center border-r border-slate-200">Σ</td>
          <td className="py-2.5 px-3" colSpan={3}>Valuation Summary Totals</td>
          <td className="py-2.5 px-3 text-right font-mono">{totals.remainingQuantity?.toLocaleString()}</td>
          <td className="py-2.5 px-3"></td>
          <td className="py-2.5 px-3 text-right font-mono text-blue-900">{formatCurrency(totals.costValue)}</td>
          <td className="py-2.5 px-3"></td>
          <td className="py-2.5 px-3 text-right font-mono">{formatCurrency(totals.retailValue)}</td>
          <td className="py-2.5 px-3 text-right font-mono text-emerald-800">{formatCurrency(totals.potentialProfit)}</td>
          <td className="py-2.5 px-3" colSpan={2}></td>
        </tr>
      );
    }

    if (activeTab === 'movements') {
      return (
        <tr className="bg-slate-100/90 font-bold text-slate-900 border-t-2 border-slate-300">
          <td className="py-2.5 px-3 text-center border-r border-slate-200">Σ</td>
          <td className="py-2.5 px-3" colSpan={4}>Period Movements Summary</td>
          <td className="py-2.5 px-3 text-right font-mono text-emerald-800">In: {totals.inQuantity?.toLocaleString()}</td>
          <td className="py-2.5 px-3 text-right font-mono text-rose-800">Out: {totals.outQuantity?.toLocaleString()}</td>
          <td className="py-2.5 px-3 text-right font-mono text-blue-900">Cost Out: {formatCurrency(totals.outCostValue)}</td>
          <td className="py-2.5 px-3" colSpan={2}></td>
        </tr>
      );
    }

    if (activeTab === 'purchases') {
      return (
        <tr className="bg-slate-100/90 font-bold text-slate-900 border-t-2 border-slate-300">
          <td className="py-2.5 px-3 text-center border-r border-slate-200">Σ</td>
          <td className="py-2.5 px-3" colSpan={4}>Purchases Totals</td>
          <td className="py-2.5 px-3 text-right font-mono text-blue-900">{formatCurrency(totals.netAmount)}</td>
          <td className="py-2.5 px-3 text-right font-mono text-emerald-800">{formatCurrency(totals.paidAmount)}</td>
          <td className="py-2.5 px-3 text-right font-mono text-amber-800">{formatCurrency(totals.balanceDue)}</td>
          <td className="py-2.5 px-3" colSpan={2}></td>
        </tr>
      );
    }

    if (activeTab === 'supplier-ledger') {
      return (
        <tr className="bg-slate-100/90 font-bold text-slate-900 border-t-2 border-slate-300">
          <td className="py-2.5 px-3 text-center border-r border-slate-200">Σ</td>
          <td className="py-2.5 px-3" colSpan={4}>Period Movement Totals</td>
          <td className="py-2.5 px-3 text-right font-mono text-emerald-800">{formatCurrency(totals.debit)}</td>
          <td className="py-2.5 px-3 text-right font-mono text-blue-900">{formatCurrency(totals.credit)}</td>
          <td className="py-2.5 px-3" colSpan={2}></td>
        </tr>
      );
    }

    if (activeTab === 'consumption') {
      return (
        <tr className="bg-slate-100/90 font-bold text-slate-900 border-t-2 border-slate-300">
          <td className="py-2.5 px-3 text-center border-r border-slate-200">Σ</td>
          <td className="py-2.5 px-3" colSpan={3}>Total Material Consumed</td>
          <td className="py-2.5 px-3 text-right font-mono">{totals.quantity?.toLocaleString()}</td>
          <td className="py-2.5 px-3"></td>
          <td className="py-2.5 px-3 text-right font-mono text-rose-800">{formatCurrency(totals.totalCost)}</td>
          <td className="py-2.5 px-3" colSpan={2}></td>
        </tr>
      );
    }

    if (activeTab === 'expiry') {
      return (
        <tr className="bg-slate-100/90 font-bold text-slate-900 border-t-2 border-slate-300">
          <td className="py-2.5 px-3 text-center border-r border-slate-200">Σ</td>
          <td className="py-2.5 px-3" colSpan={4}>Total Stock At Risk</td>
          <td className="py-2.5 px-3 text-right font-mono">{totals.remainingQuantity?.toLocaleString()}</td>
          <td className="py-2.5 px-3"></td>
          <td className="py-2.5 px-3 text-right font-mono text-red-800">{formatCurrency(totals.costAtRisk)}</td>
          <td className="py-2.5 px-3"></td>
        </tr>
      );
    }

    return null;
  };

  return (
    <ReportShell
      title="Inventory & Supply Chain Reports"
      description="Comprehensive valuation at historical landed cost layers, stock movements, supplier ledgers, salon consumption, and expiry tracking."
      icon={Boxes}
      bannerTitle={activeTableConfig.subHeaderTitle}
      onFilterSubmit={handleApplyFilter}
      isFilterLoading={isLoading}
      onExportExcel={handleExportExcel}
      onExportCsv={handleExportCsv}
      onExportPdf={handleExportPrint}
      onExportPrint={handleExportPrint}
      filterChildren={
        <div className="space-y-4">
          {/* Sub-Report Tabs */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
            {[
              { id: 'valuation', label: 'Valuation & Layers', icon: Boxes },
              { id: 'movements', label: 'Movement Trail', icon: History },
              { id: 'purchases', label: 'Purchases & Inbound', icon: ShoppingCart },
              { id: 'supplier-ledger', label: 'Supplier Ledger', icon: BookOpen },
              { id: 'consumption', label: 'Salon Usage', icon: Scissors },
              { id: 'expiry', label: 'Expiry & Risk', icon: AlertTriangle },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id as InventorySubReportType)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#0047AB] text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Dynamic Filter Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
            {/* Branch Filter */}
            <div>
              <label className={filterLabel}>Branch / Campus</label>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                disabled={!isSuperAdmin}
                className={`w-full ${selectField}`}
              >
                {isSuperAdmin && <option value="ALL">All Branches (Consolidated)</option>}
                {allBranches.map((b: Branch) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.city})
                  </option>
                ))}
              </select>
            </div>

            {/* Date Preset */}
            <div>
              <label className={filterLabel}>Date Preset</label>
              <select
                value={selectedPreset}
                onChange={(e) => setSelectedPreset(e.target.value as DatePreset)}
                className={`w-full ${selectField}`}
              >
                {DATE_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Custom Dates if preset is CUSTOM */}
            {selectedPreset === 'CUSTOM' ? (
              <>
                <div>
                  <label className={filterLabel}>From Date</label>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className={`w-full ${inputField}`}
                  />
                </div>
                <div>
                  <label className={filterLabel}>To Date</label>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className={`w-full ${inputField}`}
                  />
                </div>
              </>
            ) : (
              <>
                {/* Category Filter */}
                <div>
                  <label className={filterLabel}>Category</label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className={`w-full ${selectField}`}
                  >
                    <option value="ALL">All Categories</option>
                    {(reportData?.categories || []).map((c: string) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Item Type */}
                <div>
                  <label className={filterLabel}>Item Type</label>
                  <select
                    value={selectedItemType}
                    onChange={(e) => setSelectedItemType(e.target.value)}
                    className={`w-full ${selectField}`}
                  >
                    <option value="ALL">All Types</option>
                    <option value="RETAIL">Retail Products</option>
                    <option value="CONSUMABLE">Salon Consumables</option>
                    <option value="EQUIPMENT">Equipment / Assets</option>
                  </select>
                </div>
              </>
            )}

            {/* Search Input */}
            <div>
              <label className={filterLabel}>Search</label>
              <input
                type="text"
                placeholder="SKU, item, batch..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full ${inputField}`}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleApplyFilter}
                className="flex-1 bg-[#0047AB] hover:bg-[#003882] text-white text-xs font-semibold px-4 py-1.5 rounded-lg shadow-sm transition-all h-8 cursor-pointer flex items-center justify-center gap-1.5"
              >
                Filter
              </button>
              <button
                type="button"
                onClick={handleResetFilters}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium px-3 py-1.5 rounded-lg transition-all h-8 cursor-pointer"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      }
    >
      {/* Loading & Error States */}
      {isLoading && (
        <div className="py-12 text-center text-slate-500 text-xs">
          <div className="animate-spin inline-block w-6 h-6 border-2 border-[#0047AB] border-t-transparent rounded-full mb-2" />
          <p>Querying canonical database records for {activeTab} report...</p>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 mb-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {!isLoading && !errorMessage && (
        <div className="space-y-4">
          {/* ── KPI METRICS CARDS ─────────────────────────────────────────── */}
          {activeTab === 'valuation' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                  Total Inventory Cost Value
                </span>
                <span className="text-xl font-extrabold text-blue-900 block">
                  {formatCurrency(kpis.totalCostValue || 0)}
                </span>
                <span className="text-[10px] text-slate-400 mt-1 block">Historical Landed Cost Layers</span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                  Potential Retail Value
                </span>
                <span className="text-xl font-extrabold text-slate-900 block">
                  {formatCurrency(kpis.totalRetailValue || 0)}
                </span>
                <span className="text-[10px] text-slate-400 mt-1 block">Estimated POS Selling Price</span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                  Potential Gross Profit
                </span>
                <span className="text-xl font-extrabold text-emerald-700 block">
                  {formatCurrency(kpis.potentialGrossProfit || 0)}
                </span>
                <span className="text-[10px] text-emerald-600 font-medium mt-1 block">
                  Retail - Historical Cost
                </span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                  Stock Health & Alerts
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                    {kpis.lowStockCount || 0} Low
                  </Badge>
                  <Badge className="bg-red-50 text-red-700 border-red-200 text-xs">
                    {kpis.outOfStockCount || 0} Out
                  </Badge>
                  <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-xs">
                    {kpis.nearExpiryBatchesCount || 0} Expiring
                  </Badge>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'movements' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                  Total Movements
                </span>
                <span className="text-xl font-extrabold text-slate-900 block">
                  {(kpis.totalMovementsCount || 0).toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-400 mt-1 block">Audit Records in Period</span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                  Inbound Quantity
                </span>
                <span className="text-xl font-extrabold text-emerald-700 block">
                  +{(kpis.totalInQuantity || 0).toLocaleString()} units
                </span>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Cost: {formatCurrency(kpis.totalInCostValue || 0)}
                </span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                  Outbound Quantity
                </span>
                <span className="text-xl font-extrabold text-rose-700 block">
                  -{(kpis.totalOutQuantity || 0).toLocaleString()} units
                </span>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Cost: {formatCurrency(kpis.totalOutCostValue || 0)}
                </span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                  Net Stock Change
                </span>
                <span className={`text-xl font-extrabold block ${
                  (kpis.netQuantityChange || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}>
                  {(kpis.netQuantityChange || 0) >= 0 ? '+' : ''}{(kpis.netQuantityChange || 0).toLocaleString()} units
                </span>
                <span className="text-[10px] text-slate-400 mt-1 block">Inbound minus Outbound</span>
              </div>
            </div>
          )}

          {activeTab === 'purchases' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    Purchases Count
                  </span>
                  <span className="text-xl font-extrabold text-slate-900 block">
                    {kpis.totalPurchasesCount || 0} orders
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1 block">Posted in Selected Range</span>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    Total Purchases Landed
                  </span>
                  <span className="text-xl font-extrabold text-blue-900 block">
                    {formatCurrency(kpis.totalPurchasedValue || 0)}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1 block">Capitalized Inventory Asset</span>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    Upfront Paid Amount
                  </span>
                  <span className="text-xl font-extrabold text-emerald-700 block">
                    {formatCurrency(kpis.totalPaidAmount || 0)}
                  </span>
                  <span className="text-[10px] text-emerald-600 font-medium mt-1 block">Settled on Purchase</span>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    Pending Supplier Payables
                  </span>
                  <span className="text-xl font-extrabold text-amber-700 block">
                    {formatCurrency(kpis.totalBalanceDue || 0)}
                  </span>
                  <span className="text-[10px] text-amber-600 font-medium mt-1 block">Credit Balance Added</span>
                </div>
              </div>

              {/* Tender Breakdown Banner for Purchases */}
              {tender && (tender.totalCash > 0 || tender.totalOnline > 0) && (
                <div className="bg-linear-to-r from-blue-50/70 to-indigo-50/60 border border-blue-200 rounded-xl p-3.5 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                      <Wallet className="w-4 h-4 text-[#0047AB]" />
                      Purchases Payment Tender Breakdown (Physical Cash vs Online Accounts)
                    </span>
                    <span className="text-xs font-mono font-bold text-blue-900">
                      Total Disbursed: {formatCurrency(tender.grandTotal)}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
                    <div className="bg-white/80 border border-blue-100 rounded-lg p-2.5">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block">
                        Cash Paid
                      </span>
                      <span className="text-sm font-extrabold text-slate-900 block font-mono">
                        {formatCurrency(tender.totalCash)}
                      </span>
                    </div>
                    <div className="bg-white/80 border border-blue-100 rounded-lg p-2.5">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block">
                        Total Online / Bank Paid
                      </span>
                      <span className="text-sm font-extrabold text-blue-800 block font-mono">
                        {formatCurrency(tender.totalOnline)}
                      </span>
                    </div>
                    {tender.onlineAccounts?.map((acc: any) => (
                      <div key={acc.accountId} className="bg-white/80 border border-blue-100 rounded-lg p-2.5">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block truncate">
                          {acc.accountName}
                        </span>
                        <span className="text-sm font-extrabold text-blue-900 block font-mono">
                          {formatCurrency(acc.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'supplier-ledger' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                  Opening Payable
                </span>
                <span className="text-xl font-extrabold text-slate-900 block">
                  {formatCurrency(kpis.openingPayable || 0)}
                </span>
                <span className="text-[10px] text-slate-400 mt-1 block">Pre-Period Outstanding</span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                  Period Bills (Credit)
                </span>
                <span className="text-xl font-extrabold text-blue-900 block">
                  {formatCurrency(kpis.periodPurchasesCredit || 0)}
                </span>
                <span className="text-[10px] text-slate-400 mt-1 block">Purchases Added</span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                  Period Payments (Debit)
                </span>
                <span className="text-xl font-extrabold text-emerald-700 block">
                  {formatCurrency(kpis.periodPaymentsDebit || 0)}
                </span>
                <span className="text-[10px] text-emerald-600 font-medium mt-1 block">Settled to Suppliers</span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                  Closing Balance
                </span>
                <span className={`text-xl font-extrabold block ${
                  (kpis.closingPayable || 0) > 0 ? 'text-amber-800' : 'text-emerald-800'
                }`}>
                  {formatCurrency(Math.abs(kpis.closingPayable || 0))} {(kpis.closingPayable || 0) < 0 ? '(Advance)' : '(Payable)'}
                </span>
                <span className="text-[10px] text-slate-400 mt-1 block">Current Net Liability</span>
              </div>
            </div>
          )}

          {activeTab === 'consumption' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                  Consumption Events
                </span>
                <span className="text-xl font-extrabold text-slate-900 block">
                  {kpis.totalConsumptionCount || 0} issues
                </span>
                <span className="text-[10px] text-slate-400 mt-1 block">Salon In-house Usages</span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                  Consumed Units
                </span>
                <span className="text-xl font-extrabold text-slate-900 block">
                  {(kpis.totalConsumedQuantity || 0).toLocaleString()} units
                </span>
                <span className="text-[10px] text-slate-400 mt-1 block">Material Volume</span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                  Total Material Cost
                </span>
                <span className="text-xl font-extrabold text-rose-800 block">
                  {formatCurrency(kpis.totalMaterialCost || 0)}
                </span>
                <span className="text-[10px] text-rose-600 font-medium mt-1 block">
                  Spec §5.4 / §11.2 Material Cost
                </span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                  Consumable Categories
                </span>
                <span className="text-xl font-extrabold text-slate-900 block">
                  {kpis.categoryCount || 0} categories
                </span>
                <span className="text-[10px] text-slate-400 mt-1 block">Product Categories Utilized</span>
              </div>
            </div>
          )}

          {activeTab === 'expiry' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                  Tracked Batches
                </span>
                <span className="text-xl font-extrabold text-slate-900 block">
                  {kpis.totalTrackedBatches || 0} batches
                </span>
                <span className="text-[10px] text-slate-400 mt-1 block">Stock with Expiry Dates</span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                  Expired Stock Loss
                </span>
                <span className="text-xl font-extrabold text-red-700 block">
                  {formatCurrency(kpis.expiredCostLoss || 0)}
                </span>
                <span className="text-[10px] text-red-600 font-medium mt-1 block">
                  {kpis.expiredBatchesCount || 0} Batches Past Expiry
                </span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                  Critical (&lt; 30 Days)
                </span>
                <span className="text-xl font-extrabold text-orange-700 block">
                  {formatCurrency(kpis.criticalCostAtRisk || 0)}
                </span>
                <span className="text-[10px] text-orange-600 font-medium mt-1 block">
                  {kpis.criticalBatchesCount || 0} Batches Requiring Action
                </span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                  Near Expiry (&lt; 60 Days)
                </span>
                <span className="text-xl font-extrabold text-amber-700 block">
                  {formatCurrency(kpis.nearExpiryCostAtRisk || 0)}
                </span>
                <span className="text-[10px] text-amber-600 font-medium mt-1 block">
                  {kpis.nearExpiryBatchesCount || 0} Batches in Monitoring
                </span>
              </div>
            </div>
          )}

          {/* ── LANDSCAPE TABLE CONTAINER ─────────────────────────────────── */}
          <ReportTable
            columns={activeTableConfig.columns}
            data={activeTableConfig.rows}
            loading={isLoading}
            emptyMessage={`No ${activeTab} records found for the selected branch and criteria.`}
            renderTotals={renderTotalsRow}
          />
        </div>
      )}
    </ReportShell>
  );
};
