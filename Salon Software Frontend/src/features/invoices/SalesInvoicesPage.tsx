import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { salonService } from '@/services';
import { Invoice, Branch, InvoiceStatus } from '@/types/salon';
import { AccessDeniedView } from '@/features/scaffold/AccessDeniedView';
import { ReceiptModal } from '@/features/pos/ReceiptModal';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Search,
  FileSpreadsheet,
  Printer,
  Eye,
  Calendar,
  Building2,
  CheckCircle2,
  AlertCircle,
  Clock,
  User,
  CreditCard,
  Banknote,
  RefreshCw,
  Filter,
} from 'lucide-react';

export const SalesInvoicesPage: React.FC = () => {
  const { user, activeBranchId, allBranches, demoDate } = useAuth();

  // Role guard: Super Admin, Admin, and Accountant
  if (!user || user.role === 'STAFF') {
    return <AccessDeniedView attemptedPath="/reports/sales-invoices" />;
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const branchScope = isSuperAdmin ? activeBranchId : (user.branchId as string);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | InvoiceStatus>('ALL');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'MONTH'>('ALL');

  // Detail Modal & Receipt state
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [receiptInvoice, setReceiptInvoice] = useState<Invoice | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  const loadInvoices = async () => {
    setIsLoading(true);
    try {
      const data = await salonService.getInvoices(branchScope);
      setInvoices(data);
    } catch (err) {
      console.error('Failed to load invoices:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
  }, [branchScope, demoDate]);

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.clientName.toLowerCase().includes(q) ||
        inv.clientPhone.toLowerCase().includes(q) ||
        inv.processedByName.toLowerCase().includes(q);

      const matchesStatus = statusFilter === 'ALL' || inv.status === statusFilter;

      let matchesDate = true;
      if (dateFilter === 'TODAY') {
        matchesDate = inv.date === demoDate;
      } else if (dateFilter === 'MONTH') {
        matchesDate = inv.date.startsWith(demoDate.slice(0, 7));
      }

      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [invoices, searchQuery, statusFilter, dateFilter, demoDate]);

  // Financial aggregates of visible filtered invoices
  const aggregates = useMemo(() => {
    const count = filteredInvoices.length;
    const grossSales = filteredInvoices.reduce((sum, i) => sum + i.subtotal, 0);
    const discounts = filteredInvoices.reduce((sum, i) => sum + i.discount, 0);
    const netSales = filteredInvoices.reduce((sum, i) => sum + i.netSales, 0);
    const taxTotal = filteredInvoices.reduce((sum, i) => sum + i.tax, 0);
    const tipsTotal = filteredInvoices.reduce((sum, i) => sum + i.tip, 0);
    const billTotal = netSales + taxTotal;
    const amountPaid = filteredInvoices.reduce((sum, i) => sum + i.amountPaid, 0);
    const amountDue = filteredInvoices.reduce((sum, i) => sum + i.amountDue, 0);

    return {
      count,
      grossSales,
      discounts,
      netSales,
      taxTotal,
      tipsTotal,
      billTotal,
      amountPaid,
      amountDue,
    };
  }, [filteredInvoices]);

  const getBranchName = (bId: string) => {
    return allBranches.find((b) => b.id === bId)?.name || bId;
  };

  return (
    <div className="space-y-4 font-sans max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#2254E1]/10 text-[#2254E1] flex items-center justify-center font-bold">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900 tracking-tight">Sales & Invoices Register</h1>
              <Badge variant="primary" className="text-[10px]">Read-Only Ledger</Badge>
            </div>
            <p className="text-xs text-slate-500">
              Audit trail of all POS transactions, line-item allocations, and historical payment receipts.
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={loadInvoices}
          disabled={isLoading}
          className="text-xs gap-1.5 self-start sm:self-center"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh Ledger
        </Button>
      </div>

      {/* Aggregate Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card padding="sm" className="bg-white border-slate-200/80">
          <span className="text-[11px] text-slate-500 block">Total Invoices</span>
          <span className="text-lg font-mono font-bold text-slate-900">{aggregates.count}</span>
          <span className="text-[10px] text-slate-400 block">Filtered records</span>
        </Card>

        <Card padding="sm" className="bg-white border-slate-200/80">
          <span className="text-[11px] text-slate-500 block">Net Attributable Sales</span>
          <span className="text-lg font-mono font-bold text-[#2254E1]">{formatCurrency(aggregates.netSales)}</span>
          <span className="text-[10px] text-slate-400 block">Excluding discounts & tax</span>
        </Card>

        <Card padding="sm" className="bg-white border-slate-200/80">
          <span className="text-[11px] text-slate-500 block">Sales Tax Collected</span>
          <span className="text-lg font-mono font-bold text-slate-800">{formatCurrency(aggregates.taxTotal)}</span>
          <span className="text-[10px] text-slate-400 block">Provincial revenues</span>
        </Card>

        <Card padding="sm" className="bg-white border-slate-200/80">
          <span className="text-[11px] text-slate-500 block">Outstanding Receivables</span>
          <span className={`text-lg font-mono font-bold ${aggregates.amountDue > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
            {formatCurrency(aggregates.amountDue)}
          </span>
          <span className="text-[10px] text-slate-400 block">Uncollected bill balances</span>
        </Card>
      </div>

      {/* Search and Filter Bar */}
      <Card padding="sm" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search invoice #, customer name, phone, or cashier..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8.5 h-8.5 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val as any)}>
            <SelectTrigger className="h-8.5 text-xs w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL" className="text-xs">All Statuses</SelectItem>
              <SelectItem value="PAID" className="text-xs text-emerald-600 font-medium">Fully Paid</SelectItem>
              <SelectItem value="PARTIAL" className="text-xs text-amber-600 font-medium">Partial Balance</SelectItem>
              <SelectItem value="UNPAID" className="text-xs text-rose-600 font-medium">Unpaid</SelectItem>
            </SelectContent>
          </Select>

          {/* Date Filter */}
          <Select value={dateFilter} onValueChange={(val) => setDateFilter(val as any)}>
            <SelectTrigger className="h-8.5 text-xs w-40">
              <SelectValue placeholder="Date Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL" className="text-xs">All Time</SelectItem>
              <SelectItem value="TODAY" className="text-xs">Today ({demoDate})</SelectItem>
              <SelectItem value="MONTH" className="text-xs">This Month ({demoDate.slice(0, 7)})</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Invoices Table */}
      <Card padding="none" className="overflow-hidden border-slate-200/90 shadow-2xs">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/75">
                <TableHead className="text-xs font-semibold">Invoice No.</TableHead>
                <TableHead className="text-xs font-semibold">Date & Time</TableHead>
                {isSuperAdmin && branchScope === 'ALL' && (
                  <TableHead className="text-xs font-semibold">Branch</TableHead>
                )}
                <TableHead className="text-xs font-semibold">Customer</TableHead>
                <TableHead className="text-xs font-semibold">Net Sales</TableHead>
                <TableHead className="text-xs font-semibold">Tax</TableHead>
                <TableHead className="text-xs font-semibold">Bill Total</TableHead>
                <TableHead className="text-xs font-semibold">Paid / Due</TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
                <TableHead className="w-20 text-center text-xs font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={isSuperAdmin && branchScope === 'ALL' ? 10 : 9}
                    className="py-12 text-center text-slate-400 text-xs"
                  >
                    No matching sales invoices found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredInvoices.map((inv) => (
                  <TableRow key={inv.id} className="hover:bg-slate-50/50 transition-colors text-xs">
                    <TableCell className="font-mono font-bold text-slate-900">
                      {inv.invoiceNumber}
                    </TableCell>
                    <TableCell className="text-slate-500 whitespace-nowrap">
                      {inv.date} <span className="text-slate-400 text-[10px]">{inv.time}</span>
                    </TableCell>
                    {isSuperAdmin && branchScope === 'ALL' && (
                      <TableCell className="text-slate-600 whitespace-nowrap">
                        {getBranchName(inv.branchId)}
                      </TableCell>
                    )}
                    <TableCell>
                      <span className="font-semibold text-slate-900 block">{inv.clientName}</span>
                      {inv.clientPhone && inv.clientPhone !== 'N/A' && (
                        <span className="text-[10px] text-slate-400 font-mono block">{inv.clientPhone}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-slate-700">
                      {formatCurrency(inv.netSales)}
                    </TableCell>
                    <TableCell className="font-mono text-slate-500">
                      {formatCurrency(inv.tax)}
                    </TableCell>
                    <TableCell className="font-mono font-bold text-[#2254E1]">
                      {formatCurrency(inv.netSales + inv.tax)}
                    </TableCell>
                    <TableCell className="font-mono">
                      <span className="text-emerald-700 block font-semibold">{formatCurrency(inv.amountPaid)}</span>
                      {inv.amountDue > 0 && (
                        <span className="text-rose-600 text-[10px] block">Due: {formatCurrency(inv.amountDue)}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={inv.status === 'PAID' ? 'success' : inv.status === 'PARTIAL' ? 'warning' : 'neutral'}
                        className="text-[10px]"
                      >
                        {inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => {
                            setSelectedInvoice(inv);
                            setIsDetailOpen(true);
                          }}
                          className="p-1 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 cursor-pointer"
                          title="View Invoice Breakdown"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setReceiptInvoice(inv);
                            setIsReceiptOpen(true);
                          }}
                          className="p-1 rounded hover:bg-slate-100 text-[#2254E1] hover:text-[#1B44B8] cursor-pointer"
                          title="Print Receipt"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* INVOICE DETAILS DIALOG */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl font-sans max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center justify-between">
              <span>Invoice {selectedInvoice?.invoiceNumber}</span>
              <Badge
                variant={selectedInvoice?.status === 'PAID' ? 'success' : selectedInvoice?.status === 'PARTIAL' ? 'warning' : 'neutral'}
              >
                {selectedInvoice?.status}
              </Badge>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Transaction date: {selectedInvoice?.date} at {selectedInvoice?.time} • Cashier: {selectedInvoice?.processedByName}
            </DialogDescription>
          </DialogHeader>

          {selectedInvoice && (
            <div className="space-y-4 text-xs">
              {/* Customer Box */}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 flex justify-between items-center">
                <div>
                  <span className="text-[11px] text-slate-500 block">Customer</span>
                  <span className="font-bold text-slate-900 text-sm">{selectedInvoice.clientName}</span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-slate-500 block">Phone</span>
                  <span className="font-mono text-slate-700">{selectedInvoice.clientPhone}</span>
                </div>
              </div>

              {/* Line Items Breakdown */}
              <div className="space-y-2">
                <span className="font-semibold text-slate-900 text-xs block">Itemized Services & Packages</span>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 text-[11px]">
                        <TableHead>Service / Package</TableHead>
                        <TableHead>Staff Attributed</TableHead>
                        <TableHead className="text-center">Qty</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Line Net</TableHead>
                        <TableHead className="text-right">Tax</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedInvoice.lineItems.map((li, idx) => (
                        <React.Fragment key={li.id || idx}>
                          <TableRow className="text-xs">
                            <TableCell className="font-medium text-slate-900">
                              {li.name}
                              {li.type === 'PACKAGE' && (
                                <Badge variant="primary" className="ml-1.5 text-[9px] px-1 py-0">Bundle</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-slate-600">{li.staffName}</TableCell>
                            <TableCell className="text-center font-mono">{li.quantity}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(li.unitPrice)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(li.netSales || li.unitPrice * li.quantity)}</TableCell>
                            <TableCell className="text-right font-mono text-slate-500">{formatCurrency(li.tax)}</TableCell>
                            <TableCell className="text-right font-mono font-bold text-slate-900">{formatCurrency(li.total)}</TableCell>
                          </TableRow>
                          {li.packageComponents && li.packageComponents.length > 0 && (
                            <TableRow className="bg-blue-50/30 text-[10px]">
                              <TableCell colSpan={7} className="py-1.5 pl-6">
                                <span className="font-semibold text-[#2254E1] mr-2">Components Revenue Allocation:</span>
                                {li.packageComponents.map((c) => (
                                  <span key={c.serviceId} className="mr-3 text-slate-700">
                                    • {c.serviceName} ({c.staffName}): <strong>{formatCurrency(c.allocatedAmount)}</strong> ({c.allocationPercentage}%)
                                  </span>
                                ))}
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Financial Totals */}
              <div className="grid grid-cols-2 gap-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Gross Sales:</span>
                    <span className="font-mono">{formatCurrency(selectedInvoice.subtotal)}</span>
                  </div>
                  {selectedInvoice.discount > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Discount Applied:</span>
                      <span className="font-mono">- {formatCurrency(selectedInvoice.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-medium">
                    <span className="text-slate-700">Net Sales:</span>
                    <span className="font-mono">{formatCurrency(selectedInvoice.netSales)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Provincial Sales Tax:</span>
                    <span className="font-mono">{formatCurrency(selectedInvoice.tax)}</span>
                  </div>
                </div>

                <div className="space-y-1 text-[11px] border-l border-slate-200 pl-4">
                  <div className="flex justify-between font-bold text-slate-900 text-xs">
                    <span>Bill Total:</span>
                    <span className="font-mono text-[#2254E1]">{formatCurrency(selectedInvoice.netSales + selectedInvoice.tax)}</span>
                  </div>
                  {selectedInvoice.tip > 0 && (
                    <div className="flex justify-between text-amber-700">
                      <span>Direct Staff Tip:</span>
                      <span className="font-mono font-semibold">+ {formatCurrency(selectedInvoice.tip)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-1 border-t border-slate-200">
                    <span className="text-slate-600">Total Paid:</span>
                    <span className="font-mono font-bold text-emerald-700">{formatCurrency(selectedInvoice.amountPaid)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={selectedInvoice.amountDue > 0 ? 'text-rose-600 font-bold' : 'text-slate-600'}>
                      Outstanding Balance:
                    </span>
                    <span className={`font-mono font-bold ${selectedInvoice.amountDue > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                      {formatCurrency(selectedInvoice.amountDue)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment Receipts History */}
              <div className="space-y-2">
                <span className="font-semibold text-slate-900 text-xs block">Payment Receipts Log</span>
                {selectedInvoice.payments.length === 0 ? (
                  <p className="text-slate-400 italic text-[11px]">No payments recorded on this invoice.</p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedInvoice.payments.map((p) => (
                      <div
                        key={p.id}
                        className="p-2 rounded border border-slate-200 bg-white flex justify-between items-center text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-800">
                              {p.method === 'CASH' ? 'Cash Tender' : p.paymentAccountName || 'Online Account'}
                            </span>
                            <Badge variant="neutral" className="text-[9px]">{p.method}</Badge>
                          </div>
                          <span className="text-[10px] text-slate-400 block">
                            Receipt date: {p.date} • Processed by: {p.processedByName}
                          </span>
                        </div>
                        <div className="text-right font-mono">
                          <span className="font-bold text-slate-900 text-xs block">{formatCurrency(p.amount)}</span>
                          <span className="text-[10px] text-slate-500">
                            Bill: {formatCurrency(p.billAmountAllocated || 0)}
                            {(p.tipAmountAllocated || 0) > 0 && ` • Tip: ${formatCurrency(p.tipAmountAllocated || 0)}`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsDetailOpen(false)} className="text-xs">
              Close
            </Button>
            <Button
              onClick={() => {
                setReceiptInvoice(selectedInvoice);
                setIsReceiptOpen(true);
              }}
              className="bg-[#2254E1] hover:bg-[#1B44B8] text-white text-xs gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PRINTABLE RECEIPT MODAL */}
      <ReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
        invoice={receiptInvoice}
        branch={allBranches.find((b) => b.id === receiptInvoice?.branchId) || null}
      />
    </div>
  );
};
