import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { salonService } from '@/services';
import {
  COGSReportRecord,
  COGSReportSummary,
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
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import {
  TrendingUp,
  DollarSign,
  Download,
  Printer,
  RefreshCw,
  Search,
  Calendar,
  Building2,
  PieChart,
  Percent,
  Scissors,
  Package,
} from 'lucide-react';

export const COGSReportPage: React.FC = () => {
  const { user, activeBranchId, allBranches } = useAuth();

  // Role Guard: SUPER_ADMIN, ADMIN, ACCOUNTANT (Staff cannot access)
  if (!user || user.role === 'STAFF') {
    return <AccessDeniedView attemptedPath="/reports/cogs" />;
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

  // Date Range State (Defaults to current month)
  const todayStr = new Date().toISOString().split('T')[0];
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .split('T')[0];

  const [startDate, setStartDate] = useState<string>(firstOfMonth);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [isLoading, setIsLoading] = useState(true);

  // Data State
  const [cogsRecords, setCogsRecords] = useState<COGSReportRecord[]>([]);
  const [cogsSummary, setCogsSummary] = useState<COGSReportSummary>({
    totalRetailNetSales: 0,
    totalRetailCOGS: 0,
    totalRetailGrossProfit: 0,
    retailGrossMarginPercentage: 0,
    totalConsumableMaterialCost: 0,
    totalServiceRevenue: 0,
    serviceContributionBeforeExpenses: 0,
  });

  const [searchQuery, setSearchQuery] = useState('');

  const loadCOGSData = async () => {
    setIsLoading(true);
    try {
      const data = await salonService.getCOGSReport(selectedBranchId, startDate, endDate, user);
      setCogsRecords(data.records || []);
      setCogsSummary(data.summary || {
        totalRetailNetSales: 0,
        totalRetailCOGS: 0,
        totalRetailGrossProfit: 0,
        retailGrossMarginPercentage: 0,
        totalConsumableMaterialCost: 0,
        totalServiceRevenue: 0,
        serviceContributionBeforeExpenses: 0,
      });
    } catch (err) {
      console.error('Failed to load COGS report:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedBranchId) {
      loadCOGSData();
    }
  }, [selectedBranchId, startDate, endDate]);

  const filteredRecords = useMemo(() => {
    return cogsRecords.filter(
      (r) =>
        r.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.category.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [cogsRecords, searchQuery]);

  const handleExportCSV = () => {
    let csv = 'Product Name,SKU,Category,Units Sold,Units Returned,Net Units,Net Sales,COGS,Gross Profit,Margin %\n';
    filteredRecords.forEach((r) => {
      csv += `"${r.productName}","${r.sku}","${r.category}",${r.quantitySold},${r.quantityReturned},${r.netQuantity},${r.netSales},${r.cogs},${r.grossProfit},${r.marginPercentage.toFixed(1)}%\n`;
    });
    const encodedUri = encodeURI('data:text/csv;charset=utf-8,' + csv);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `cogs_product_profitability_${startDate}_to_${endDate}.csv`);
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
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Cost of Goods Sold (COGS) & Profitability</h1>
            <Badge variant="neutral" className="bg-[#2254E1]/10 text-[#2254E1] font-semibold text-xs border-[#2254E1]/20">
              Profit & Margins
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Authoritative cost of goods sold derived from historical batch purchase cost snapshots at time of POS sale.
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

          <Button variant="outline" size="sm" onClick={loadCOGSData} className="text-xs gap-1.5 h-8">
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

      {/* Date Filter & Scope Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold text-slate-700">Date Range:</span>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="text-xs h-8 font-mono w-36"
          />
          <span className="text-xs text-slate-400">to</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="text-xs h-8 font-mono w-36"
          />
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <Input
            placeholder="Search products in report..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 text-xs h-8 bg-slate-50 border-slate-200"
          />
        </div>
      </div>

      {/* Executive Financial Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card className="p-3.5 bg-white border-slate-200">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Net Product Sales</span>
          <p className="text-lg font-bold text-slate-900 mt-1 font-mono">
            {formatCurrency(cogsSummary.totalRetailNetSales || cogsSummary.netProductSales || 0)}
          </p>
          <span className="text-[10px] text-slate-500 mt-0.5 block">POS Retail sales after discount</span>
        </Card>

        <Card className="p-3.5 bg-white border-slate-200">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Retail Product COGS</span>
          <p className="text-lg font-bold text-rose-600 mt-1 font-mono">
            {formatCurrency(cogsSummary.totalRetailCOGS || cogsSummary.totalCOGS || 0)}
          </p>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Historical batch cost deducted</span>
        </Card>

        <Card className="p-3.5 bg-white border-slate-200">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Retail Gross Profit</span>
          <p className="text-lg font-bold text-[#2254E1] mt-1 font-mono">
            {formatCurrency(cogsSummary.totalRetailGrossProfit || cogsSummary.grossProfit || 0)}
          </p>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Net sales minus product COGS</span>
        </Card>

        <Card className="p-3.5 bg-white border-slate-200">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Retail Gross Margin</span>
          <p className="text-lg font-bold text-emerald-600 mt-1 font-mono">
            {(cogsSummary.retailGrossMarginPercentage || 0).toFixed(1)}%
          </p>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Gross Profit / Net Sales</span>
        </Card>

        <Card className="p-3.5 bg-white border-slate-200">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Salon Consumption Cost</span>
          <p className="text-lg font-bold text-amber-600 mt-1 font-mono">
            {formatCurrency(cogsSummary.totalConsumableMaterialCost || 0)}
          </p>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Material used in treatments</span>
        </Card>
      </div>

      {/* Product Breakdown Table */}
      <Card className="bg-white border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">Product Profitability Breakdown</h2>
          <span className="text-xs text-slate-500 font-medium">
            {filteredRecords.length} Products Analyzed
          </span>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="text-xs font-bold text-slate-700">SKU</TableHead>
                <TableHead className="text-xs font-bold text-slate-700">Product Name</TableHead>
                <TableHead className="text-xs font-bold text-slate-700">Category</TableHead>
                <TableHead className="text-xs font-bold text-slate-700 text-right">Sold Qty</TableHead>
                <TableHead className="text-xs font-bold text-slate-700 text-right">Returned Qty</TableHead>
                <TableHead className="text-xs font-bold text-slate-700 text-right">Net Qty</TableHead>
                <TableHead className="text-xs font-bold text-slate-700 text-right">Net Sales</TableHead>
                <TableHead className="text-xs font-bold text-slate-700 text-right">COGS</TableHead>
                <TableHead className="text-xs font-bold text-slate-700 text-right">Gross Profit</TableHead>
                <TableHead className="text-xs font-bold text-slate-700 text-right">Margin %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRecords.map((r) => (
                <TableRow key={r.productId} className="hover:bg-slate-50/60 text-xs">
                  <TableCell className="font-mono text-slate-800 font-semibold">{r.sku}</TableCell>
                  <TableCell className="font-bold text-slate-900">{r.productName}</TableCell>
                  <TableCell className="text-slate-600">{r.category}</TableCell>
                  <TableCell className="text-right font-mono text-slate-800">{r.quantitySold}</TableCell>
                  <TableCell className="text-right font-mono text-slate-500">{r.quantityReturned}</TableCell>
                  <TableCell className="text-right font-mono font-bold text-slate-900">{r.netQuantity}</TableCell>
                  <TableCell className="text-right font-mono font-bold text-slate-900">
                    {formatCurrency(r.netSales)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-rose-600 font-semibold">
                    {formatCurrency(r.cogs)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-emerald-600">
                    {formatCurrency(r.grossProfit)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-slate-900">
                    {r.marginPercentage.toFixed(1)}%
                  </TableCell>
                </TableRow>
              ))}
              {filteredRecords.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-10 text-xs text-slate-400">
                    No retail product sales recorded in the selected date range.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
};
