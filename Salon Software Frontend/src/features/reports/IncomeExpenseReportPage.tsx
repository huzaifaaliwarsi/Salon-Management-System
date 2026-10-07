import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { salonService } from '@/services';
import { Invoice, Expense } from '@/types/salon';
import { formatCurrency, formatNumber } from '@/lib/formatters';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  CreditCard,
  PieChart,
  RefreshCw,
  Calendar,
  BarChart3,
  Receipt,
  Coins,
} from 'lucide-react';

export const IncomeExpenseReportPage: React.FC = () => {
  const { user, activeBranchId, allBranches } = useAuth();

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const effectiveBranchId = user?.role === 'SUPER_ADMIN' ? activeBranchId : user?.branchId;

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const branchParam = effectiveBranchId || 'ALL';
      const [invList, expList] = await Promise.all([
        salonService.getInvoices(branchParam, { startDate, endDate }),
        salonService.getExpenses(branchParam, { startDate, endDate }),
      ]);

      // Filter out voided invoices
      const liveInvoices = (invList || []).filter((i: any) => i.lifecycle !== 'VOIDED');
      // Filter out reversed expenses
      const liveExpenses = (expList || []).filter((e: any) => e.status === 'POSTED' && !e.isReversalRecord);

      setInvoices(liveInvoices);
      setExpenses(liveExpenses);
    } catch (err: any) {
      setError(err.message || 'Failed to load financial statements.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [effectiveBranchId, startDate, endDate]);

  // Aggregate financials
  const grossSales = invoices.reduce((sum, inv) => sum + (inv.subtotal || 0), 0);
  const totalDiscounts = invoices.reduce((sum, inv) => sum + (inv.discount || 0), 0);
  const netSales = invoices.reduce((sum, inv) => sum + (inv.netSales || 0), 0);
  const taxBilled = invoices.reduce((sum, inv) => sum + (inv.tax || 0), 0);
  const tipsCollected = invoices.reduce((sum, inv) => sum + (inv.tip || 0), 0);

  const totalExpenses = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
  const netOperatingSurplus = netSales - totalExpenses;

  // Group expenses by category
  const expenseByCategory = expenses.reduce<Record<string, number>>((acc, exp) => {
    const cat = exp.category || 'General Operational';
    acc[cat] = (acc[cat] || 0) + exp.amount;
    return acc;
  }, {});

  const sortedExpenseCategories = Object.entries(expenseByCategory).sort(([, a], [, b]) => b - a);

  // Group payment methods collected
  const cashSales = invoices.reduce((sum, inv) => {
    const cashPayments = (inv.payments || [])
      .filter((p) => p.method === 'CASH')
      .reduce((pSum, p) => pSum + (p.amount || 0), 0);
    return sum + cashPayments;
  }, 0);

  const onlineSales = invoices.reduce((sum, inv) => {
    const onlinePayments = (inv.payments || [])
      .filter((p) => p.method === 'ONLINE_ACCOUNT')
      .reduce((pSum, p) => pSum + (p.amount || 0), 0);
    return sum + onlinePayments;
  }, 0);

  const currentBranchName =
    effectiveBranchId === 'ALL'
      ? 'All Locations (Consolidated)'
      : allBranches.find((b) => b.id === effectiveBranchId)?.name || 'Selected Branch';

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="primary" dot>
              Financial Intelligence
            </Badge>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-600 font-medium">{currentBranchName}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 mt-1 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-[#2254E1]" />
            Income & Operating Expense Statement
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Net revenue calculation, paid expense attribution, segregated staff gratuity, and operating margin.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-xs border-none bg-transparent focus:outline-none"
            />
            <span className="text-slate-300">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-xs border-none bg-transparent focus:outline-none"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
            onClick={loadData}
            disabled={isLoading}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Financial KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Gross Billed Revenue"
          value={formatCurrency(grossSales)}
          subtitle={`Discounts: ${formatCurrency(totalDiscounts)}`}
          icon={<DollarSign className="w-4 h-4" />}
          tone="primary"
        />

        <StatCard
          title="Net Operating Revenue"
          value={formatCurrency(netSales)}
          subtitle="Gross sales less promotional discounts"
          icon={<Receipt className="w-4 h-4" />}
          tone="success"
        />

        <StatCard
          title="Paid Operating Expenses"
          value={formatCurrency(totalExpenses)}
          subtitle={`${expenses.length} verified voucher payments`}
          icon={<CreditCard className="w-4 h-4" />}
          tone="warning"
        />

        <StatCard
          title="Net Operating Surplus"
          value={formatCurrency(netOperatingSurplus)}
          subtitle={netOperatingSurplus >= 0 ? 'Operating Profit' : 'Operating Deficit'}
          icon={netOperatingSurplus >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          tone={netOperatingSurplus >= 0 ? 'success' : 'warning'}
          trendText={netOperatingSurplus >= 0 ? '+Surplus' : 'Deficit'}
          trendDirection={netOperatingSurplus >= 0 ? 'up' : 'down'}
        />
      </div>

      {/* Secondary Financial Strip: Tax, Tips & Collections */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-white border border-slate-200/80 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Provincial Tax Billed (PST/SST)</p>
            <p className="text-base font-semibold text-slate-900 tabular-nums mt-0.5">
              {formatCurrency(taxBilled)}
            </p>
          </div>
          <span className="text-xs text-slate-400 font-medium">Billed Tax</span>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200/80 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Staff Tips (Segregated)</p>
            <p className="text-base font-semibold text-purple-700 tabular-nums mt-0.5">
              {formatCurrency(tipsCollected)}
            </p>
          </div>
          <span className="text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded font-medium">
            Custody Liability
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200/80 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Cash vs Bank Split</p>
            <p className="text-xs font-semibold text-slate-900 mt-1">
              Cash: <span className="text-emerald-700">{formatCurrency(cashSales)}</span> · Bank:{' '}
              <span className="text-[#2254E1]">{formatCurrency(onlineSales)}</span>
            </p>
          </div>
          <span className="text-xs text-slate-400 font-medium">Collections</span>
        </div>
      </div>

      {/* Detailed Revenue & Expense Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expenses by Category */}
        <Card padding="md">
          <CardHeader
            title="Operating Expenses by Category"
            subtitle={`${sortedExpenseCategories.length} categories charged in this period`}
          />

          <div className="space-y-3">
            {sortedExpenseCategories.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-xs">
                No operating expenses recorded for this period.
              </div>
            ) : (
              sortedExpenseCategories.map(([category, amt]) => {
                const pct = totalExpenses > 0 ? (amt / totalExpenses) * 100 : 0;
                return (
                  <div key={category} className="p-3 rounded-lg border border-slate-100 bg-slate-50/50 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-900">{category}</span>
                      <span className="font-semibold text-rose-700 tabular-nums">{formatCurrency(amt)}</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-rose-500 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                    <div className="flex justify-end text-[11px] text-slate-400 font-medium">
                      {pct.toFixed(1)}% of total paid expenses
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        {/* Recent Invoiced Revenue Highlights */}
        <Card padding="none">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Recent Service Invoices</h3>
              <p className="text-xs text-slate-500">Customer checkout records and billings</p>
            </div>
            <span className="text-xs font-semibold text-slate-600">
              Total Count: {formatNumber(invoices.length)}
            </span>
          </div>

          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {invoices.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-xs">
                No customer invoices billed in this date range.
              </div>
            ) : (
              invoices.slice(0, 8).map((inv) => (
                <div key={inv.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50/60 transition-colors">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-900">{inv.invoiceNumber}</span>
                      <Badge size="sm" variant={inv.status === 'PAID' ? 'success' : 'warning'}>
                        {inv.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                      <span>{inv.clientName}</span>
                      <span>·</span>
                      <span className="text-slate-400">{inv.date}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-semibold text-slate-900 tabular-nums block">
                      {formatCurrency(inv.total)}
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      Net: {formatCurrency(inv.netSales)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};
