import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { salonService } from '@/services';
import {
  InventoryItem,
  InventoryBatch,
  StockMovement,
  Supplier,
  Branch,
} from '@/types/salon';
import { AccessDeniedView } from '@/features/scaffold/AccessDeniedView';
import { formatCurrency } from '@/lib/formatters';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import {
  Boxes,
  Package,
  History,
  AlertTriangle,
  Clock,
  Building2,
  Download,
  Printer,
  RefreshCw,
  Search,
  Filter,
  DollarSign,
  TrendingUp,
  FileSpreadsheet,
} from 'lucide-react';

export const InventoryReportsPage: React.FC = () => {
  const { user, activeBranchId, allBranches } = useAuth();

  // Role Guard: SUPER_ADMIN, ADMIN, ACCOUNTANT (Staff cannot access)
  if (!user || user.role === 'STAFF') {
    return <AccessDeniedView attemptedPath="/reports/inventory-movement" />;
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN';

  const currentSelectedBranchId = isSuperAdmin
    ? (activeBranchId !== 'ALL' ? activeBranchId : allBranches[0]?.id || '')
    : (user.branchId as string);

  const [selectedBranchId, setSelectedBranchId] = useState<string>(currentSelectedBranchId);

  useEffect(() => {
    if (isSuperAdmin && activeBranchId !== 'ALL') {
      setSelectedBranchId(activeBranchId);
    }
  }, [activeBranchId, isSuperAdmin]);

  const [activeReportTab, setActiveReportTab] = useState<'VALUATION' | 'MOVEMENTS' | 'LOW_STOCK' | 'EXPIRY' | 'SUPPLIERS'>('VALUATION');
  const [isLoading, setIsLoading] = useState(true);

  // Data Collections
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>('ALL');

  const loadData = async (bId: string) => {
    setIsLoading(true);
    try {
      const [items, bts, mvs, sups] = await Promise.all([
        salonService.getInventoryItems(bId, user),
        salonService.getInventoryBatches(bId, undefined, user),
        salonService.getStockMovements(bId, undefined, user),
        salonService.getSuppliers(bId, user),
      ]);
      setInventoryItems(items);
      setBatches(bts);
      setMovements(mvs);
      setSuppliers(sups);
    } catch (err) {
      console.error('Failed to load inventory reports data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedBranchId) {
      loadData(selectedBranchId);
    }
  }, [selectedBranchId]);

  // Valuation summary metrics
  const valuationMetrics = useMemo(() => {
    let totalCost = 0;
    let totalRetail = 0;
    const itemsValuation = inventoryItems.map((item) => {
      const itemBatches = batches.filter((b) => b.itemId === item.id && b.branchId === selectedBranchId);
      const onHand = itemBatches.reduce((s, b) => s + (b.remainingQuantity || 0), 0);
      const costVal = itemBatches.reduce(
        (s, b) => s + (b.remainingQuantity || 0) * (b.unitCostSnapshot || item.defaultPurchaseCost),
        0
      );
      const retailVal = onHand * item.sellingPrice;
      const potentialMargin = retailVal > 0 ? ((retailVal - costVal) / retailVal) * 100 : 0;

      totalCost += costVal;
      totalRetail += retailVal;

      return {
        item,
        onHand,
        costVal,
        retailVal,
        potentialMargin,
      };
    });

    const overallMargin = totalRetail > 0 ? ((totalRetail - totalCost) / totalRetail) * 100 : 0;

    return {
      totalCost,
      totalRetail,
      potentialProfit: totalRetail - totalCost,
      overallMargin,
      itemsValuation,
    };
  }, [inventoryItems, batches, selectedBranchId]);

  // Filtered Valuation Items
  const filteredValuation = useMemo(() => {
    return valuationMetrics.itemsValuation.filter(
      (v) =>
        v.item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.item.category.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [valuationMetrics, searchQuery]);

  // Filtered Movements
  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      const matchSearch =
        m.itemName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.itemSku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.referenceId && m.referenceId.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchType = movementTypeFilter === 'ALL' || m.movementType === movementTypeFilter;
      return matchSearch && matchType;
    });
  }, [movements, searchQuery, movementTypeFilter]);

  // Low Stock Items
  const lowStockItems = useMemo(() => {
    return valuationMetrics.itemsValuation.filter((v) => v.onHand <= v.item.minStockLevel);
  }, [valuationMetrics]);

  // Near Expiry & Expired Batches
  const expiryBatches = useMemo(() => {
    return batches.filter(
      (b) =>
        b.status === 'NEAR_EXPIRY' ||
        b.status === 'EXPIRED' ||
        b.status === 'QUARANTINED'
    );
  }, [batches]);

  // CSV Export Handler
  const handleExportCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    if (activeReportTab === 'VALUATION') {
      csvContent += 'Item Name,SKU,Category,Type,On Hand,Unit Cost,Cost Valuation,Selling Price,Retail Value,Potential Margin %\n';
      filteredValuation.forEach((v) => {
        csvContent += `"${v.item.name}","${v.item.sku}","${v.item.category}","${v.item.itemType}",${v.onHand},${v.item.defaultPurchaseCost},${v.costVal},${v.item.sellingPrice},${v.retailVal},${v.potentialMargin.toFixed(1)}%\n`;
      });
    } else if (activeReportTab === 'MOVEMENTS') {
      csvContent += 'Timestamp,Item Name,SKU,Movement Type,Direction,Quantity,Unit Cost Snapshot,Total Cost Impact,Reference,Actor\n';
      filteredMovements.forEach((m) => {
        csvContent += `"${m.timestamp}","${m.itemName}","${m.itemSku}","${m.movementType}","${m.direction}",${m.quantity},${m.unitCostSnapshot || 0},${m.totalCostImpact || 0},"${m.referenceId || ''}","${m.actorName || ''}"\n`;
      });
    } else if (activeReportTab === 'LOW_STOCK') {
      csvContent += 'Item Name,SKU,Category,Current Stock,Min Threshold,Deficit Units,Est Reorder Cost\n';
      lowStockItems.forEach((v) => {
        const deficit = Math.max(0, v.item.minStockLevel - v.onHand);
        csvContent += `"${v.item.name}","${v.item.sku}","${v.item.category}",${v.onHand},${v.item.minStockLevel},${deficit},${deficit * v.item.defaultPurchaseCost}\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `inventory_${activeReportTab.toLowerCase()}_report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Inventory & Stock Reports</h1>
            <Badge variant="neutral" className="bg-[#2254E1]/10 text-[#2254E1] font-semibold text-xs border-[#2254E1]/20">
              Audit & Valuation
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Authoritative stock asset valuation, batch expiration audits, reorder requirements, and movement trails.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isSuperAdmin && (
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
              <Building2 className="w-4 h-4 text-slate-500" />
              <Select value={selectedBranchId} onValueChange={(val) => setSelectedBranchId(val)}>
                <SelectTrigger className="border-0 shadow-none p-0 h-auto font-medium text-xs text-slate-700 focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allBranches.map((b) => (
                    <SelectItem key={b.id} value={b.id} className="text-xs">
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button variant="outline" size="sm" onClick={() => loadData(selectedBranchId)} className="text-xs gap-1.5 h-8">
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button variant="outline" size="sm" onClick={handleExportCSV} className="text-xs gap-1.5 h-8">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </Button>

          <Button variant="outline" size="sm" onClick={handlePrint} className="text-xs gap-1.5 h-8">
            <Printer className="w-3.5 h-3.5" /> Print
          </Button>
        </div>
      </div>

      {/* Primary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3.5 bg-white border-slate-200">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Asset Valuation (Cost)</span>
          <p className="text-lg font-bold text-slate-900 mt-1 font-mono">
            {formatCurrency(valuationMetrics.totalCost)}
          </p>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Historical cost of valid batches</span>
        </Card>

        <Card className="p-3.5 bg-white border-slate-200">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Potential Retail Value</span>
          <p className="text-lg font-bold text-[#2254E1] mt-1 font-mono">
            {formatCurrency(valuationMetrics.totalRetail)}
          </p>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Gross sales if completely sold</span>
        </Card>

        <Card className="p-3.5 bg-white border-slate-200">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Potential Gross Profit</span>
          <p className="text-lg font-bold text-emerald-600 mt-1 font-mono">
            {formatCurrency(valuationMetrics.potentialProfit)}
          </p>
          <span className="text-[10px] text-slate-500 mt-0.5 block">
            Overall Margin: {valuationMetrics.overallMargin.toFixed(1)}%
          </span>
        </Card>

        <Card className="p-3.5 bg-white border-slate-200">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Items Requiring Attention</span>
          <p className="text-lg font-bold text-amber-600 mt-1 font-mono">
            {lowStockItems.length} Low / {expiryBatches.length} Expiry
          </p>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Actionable stock exceptions</span>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeReportTab} onValueChange={(v) => setActiveReportTab(v as any)} className="w-full">
        <TabsList className="bg-slate-100 p-1 rounded-xl w-full justify-start overflow-x-auto flex-nowrap border border-slate-200">
          <TabsTrigger value="VALUATION" className="text-xs font-semibold gap-1.5 px-3 py-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#2254E1] data-[state=active]:shadow-xs">
            <DollarSign className="w-3.5 h-3.5" /> Stock Valuation ({filteredValuation.length})
          </TabsTrigger>
          <TabsTrigger value="MOVEMENTS" className="text-xs font-semibold gap-1.5 px-3 py-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#2254E1] data-[state=active]:shadow-xs">
            <History className="w-3.5 h-3.5" /> Movement History ({filteredMovements.length})
          </TabsTrigger>
          <TabsTrigger value="LOW_STOCK" className="text-xs font-semibold gap-1.5 px-3 py-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#2254E1] data-[state=active]:shadow-xs">
            <AlertTriangle className="w-3.5 h-3.5" /> Low Stock & Reorders ({lowStockItems.length})
          </TabsTrigger>
          <TabsTrigger value="EXPIRY" className="text-xs font-semibold gap-1.5 px-3 py-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#2254E1] data-[state=active]:shadow-xs">
            <Clock className="w-3.5 h-3.5" /> Batch Expiry Audit ({expiryBatches.length})
          </TabsTrigger>
          <TabsTrigger value="SUPPLIERS" className="text-xs font-semibold gap-1.5 px-3 py-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#2254E1] data-[state=active]:shadow-xs">
            <Building2 className="w-3.5 h-3.5" /> Supplier Payables ({suppliers.length})
          </TabsTrigger>
        </TabsList>

        {/* VALUATION TAB */}
        <TabsContent value="VALUATION" className="space-y-4 pt-2">
          <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Search items by name, SKU or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 text-xs h-8 bg-slate-50 border-slate-200"
              />
            </div>
            <span className="text-xs text-slate-500 font-medium">
              Showing {filteredValuation.length} items
            </span>
          </div>

          <Card className="bg-white border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="text-xs font-bold text-slate-700">SKU</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">Item Name</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">Category</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">On Hand</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">Default Cost</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">Cost Valuation</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">Selling Price</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">Retail Potential</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">Potential Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredValuation.map((v) => (
                    <TableRow key={v.item.id} className="hover:bg-slate-50/60 text-xs">
                      <TableCell className="font-mono text-slate-800 font-semibold">{v.item.sku}</TableCell>
                      <TableCell className="font-bold text-slate-900">{v.item.name}</TableCell>
                      <TableCell className="text-slate-600">{v.item.category}</TableCell>
                      <TableCell className="text-right font-mono font-bold text-slate-900">
                        {v.onHand} {v.item.issueUnit}
                      </TableCell>
                      <TableCell className="text-right font-mono text-slate-600">
                        {formatCurrency(v.item.defaultPurchaseCost)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-slate-900">
                        {formatCurrency(v.costVal)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[#2254E1] font-semibold">
                        {formatCurrency(v.item.sellingPrice)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-[#2254E1]">
                        {formatCurrency(v.retailVal)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-emerald-600">
                        {v.potentialMargin.toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredValuation.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-xs text-slate-400">
                        No valuation records match your search.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* MOVEMENTS TAB */}
        <TabsContent value="MOVEMENTS" className="space-y-4 pt-2">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
            <div className="flex flex-1 items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <Input
                  placeholder="Search movements by item, SKU, or reference..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 text-xs h-8 bg-slate-50 border-slate-200"
                />
              </div>

              <Select value={movementTypeFilter} onValueChange={(val) => setMovementTypeFilter(val)}>
                <SelectTrigger className="w-[180px] text-xs h-8 bg-slate-50 border-slate-200">
                  <SelectValue placeholder="Movement Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL" className="text-xs">All Types</SelectItem>
                  <SelectItem value="PURCHASE_STOCK_IN" className="text-xs">Purchase Stock In</SelectItem>
                  <SelectItem value="POS_SALE_OUT" className="text-xs">POS Sale Out</SelectItem>
                  <SelectItem value="SALON_CONSUMPTION_OUT" className="text-xs">Salon Consumption</SelectItem>
                  <SelectItem value="DAMAGE_OUT" className="text-xs">Damage Out</SelectItem>
                  <SelectItem value="EXPIRED_OUT" className="text-xs">Expired Out</SelectItem>
                  <SelectItem value="SUPPLIER_RETURN_OUT" className="text-xs">Supplier Return</SelectItem>
                  <SelectItem value="SETTLEMENT_ADJUSTMENT_IN" className="text-xs">Settlement In (+)</SelectItem>
                  <SelectItem value="SETTLEMENT_ADJUSTMENT_OUT" className="text-xs">Settlement Out (-)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              Showing {filteredMovements.length} movements
            </span>
          </div>

          <Card className="bg-white border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="text-xs font-bold text-slate-700">Timestamp</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">Item</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">Type</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-center">Direction</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">Quantity</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">Unit Cost Snapshot</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">Total Impact</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMovements.map((m) => {
                    const isIn = m.direction === 'IN';
                    return (
                      <TableRow key={m.id} className="hover:bg-slate-50/60 text-xs">
                        <TableCell className="font-mono text-slate-600">
                          {new Date(m.createdAt || m.timestamp || Date.now()).toLocaleDateString()} {new Date(m.createdAt || m.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </TableCell>
                        <TableCell className="font-bold text-slate-900">{m.itemName}</TableCell>
                        <TableCell>
                          <Badge variant="neutral" className="text-[9px]">
                            {m.movementType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="neutral"
                            className={`text-[9px] font-bold ${
                              isIn ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}
                          >
                            {isIn ? '+ IN' : '- OUT'}
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-right font-mono font-bold ${isIn ? 'text-emerald-700' : 'text-slate-900'}`}>
                          {isIn ? `+${m.quantity}` : `-${m.quantity}`}
                        </TableCell>
                        <TableCell className="text-right font-mono text-slate-600">
                          {formatCurrency(m.unitCostSnapshot || 0)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-slate-900">
                          {formatCurrency(m.totalCostImpact || 0)}
                        </TableCell>
                        <TableCell className="font-mono text-slate-500">
                          {m.referenceId || m.sourceReferenceId || '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredMovements.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-xs text-slate-400">
                        No movement records found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* LOW STOCK TAB */}
        <TabsContent value="LOW_STOCK" className="space-y-4 pt-2">
          <Card className="bg-white border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="text-xs font-bold text-slate-700">SKU</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">Item Name</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">Category</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">Current Stock</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">Min Threshold</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">Deficit</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">Default Cost</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">Est. Reorder Cost</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-center">Urgency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStockItems.map((v) => {
                    const deficit = Math.max(0, v.item.minStockLevel - v.onHand);
                    const isOut = v.onHand <= 0;
                    return (
                      <TableRow key={v.item.id} className="hover:bg-slate-50/60 text-xs">
                        <TableCell className="font-mono text-slate-800 font-semibold">{v.item.sku}</TableCell>
                        <TableCell className="font-bold text-slate-900">{v.item.name}</TableCell>
                        <TableCell className="text-slate-600">{v.item.category}</TableCell>
                        <TableCell className={`text-right font-mono font-bold ${isOut ? 'text-rose-600' : 'text-amber-600'}`}>
                          {v.onHand} {v.item.issueUnit}
                        </TableCell>
                        <TableCell className="text-right font-mono text-slate-600">
                          {v.item.minStockLevel} {v.item.issueUnit}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-rose-600">
                          {deficit} {v.item.issueUnit}
                        </TableCell>
                        <TableCell className="text-right font-mono text-slate-600">
                          {formatCurrency(v.item.defaultPurchaseCost)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-slate-900">
                          {formatCurrency(deficit * v.item.defaultPurchaseCost)}
                        </TableCell>
                        <TableCell className="text-center">
                          {isOut ? (
                            <Badge variant="destructive" className="text-[9px]">CRITICAL (OUT)</Badge>
                          ) : (
                            <Badge variant="neutral" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200">
                              REORDER DUE
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {lowStockItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-xs text-slate-400">
                        No low stock items. All inventory levels are above required reorder thresholds.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* EXPIRY TAB */}
        <TabsContent value="EXPIRY" className="space-y-4 pt-2">
          <Card className="bg-white border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="text-xs font-bold text-slate-700">Batch #</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">Item Name</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">SKU</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">Received Date</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">Expiry Date</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">Remaining Units</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">Unit Cost</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expiryBatches.map((b) => (
                    <TableRow key={b.id} className="hover:bg-slate-50/60 text-xs">
                      <TableCell className="font-mono font-bold text-slate-900">{b.batchNumber}</TableCell>
                      <TableCell className="font-semibold text-slate-900">{b.itemName}</TableCell>
                      <TableCell className="font-mono text-slate-600">{b.itemSku}</TableCell>
                      <TableCell className="font-mono text-slate-600">{b.receivedDate}</TableCell>
                      <TableCell className="font-mono font-bold text-slate-800">{b.expiryDate || 'N/A'}</TableCell>
                      <TableCell className="text-right font-mono font-bold text-slate-900">{b.remainingQuantity}</TableCell>
                      <TableCell className="text-right font-mono text-slate-600">
                        {formatCurrency(b.unitCostSnapshot || 0)}
                      </TableCell>
                      <TableCell className="text-center">
                        {b.status === 'EXPIRED' ? (
                          <Badge variant="destructive" className="text-[9px]">EXPIRED (BLOCKED)</Badge>
                        ) : b.status === 'QUARANTINED' ? (
                          <Badge variant="neutral" className="text-[9px] bg-purple-50 text-purple-700 border-purple-200">
                            QUARANTINED
                          </Badge>
                        ) : (
                          <Badge variant="neutral" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200">
                            NEAR EXPIRY
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {expiryBatches.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-xs text-slate-400">
                        No expired, quarantined, or near-expiry batches detected.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* SUPPLIERS TAB */}
        <TabsContent value="SUPPLIERS" className="space-y-4 pt-2">
          <Card className="bg-white border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="text-xs font-bold text-slate-700">Supplier Name</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">Contact</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">Phone</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">Email</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">Payable Balance</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.map((s) => {
                    const balance = s.currentBalance || 0;
                    return (
                      <TableRow key={s.id} className="hover:bg-slate-50/60 text-xs">
                        <TableCell className="font-bold text-slate-900">{s.name}</TableCell>
                        <TableCell className="text-slate-700">{s.contactPerson || '—'}</TableCell>
                        <TableCell className="font-mono text-slate-600">{s.phone || '—'}</TableCell>
                        <TableCell className="text-slate-500">{s.email || '—'}</TableCell>
                        <TableCell className={`text-right font-mono font-bold ${balance > 0 ? 'text-rose-600' : balance < 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
                          {formatCurrency(Math.abs(balance))} {balance > 0 ? '(Due)' : balance < 0 ? '(Advance)' : ''}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="neutral" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200">
                            Active
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {suppliers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-xs text-slate-400">
                        No supplier records found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
