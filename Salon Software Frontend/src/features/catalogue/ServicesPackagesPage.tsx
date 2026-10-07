import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { salonService } from '@/services';
import { toast } from '@/context/ToastContext';
import {
  ServiceItem,
  PackageItem,
  PackageComponent,
  ServiceCategory,
  TaxRule,
  TaxTreatment,
  StaffMember,
  Branch,
} from '@/types/salon';
import { AccessDeniedView } from '@/features/scaffold/AccessDeniedView';
import { formatCurrency } from '@/lib/formatters';
import { allocatePackageRevenue, roundCurrency } from '@/lib/taxCalculations';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  Scissors,
  Package,
  Plus,
  Search,
  MoreVertical,
  Edit,
  Eye,
  PowerOff,
  Power,
  AlertCircle,
  CheckCircle2,
  Building2,
  Clock,
  Coins,
  Percent,
  Users,
  Layers,
  Sparkles,
  Info,
  Trash2,
} from 'lucide-react';

export const ServicesPackagesPage: React.FC = () => {
  const { user, activeBranchId, allBranches } = useAuth();

  // Role guard: Only SUPER_ADMIN and ADMIN
  if (!user || (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN')) {
    return <AccessDeniedView attemptedPath="/operations/services-packages" />;
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN';

  // Branch selector state: For Super Admin, use activeBranchId or first branch; for Admin, use user.branchId
  const initialBranchId = isSuperAdmin
    ? (activeBranchId !== 'ALL' ? activeBranchId : allBranches[0]?.id || '')
    : (user.branchId as string);

  const [selectedBranchId, setSelectedBranchId] = useState<string>(initialBranchId);
  const [activeTab, setActiveTab] = useState<'SERVICES' | 'PACKAGES'>('SERVICES');

  // Data collections
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [taxRules, setTaxRules] = useState<TaxRule[]>([]);
  const [branchStaff, setBranchStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Search and filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modals state
  const [isAddServiceModalOpen, setIsAddServiceModalOpen] = useState(false);
  const [isEditServiceModalOpen, setIsEditServiceModalOpen] = useState(false);
  const [isViewServiceModalOpen, setIsViewServiceModalOpen] = useState(false);
  const [isServiceStatusAlertOpen, setIsServiceStatusAlertOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);

  const [isAddPackageModalOpen, setIsAddPackageModalOpen] = useState(false);
  const [isEditPackageModalOpen, setIsEditPackageModalOpen] = useState(false);
  const [isViewPackageModalOpen, setIsViewPackageModalOpen] = useState(false);
  const [isPackageStatusAlertOpen, setIsPackageStatusAlertOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<PackageItem | null>(null);

  // Category modal
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryError, setCategoryError] = useState<string | null>(null);

  // Staff Assignment Preview Modal (for packages)
  const [isStaffPreviewModalOpen, setIsStaffPreviewModalOpen] = useState(false);
  const [previewPackage, setPreviewPackage] = useState<PackageItem | null>(null);
  const [previewStaffAssignments, setPreviewStaffAssignments] = useState<Record<string, string>>({});

  // Feedback states
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Forms state
  const [serviceFormData, setServiceFormData] = useState<{
    code: string;
    name: string;
    category: string;
    durationMinutes: number;
    price: number;
    description: string;
    taxTreatment: TaxTreatment;
    specificTaxRuleId: string;
    isActive: boolean;
  }>({
    code: '',
    name: '',
    category: 'Hair Styling & Cuts',
    durationMinutes: 45,
    price: 3500,
    description: '',
    taxTreatment: 'BRANCH_DEFAULT',
    specificTaxRuleId: '',
    isActive: true,
  });

  const [packageFormData, setPackageFormData] = useState<{
    code: string;
    name: string;
    description: string;
    price: number;
    taxTreatment: TaxTreatment;
    specificTaxRuleId: string;
    isActive: boolean;
    components: PackageComponent[];
  }>({
    code: '',
    name: '',
    description: '',
    price: 15000,
    taxTreatment: 'BRANCH_DEFAULT',
    specificTaxRuleId: '',
    isActive: true,
    components: [],
  });

  // Current branch entity
  const currentBranch = allBranches.find((b) => b.id === selectedBranchId) || allBranches[0];
  const branchTaxRate = currentBranch?.taxEnabled ? (currentBranch.taxRate ?? 0) : 0;
  const branchTaxPercent = (branchTaxRate * 100).toFixed(0);

  // Fetch all data for branch
  const loadBranchCatalogue = async () => {
    if (!selectedBranchId) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [srvList, pkgList, catList, taxList, staffList] = await Promise.all([
        salonService.getServices(selectedBranchId),
        salonService.getPackages(selectedBranchId),
        salonService.getServiceCategories(selectedBranchId),
        salonService.getTaxRules(selectedBranchId),
        salonService.getStaffMembers(user, selectedBranchId),
      ]);
      setServices(srvList);
      setPackages(pkgList);
      setCategories(catList);
      setTaxRules(taxList);
      setBranchStaff(staffList.filter((s) => s.isActive));
    } catch (err: any) {
      console.error('Failed to load catalogue data:', err);
      setErrorMessage(err.message || 'Failed to load branch catalogue.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBranchCatalogue();
  }, [selectedBranchId]);

  // Keep branch in sync if activeBranchId changes for Super Admin or when branches load
  useEffect(() => {
    if (isSuperAdmin && activeBranchId !== 'ALL' && activeBranchId !== selectedBranchId) {
      setSelectedBranchId(activeBranchId);
    } else if (!selectedBranchId && allBranches.length > 0) {
      setSelectedBranchId(allBranches[0].id);
    }
  }, [activeBranchId, isSuperAdmin, selectedBranchId, allBranches]);

  // Filtered Services
  const filteredServices = useMemo(() => {
    return services.filter((srv) => {
      const matchesSearch =
        srv.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        srv.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        srv.category.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = categoryFilter === 'ALL' || srv.category === categoryFilter;
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && srv.isActive) ||
        (statusFilter === 'INACTIVE' && !srv.isActive);
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [services, searchQuery, categoryFilter, statusFilter]);

  // Filtered Packages
  const filteredPackages = useMemo(() => {
    return packages.filter((pkg) => {
      const matchesSearch =
        pkg.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        pkg.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (pkg.description && pkg.description.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && pkg.isActive) ||
        (statusFilter === 'INACTIVE' && !pkg.isActive);
      return matchesSearch && matchesStatus;
    });
  }, [packages, searchQuery, statusFilter]);

  // Compute package allocation summary live for package modal
  const packageAllocationSummary = useMemo(() => {
    return allocatePackageRevenue(packageFormData.price, packageFormData.components);
  }, [packageFormData.price, packageFormData.components]);

  const packageAllocationTotalPct = useMemo(() => {
    return packageFormData.components.reduce((sum, c) => sum + (c.allocationPercentage || 0), 0);
  }, [packageFormData.components]);

  // Handler: Add category
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setCategoryError(null);
    try {
      const created = await salonService.createServiceCategory(selectedBranchId, newCategoryName, user);
      setCategories((prev) => [...prev, created]);
      setNewCategoryName('');
      setIsCategoryModalOpen(false);
      setSuccessMessage(`Category '${created.name}' created successfully.`);
      toast.success(`Category '${created.name}' created successfully!`);
    } catch (err: any) {
      const msg = err.message || 'Failed to create category.';
      setCategoryError(msg);
      toast.error(msg);
    }
  };

  // Handler: Save Service
  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      if (isAddServiceModalOpen) {
        await salonService.createService(
          {
            branchId: selectedBranchId,
            code: serviceFormData.code,
            name: serviceFormData.name,
            category: serviceFormData.category,
            durationMinutes: Number(serviceFormData.durationMinutes),
            price: Number(serviceFormData.price),
            description: serviceFormData.description,
            taxTreatment: serviceFormData.taxTreatment,
            specificTaxRuleId: serviceFormData.taxTreatment === 'SPECIFIC_RULE' ? serviceFormData.specificTaxRuleId : undefined,
            isActive: serviceFormData.isActive,
          },
          user
        );
        const msg = `Service '${serviceFormData.name}' created successfully.`;
        setSuccessMessage(msg);
        toast.success(msg);
        setIsAddServiceModalOpen(false);
      } else if (isEditServiceModalOpen && selectedService) {
        await salonService.updateService(
          selectedService.id,
          {
            code: serviceFormData.code,
            name: serviceFormData.name,
            category: serviceFormData.category,
            durationMinutes: Number(serviceFormData.durationMinutes),
            price: Number(serviceFormData.price),
            description: serviceFormData.description,
            taxTreatment: serviceFormData.taxTreatment,
            specificTaxRuleId: serviceFormData.taxTreatment === 'SPECIFIC_RULE' ? serviceFormData.specificTaxRuleId : undefined,
            isActive: serviceFormData.isActive,
          },
          user
        );
        const msg = `Service '${serviceFormData.name}' updated successfully.`;
        setSuccessMessage(msg);
        toast.success(msg);
        setIsEditServiceModalOpen(false);
      }
      loadBranchCatalogue();
    } catch (err: any) {
      const msg = err.message || 'Failed to save service.';
      setErrorMessage(msg);
      toast.error(msg);
    }
  };

  // Handler: Toggle Service Status
  const handleToggleServiceStatus = async () => {
    if (!selectedService) return;
    try {
      const updated = await salonService.toggleServiceStatus(selectedService.id, user);
      const msg = `Service '${updated.name}' is now ${updated.isActive ? 'Active' : 'Inactive'}.`;
      setSuccessMessage(msg);
      toast.success(msg);
      setIsServiceStatusAlertOpen(false);
      loadBranchCatalogue();
    } catch (err: any) {
      const msg = err.message || 'Failed to change service status.';
      setErrorMessage(msg);
      toast.error(msg);
    }
  };

  // Handler: Add Component to Package Form
  const handleAddPackageComponent = (serviceId: string) => {
    const srv = services.find((s) => s.id === serviceId);
    if (!srv) return;
    if (packageFormData.components.some((c) => c.serviceId === serviceId)) {
      setErrorMessage(`Service '${srv.name}' is already in this package.`);
      return;
    }

    const currentCount = packageFormData.components.length + 1;
    const defaultPct = Math.round(100 / currentCount);

    const newComponents: PackageComponent[] = [
      ...packageFormData.components,
      {
        serviceId: srv.id,
        serviceCode: srv.code,
        serviceName: srv.name,
        quantity: 1,
        allocationPercentage: defaultPct,
        unitPrice: srv.price,
      },
    ];

    setPackageFormData({
      ...packageFormData,
      components: newComponents,
    });
  };

  // Handler: Remove Component from Package Form
  const handleRemovePackageComponent = (index: number) => {
    const next = [...packageFormData.components];
    next.splice(index, 1);
    setPackageFormData({ ...packageFormData, components: next });
  };

  // Handler: Update Component in Package Form
  const handleUpdatePackageComponent = (index: number, fields: Partial<PackageComponent>) => {
    const next = [...packageFormData.components];
    next[index] = { ...next[index], ...fields };
    setPackageFormData({ ...packageFormData, components: next });
  };

  // Handler: Save Package
  const handleSavePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      if (Math.abs(packageAllocationTotalPct - 100) > 0.001) {
        throw new Error(`Total allocation percentage must equal exactly 100% (currently ${packageAllocationTotalPct}%).`);
      }

      if (isAddPackageModalOpen) {
        await salonService.createPackage(
          {
            branchId: selectedBranchId,
            code: packageFormData.code,
            name: packageFormData.name,
            description: packageFormData.description,
            price: Number(packageFormData.price),
            components: packageFormData.components,
            taxTreatment: packageFormData.taxTreatment,
            specificTaxRuleId: packageFormData.taxTreatment === 'SPECIFIC_RULE' ? packageFormData.specificTaxRuleId : undefined,
            isActive: packageFormData.isActive,
          },
          user
        );
        setSuccessMessage(`Package '${packageFormData.name}' created successfully.`);
        setIsAddPackageModalOpen(false);
      } else if (isEditPackageModalOpen && selectedPackage) {
        await salonService.updatePackage(
          selectedPackage.id,
          {
            code: packageFormData.code,
            name: packageFormData.name,
            description: packageFormData.description,
            price: Number(packageFormData.price),
            components: packageFormData.components,
            taxTreatment: packageFormData.taxTreatment,
            specificTaxRuleId: packageFormData.taxTreatment === 'SPECIFIC_RULE' ? packageFormData.specificTaxRuleId : undefined,
            isActive: packageFormData.isActive,
          },
          user
        );
        setSuccessMessage(`Package '${packageFormData.name}' updated successfully.`);
        setIsEditPackageModalOpen(false);
      }
      loadBranchCatalogue();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save package.');
    }
  };

  // Handler: Toggle Package Status
  const handleTogglePackageStatus = async () => {
    if (!selectedPackage) return;
    try {
      const updated = await salonService.togglePackageStatus(selectedPackage.id, user);
      setSuccessMessage(`Package '${updated.name}' is now ${updated.isActive ? 'Active' : 'Inactive'}.`);
      setIsPackageStatusAlertOpen(false);
      loadBranchCatalogue();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to change package status.');
    }
  };

  // Open Edit Service Modal
  const openEditServiceModal = (srv: ServiceItem) => {
    setSelectedService(srv);
    setServiceFormData({
      code: srv.code,
      name: srv.name,
      category: srv.category,
      durationMinutes: srv.durationMinutes,
      price: srv.price,
      description: srv.description || '',
      taxTreatment: srv.taxTreatment,
      specificTaxRuleId: srv.specificTaxRuleId || '',
      isActive: srv.isActive,
    });
    setIsEditServiceModalOpen(true);
  };

  // Open Edit Package Modal
  const openEditPackageModal = (pkg: PackageItem) => {
    setSelectedPackage(pkg);
    setPackageFormData({
      code: pkg.code,
      name: pkg.name,
      description: pkg.description || '',
      price: pkg.price,
      taxTreatment: pkg.taxTreatment,
      specificTaxRuleId: pkg.specificTaxRuleId || '',
      isActive: pkg.isActive,
      components: [...pkg.components],
    });
    setIsEditPackageModalOpen(true);
  };

  // Open Multi-Staff Assignment Preview Modal
  const openStaffPreviewModal = (pkg: PackageItem) => {
    setPreviewPackage(pkg);
    // Seed initial assignments with active branch stylists
    const initialMap: Record<string, string> = {};
    pkg.components.forEach((c, idx) => {
      const assigned = branchStaff[idx % branchStaff.length];
      if (assigned) initialMap[c.serviceId] = assigned.id;
    });
    setPreviewStaffAssignments(initialMap);
    setIsStaffPreviewModalOpen(true);
  };

  // Helper for Tax Treatment label
  const renderTaxTreatmentBadge = (treatment: TaxTreatment, specificRuleId?: string) => {
    if (treatment === 'EXEMPT') {
      return (
        <Badge variant="neutral" className="font-mono text-[10px]">
          Exempt (0%)
        </Badge>
      );
    }
    if (treatment === 'SPECIFIC_RULE') {
      const rule = taxRules.find((r) => r.id === specificRuleId);
      return (
        <Badge variant="warning" className="font-mono text-[10px]">
          {rule ? `${rule.name} (${(rule.rate * 100).toFixed(0)}%)` : 'Specific Rule'}
        </Badge>
      );
    }
    return (
      <Badge variant="primary" className="font-mono text-[10px]">
        Branch Default ({branchTaxPercent}%)
      </Badge>
    );
  };

  return (
    <div className="space-y-6 font-sans">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="primary">Operational Management</Badge>
            <span className="text-slate-400">·</span>
            <span className="text-xs text-slate-500 font-medium">Phase 2B Catalogue</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 mt-1">
            Services & Package Catalogue
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure standalone treatments, bundled package weights, multi-stylist allocation, and tax treatment.
          </p>
        </div>

        {/* Super Admin Branch Switcher */}
        {isSuperAdmin && (
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              Branch Context:
            </span>
            <Select value={selectedBranchId} onValueChange={(val) => setSelectedBranchId(val)}>
              <SelectTrigger className="w-56 h-9 text-xs">
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
      </div>

      {/* FEEDBACK ALERTS */}
      {errorMessage && (
        <Alert variant="destructive" className="animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4" />
          <AlertTitle>Validation Notice</AlertTitle>
          <AlertDescription className="text-xs">{errorMessage}</AlertDescription>
        </Alert>
      )}

      {successMessage && (
        <Alert className="bg-emerald-50 border-emerald-200 text-emerald-800 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <AlertTitle>Operation Confirmed</AlertTitle>
          <AlertDescription className="text-xs">{successMessage}</AlertDescription>
        </Alert>
      )}

      {/* TABS NAVIGATION */}
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <TabsList className="bg-slate-100/80 p-1">
            <TabsTrigger value="SERVICES" className="text-xs gap-2 py-1.5 px-4">
              <Scissors className="w-3.5 h-3.5 text-[#2254E1]" />
              Standalone Services ({services.length})
            </TabsTrigger>
            <TabsTrigger value="PACKAGES" className="text-xs gap-2 py-1.5 px-4">
              <Package className="w-3.5 h-3.5 text-[#2254E1]" />
              Bundled Packages ({packages.length})
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2.5">
            {activeTab === 'SERVICES' ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Layers className="w-3.5 h-3.5" />}
                  onClick={() => setIsCategoryModalOpen(true)}
                >
                  Manage Categories
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<Plus className="w-3.5 h-3.5" />}
                  onClick={() => {
                    setServiceFormData({
                      code: `SRV-${currentBranch?.code.split('-')[0] || 'LHE'}-00${services.length + 1}`,
                      name: '',
                      category: categories[0]?.name || 'Hair Styling & Cuts',
                      durationMinutes: 45,
                      price: 3500,
                      description: '',
                      taxTreatment: 'BRANCH_DEFAULT',
                      specificTaxRuleId: '',
                      isActive: true,
                    });
                    setIsAddServiceModalOpen(true);
                  }}
                >
                  Add Service
                </Button>
              </>
            ) : (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => {
                  setPackageFormData({
                    code: `PKG-${currentBranch?.code.split('-')[0] || 'LHE'}-00${packages.length + 1}`,
                    name: '',
                    description: '',
                    price: 15000,
                    taxTreatment: 'BRANCH_DEFAULT',
                    specificTaxRuleId: '',
                    isActive: true,
                    components: [],
                  });
                  setIsAddPackageModalOpen(true);
                }}
              >
                Add Package
              </Button>
            )}
          </div>
        </div>

        {/* --- TAB 1: STANDALONE SERVICES --- */}
        {activeTab === 'SERVICES' && (
          <div className="space-y-4 mt-4">
            {/* Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-3 rounded-xl border border-slate-200">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                <Input
                  placeholder="Search by code, title, or category..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>

              <Select value={categoryFilter} onValueChange={(val) => setCategoryFilter(val)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL" className="text-xs">All Categories ({categories.length})</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.name} className="text-xs">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val as any)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL" className="text-xs">All Statuses</SelectItem>
                  <SelectItem value="ACTIVE" className="text-xs">Active Treatments Only</SelectItem>
                  <SelectItem value="INACTIVE" className="text-xs">Deactivated Treatments</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Services Table */}
            <Card padding="none" className="overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/75">
                      <TableHead className="w-28 text-xs font-semibold">Code</TableHead>
                      <TableHead className="text-xs font-semibold">Service Details</TableHead>
                      <TableHead className="text-xs font-semibold">Category</TableHead>
                      <TableHead className="text-xs font-semibold">Duration</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Selling Price</TableHead>
                      <TableHead className="text-xs font-semibold">Tax Treatment</TableHead>
                      <TableHead className="text-xs font-semibold">Status</TableHead>
                      <TableHead className="w-12 text-center text-xs font-semibold">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredServices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-12 text-center text-slate-400">
                          <Scissors className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                          <p className="font-medium text-xs text-slate-600">No services match the active filters.</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">Add a new service or adjust your search.</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredServices.map((srv) => (
                        <TableRow key={srv.id} className="hover:bg-slate-50/50 transition-colors">
                          <TableCell className="font-mono text-xs font-semibold text-[#2254E1]">
                            {srv.code}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-xs text-slate-900">{srv.name}</p>
                              {srv.description && (
                                <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                                  {srv.description}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-slate-600 px-2 py-0.5 rounded bg-slate-100">
                              {srv.category}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-slate-600 font-medium">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-400" />
                              {srv.durationMinutes} mins
                            </span>
                          </TableCell>
                          <TableCell className="text-xs font-semibold text-slate-900 text-right tabular-nums">
                            {formatCurrency(srv.price)}
                          </TableCell>
                          <TableCell>
                            {renderTaxTreatmentBadge(srv.taxTreatment, srv.specificTaxRuleId)}
                          </TableCell>
                          <TableCell>
                            {srv.isActive ? (
                              <Badge variant="success" dot>Active</Badge>
                            ) : (
                              <Badge variant="neutral">Inactive</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="p-1 rounded hover:bg-slate-100 text-slate-500 cursor-pointer">
                                  <MoreVertical className="w-4 h-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedService(srv);
                                    setIsViewServiceModalOpen(true);
                                  }}
                                  className="text-xs cursor-pointer gap-2"
                                >
                                  <Eye className="w-3.5 h-3.5 text-slate-500" />
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => openEditServiceModal(srv)}
                                  className="text-xs cursor-pointer gap-2"
                                >
                                  <Edit className="w-3.5 h-3.5 text-[#2254E1]" />
                                  Edit Service
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedService(srv);
                                    setIsServiceStatusAlertOpen(true);
                                  }}
                                  className={`text-xs cursor-pointer gap-2 ${
                                    srv.isActive ? 'text-rose-600' : 'text-emerald-600'
                                  }`}
                                >
                                  {srv.isActive ? (
                                    <>
                                      <PowerOff className="w-3.5 h-3.5" />
                                      Deactivate Service
                                    </>
                                  ) : (
                                    <>
                                      <Power className="w-3.5 h-3.5" />
                                      Activate Service
                                    </>
                                  )}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </div>
        )}

        {/* --- TAB 2: PACKAGES --- */}
        {activeTab === 'PACKAGES' && (
          <div className="space-y-4 mt-4">
            {/* Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white p-3 rounded-xl border border-slate-200">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                <Input
                  placeholder="Search package code, bundle name, or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>

              <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val as any)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL" className="text-xs">All Package Statuses</SelectItem>
                  <SelectItem value="ACTIVE" className="text-xs">Active Bundles Only</SelectItem>
                  <SelectItem value="INACTIVE" className="text-xs">Deactivated Bundles</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Packages Table */}
            <Card padding="none" className="overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/75">
                      <TableHead className="w-28 text-xs font-semibold">Code</TableHead>
                      <TableHead className="text-xs font-semibold">Package Bundle</TableHead>
                      <TableHead className="text-xs font-semibold">Included Services Breakdown</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Package Price</TableHead>
                      <TableHead className="text-xs font-semibold">Tax Treatment</TableHead>
                      <TableHead className="text-xs font-semibold">Status</TableHead>
                      <TableHead className="w-12 text-center text-xs font-semibold">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPackages.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-12 text-center text-slate-400">
                          <Package className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                          <p className="font-medium text-xs text-slate-600">No packages configured for this branch.</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">Create your first bundled package with weighted service allocations.</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPackages.map((pkg) => (
                        <TableRow key={pkg.id} className="hover:bg-slate-50/50 transition-colors">
                          <TableCell className="font-mono text-xs font-semibold text-purple-700">
                            {pkg.code}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-xs text-slate-900">{pkg.name}</p>
                              {pkg.description && (
                                <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                                  {pkg.description}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1 max-w-md">
                              <span className="text-[11px] font-medium text-slate-500">
                                {pkg.components.length} treatments included:
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {pkg.components.map((c, i) => (
                                  <span
                                    key={i}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-[#2254E1] border border-blue-200"
                                  >
                                    {c.quantity}x {c.serviceName} ({c.allocationPercentage}%)
                                  </span>
                                ))}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs font-semibold text-slate-900 text-right tabular-nums">
                            {formatCurrency(pkg.price)}
                          </TableCell>
                          <TableCell>
                            {renderTaxTreatmentBadge(pkg.taxTreatment, pkg.specificTaxRuleId)}
                          </TableCell>
                          <TableCell>
                            {pkg.isActive ? (
                              <Badge variant="success" dot>Active</Badge>
                            ) : (
                              <Badge variant="neutral">Inactive</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="p-1 rounded hover:bg-slate-100 text-slate-500 cursor-pointer">
                                  <MoreVertical className="w-4 h-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedPackage(pkg);
                                    setIsViewPackageModalOpen(true);
                                  }}
                                  className="text-xs cursor-pointer gap-2"
                                >
                                  <Eye className="w-3.5 h-3.5 text-slate-500" />
                                  View Package Details
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => openStaffPreviewModal(pkg)}
                                  className="text-xs cursor-pointer gap-2 text-purple-700"
                                >
                                  <Users className="w-3.5 h-3.5 text-purple-600" />
                                  Multi-Staff Assignment Preview
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => openEditPackageModal(pkg)}
                                  className="text-xs cursor-pointer gap-2"
                                >
                                  <Edit className="w-3.5 h-3.5 text-[#2254E1]" />
                                  Edit Package
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedPackage(pkg);
                                    setIsPackageStatusAlertOpen(true);
                                  }}
                                  className={`text-xs cursor-pointer gap-2 ${
                                    pkg.isActive ? 'text-rose-600' : 'text-emerald-600'
                                  }`}
                                >
                                  {pkg.isActive ? (
                                    <>
                                      <PowerOff className="w-3.5 h-3.5" />
                                      Deactivate Package
                                    </>
                                  ) : (
                                    <>
                                      <Power className="w-3.5 h-3.5" />
                                      Activate Package
                                    </>
                                  )}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </div>
        )}
      </Tabs>

      {/* --- MODAL: ADD / EDIT SERVICE --- */}
      <Dialog
        open={isAddServiceModalOpen || isEditServiceModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddServiceModalOpen(false);
            setIsEditServiceModalOpen(false);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              {isAddServiceModalOpen ? 'Add New Salon Service' : `Edit Service: ${selectedService?.code}`}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Configure treatment pricing, duration, category classification, and tax treatment for {currentBranch?.name}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveService} className="space-y-3.5 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Service Code *</label>
                <Input
                  value={serviceFormData.code}
                  onChange={(e) => setServiceFormData({ ...serviceFormData, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. SRV-LHE-01"
                  required
                  className="font-mono text-xs uppercase"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Category *</label>
                <Select
                  value={serviceFormData.category}
                  onValueChange={(val) => setServiceFormData({ ...serviceFormData, category: val })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.name} className="text-xs">
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Service Name *</label>
              <Input
                value={serviceFormData.name}
                onChange={(e) => setServiceFormData({ ...serviceFormData, name: e.target.value })}
                placeholder="e.g. Signature Balayage & Gloss"
                required
                className="text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Duration (Minutes) *</label>
                <Input
                  type="number"
                  min="5"
                  step="5"
                  value={serviceFormData.durationMinutes}
                  onChange={(e) =>
                    setServiceFormData({ ...serviceFormData, durationMinutes: Math.max(1, Number(e.target.value)) })
                  }
                  required
                  className="text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Selling Price (PKR) *</label>
                <Input
                  type="number"
                  min="0"
                  step="50"
                  value={serviceFormData.price}
                  onChange={(e) =>
                    setServiceFormData({ ...serviceFormData, price: Math.max(0, Number(e.target.value)) })
                  }
                  required
                  className="text-xs font-semibold tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Tax Treatment *</label>
              <Select
                value={serviceFormData.taxTreatment}
                onValueChange={(val) => setServiceFormData({ ...serviceFormData, taxTreatment: val as any })}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select Tax Treatment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BRANCH_DEFAULT" className="text-xs">
                    Branch Default ({branchTaxPercent}%)
                  </SelectItem>
                  <SelectItem value="SPECIFIC_RULE" className="text-xs">
                    Specific Branch Tax Rule
                  </SelectItem>
                  <SelectItem value="EXEMPT" className="text-xs">
                    Tax Exempt (0%)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {serviceFormData.taxTreatment === 'SPECIFIC_RULE' && (
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Select Specific Tax Rule *</label>
                <Select
                  value={serviceFormData.specificTaxRuleId}
                  onValueChange={(val) => setServiceFormData({ ...serviceFormData, specificTaxRuleId: val })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select Tax Rule" />
                  </SelectTrigger>
                  <SelectContent>
                    {taxRules.map((r) => (
                      <SelectItem key={r.id} value={r.id} className="text-xs">
                        {r.name} ({(r.rate * 100).toFixed(1)}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Description (Optional)</label>
              <Input
                value={serviceFormData.description}
                onChange={(e) => setServiceFormData({ ...serviceFormData, description: e.target.value })}
                placeholder="Brief client-facing service overview..."
                className="text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsAddServiceModalOpen(false);
                  setIsEditServiceModalOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm">
                {isAddServiceModalOpen ? 'Create Service' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* --- MODAL: ADD / EDIT PACKAGE --- */}
      <Dialog
        open={isAddPackageModalOpen || isEditPackageModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddPackageModalOpen(false);
            setIsEditPackageModalOpen(false);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              {isAddPackageModalOpen ? 'Create Bundled Service Package' : `Edit Package: ${selectedPackage?.code}`}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Combine standalone services into an independently priced bundle with deterministic net revenue weights for {currentBranch?.name}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSavePackage} className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Package Code *</label>
                <Input
                  value={packageFormData.code}
                  onChange={(e) => setPackageFormData({ ...packageFormData, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. PKG-LHE-01"
                  required
                  className="font-mono text-xs uppercase"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Package Selling Price (PKR) *</label>
                <Input
                  type="number"
                  min="0"
                  step="100"
                  value={packageFormData.price}
                  onChange={(e) =>
                    setPackageFormData({ ...packageFormData, price: Math.max(0, Number(e.target.value)) })
                  }
                  required
                  className="text-xs font-semibold tabular-nums text-slate-900"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Independently priced; not overwritten when component services change.
                </span>
              </div>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Package Bundle Name *</label>
              <Input
                value={packageFormData.name}
                onChange={(e) => setPackageFormData({ ...packageFormData, name: e.target.value })}
                placeholder="e.g. Bridal Glamour & Hair Transformation"
                required
                className="text-xs"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Description (Optional)</label>
              <Input
                value={packageFormData.description}
                onChange={(e) => setPackageFormData({ ...packageFormData, description: e.target.value })}
                placeholder="Includes signature blowdry, master balayage, and restorative keratin..."
                className="text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Package Tax Treatment *</label>
                <Select
                  value={packageFormData.taxTreatment}
                  onValueChange={(val) => setPackageFormData({ ...packageFormData, taxTreatment: val as any })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select Tax Treatment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BRANCH_DEFAULT" className="text-xs">
                      Branch Default ({branchTaxPercent}%)
                    </SelectItem>
                    <SelectItem value="SPECIFIC_RULE" className="text-xs">
                      Specific Branch Tax Rule
                    </SelectItem>
                    <SelectItem value="EXEMPT" className="text-xs">
                      Tax Exempt (0%)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {packageFormData.taxTreatment === 'SPECIFIC_RULE' && (
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Specific Tax Rule *</label>
                  <Select
                    value={packageFormData.specificTaxRuleId}
                    onValueChange={(val) => setPackageFormData({ ...packageFormData, specificTaxRuleId: val })}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Select Rule" />
                    </SelectTrigger>
                    <SelectContent>
                      {taxRules.map((r) => (
                        <SelectItem key={r.id} value={r.id} className="text-xs">
                          {r.name} ({(r.rate * 100).toFixed(1)}%)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* PACKAGE COMPONENTS BUILDER */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-slate-800 text-xs">Included Treatments & Revenue Allocations</h4>
                  <p className="text-[11px] text-slate-500">
                    Weights split the package net selling price for staff commission and reporting.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Badge
                    variant={Math.abs(packageAllocationTotalPct - 100) < 0.001 ? 'success' : 'destructive'}
                    className="font-mono text-xs"
                  >
                    Total Weight: {packageAllocationTotalPct.toFixed(1)}% / 100%
                  </Badge>
                </div>
              </div>

              {/* Add Component Selector */}
              <div className="flex items-center gap-2">
                <Select onValueChange={(val) => handleAddPackageComponent(val)}>
                  <SelectTrigger className="h-8 text-xs bg-white flex-1">
                    <SelectValue placeholder="Add an active treatment from catalogue..." />
                  </SelectTrigger>
                  <SelectContent>
                    {services
                      .filter((s) => s.isActive)
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id} className="text-xs">
                          {s.code} · {s.name} ({formatCurrency(s.price)})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Component Rows Table */}
              {packageFormData.components.length === 0 ? (
                <div className="py-6 text-center text-slate-400 bg-white rounded-lg border border-dashed border-slate-200">
                  <p className="text-xs font-medium text-slate-500">No components added yet.</p>
                  <p className="text-[11px] text-slate-400">Select active treatments from the dropdown above.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {packageFormData.components.map((comp, idx) => {
                    const allocatedPkr = packageAllocationSummary.allocatedComponents[idx]?.allocatedAmount || 0;
                    return (
                      <div
                        key={idx}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-white rounded-lg border border-slate-200"
                      >
                        <div className="flex-1">
                          <p className="font-semibold text-xs text-slate-900 flex items-center gap-1.5">
                            <span className="font-mono text-[10px] text-slate-400">{comp.serviceCode}</span>
                            <span>{comp.serviceName}</span>
                          </p>
                          <span className="text-[10px] text-slate-400">
                            Catalogue reference: {formatCurrency(comp.unitPrice)}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] text-slate-500">Qty:</span>
                            <Input
                              type="number"
                              min="1"
                              value={comp.quantity}
                              onChange={(e) =>
                                handleUpdatePackageComponent(idx, { quantity: Math.max(1, Number(e.target.value)) })
                              }
                              className="w-14 h-7 text-xs text-center"
                            />
                          </div>

                          <div className="flex items-center gap-1">
                            <span className="text-[11px] text-slate-500">Weight:</span>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              value={comp.allocationPercentage}
                              onChange={(e) =>
                                handleUpdatePackageComponent(idx, { allocationPercentage: Number(e.target.value) })
                              }
                              className="w-16 h-7 text-xs text-center font-mono font-semibold"
                            />
                            <span className="text-xs text-slate-400">%</span>
                          </div>

                          <div className="w-24 text-right">
                            <span className="text-[10px] text-slate-400 block">Allocated</span>
                            <span className="font-mono font-semibold text-xs text-[#2254E1]">
                              {formatCurrency(allocatedPkr)}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemovePackageComponent(idx)}
                            className="p-1 rounded text-rose-500 hover:bg-rose-50 cursor-pointer"
                            title="Remove component"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Reconciled Rounding Remainder Distribution Notice */}
                  <div className="p-2 bg-blue-50/70 border border-blue-200/80 rounded flex items-center justify-between text-[11px] text-[#2254E1]">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#2254E1]" />
                      Deterministic Remainder Reconciled:
                    </span>
                    <span className="font-mono font-semibold">
                      Total Allocated: {formatCurrency(packageAllocationSummary.totalAllocated)} (
                      {formatCurrency(packageFormData.price)} Target)
                    </span>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsAddPackageModalOpen(false);
                  setIsEditPackageModalOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={Math.abs(packageAllocationTotalPct - 100) > 0.001 || packageFormData.components.length === 0}
              >
                {isAddPackageModalOpen ? 'Create Package' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* --- MODAL: MULTI-STAFF ASSIGNMENT PREVIEW (NON-POSTING) --- */}
      <Dialog open={isStaffPreviewModalOpen} onOpenChange={setIsStaffPreviewModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-purple-600" />
              Multi-Staff Assignment Preview: {previewPackage?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Interactive demonstration of how package component treatments can be performed by different stylists at checkout with exact revenue allocation.
            </DialogDescription>
          </DialogHeader>

          {previewPackage && (
            <div className="space-y-4 text-xs">
              <div className="p-3 bg-purple-50/60 border border-purple-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-purple-700 font-semibold uppercase tracking-wider block">
                    Total Package Selling Price
                  </span>
                  <span className="text-lg font-semibold text-slate-900 tabular-nums">
                    {formatCurrency(previewPackage.price)}
                  </span>
                </div>
                <Badge variant="primary">Non-Posting Simulation</Badge>
              </div>

              <div className="space-y-2.5">
                <span className="font-semibold text-slate-700 block">Assigned Stylists per Component:</span>
                {previewPackage.components.map((comp, idx) => {
                  const allocatedShare = roundCurrency(previewPackage.price * (comp.allocationPercentage / 100));
                  const assignedStaffId = previewStaffAssignments[comp.serviceId] || branchStaff[0]?.id;
                  const assignedStaffMember = branchStaff.find((s) => s.id === assignedStaffId);
                  const estimatedCommission = assignedStaffMember
                    ? roundCurrency(allocatedShare * assignedStaffMember.commissionRate)
                    : 0;

                  return (
                    <div
                      key={idx}
                      className="p-3 rounded-lg border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <p className="font-semibold text-slate-900 text-xs flex items-center gap-1.5">
                          <span>{comp.serviceName}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                            {comp.allocationPercentage}% Weight
                          </span>
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Net revenue share: <strong className="text-slate-900">{formatCurrency(allocatedShare)}</strong>
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Select
                          value={assignedStaffId}
                          onValueChange={(val) =>
                            setPreviewStaffAssignments({ ...previewStaffAssignments, [comp.serviceId]: val })
                          }
                        >
                          <SelectTrigger className="w-48 h-8 text-xs">
                            <SelectValue placeholder="Assign Stylist" />
                          </SelectTrigger>
                          <SelectContent>
                            {branchStaff.map((s) => (
                              <SelectItem key={s.id} value={s.id} className="text-xs">
                                {s.name} ({(s.commissionRate * 100).toFixed(0)}% Comm)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <div className="w-20 text-right">
                          <span className="text-[10px] text-slate-400 block">Commission</span>
                          <span className="font-mono text-xs font-semibold text-emerald-700">
                            +{formatCurrency(estimatedCommission)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-500 leading-relaxed">
                <strong>Business Rule:</strong> Each stylist earns commission strictly based on their individual contract tier applied against their attributed share of the package's net selling price.
              </div>

              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setIsStaffPreviewModalOpen(false)}>
                  Close Preview
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* --- MODAL: MANAGE CATEGORIES --- */}
      <Dialog open={isCategoryModalOpen} onOpenChange={setIsCategoryModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Branch Service Categories</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Manage custom service categories for {currentBranch?.name}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateCategory} className="space-y-4 text-xs">
            {categoryError && (
              <Alert variant="destructive">
                <AlertCircle className="w-4 h-4" />
                <AlertDescription className="text-xs">{categoryError}</AlertDescription>
              </Alert>
            )}

            <div className="flex items-center gap-2">
              <Input
                placeholder="New category name (e.g. Laser Esthetics)..."
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="h-9 text-xs"
                required
              />
              <Button type="submit" variant="primary" size="sm">
                Add
              </Button>
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto pt-2">
              <span className="font-semibold text-slate-700 block text-[11px] uppercase tracking-wider">
                Active Branch Categories ({categories.length})
              </span>
              {categories.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200"
                >
                  <span className="text-xs font-medium text-slate-800">{c.name}</span>
                  <Badge variant="success">Active</Badge>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setIsCategoryModalOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* --- ALERT: TOGGLE SERVICE STATUS --- */}
      <AlertDialog open={isServiceStatusAlertOpen} onOpenChange={setIsServiceStatusAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">
              {selectedService?.isActive ? 'Deactivate Service?' : 'Activate Service?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-500 leading-relaxed">
              {selectedService?.isActive
                ? `Deactivating '${selectedService?.name}' will prevent it from being selected in new appointments or sales. Historical records and transactions will be strictly preserved.`
                : `Activating '${selectedService?.name}' will immediately make it selectable for new appointments and billing.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleServiceStatus}
              className={`text-xs ${
                selectedService?.isActive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {selectedService?.isActive ? 'Deactivate' : 'Activate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* --- ALERT: TOGGLE PACKAGE STATUS --- */}
      <AlertDialog open={isPackageStatusAlertOpen} onOpenChange={setIsPackageStatusAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">
              {selectedPackage?.isActive ? 'Deactivate Package Bundle?' : 'Activate Package Bundle?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-500 leading-relaxed">
              {selectedPackage?.isActive
                ? `Deactivating '${selectedPackage?.name}' will hide it from active POS sales. Past sales and commissions remain intact.`
                : `Activating '${selectedPackage?.name}' will enable checkout with the configured revenue allocations.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleTogglePackageStatus}
              className={`text-xs ${
                selectedPackage?.isActive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {selectedPackage?.isActive ? 'Deactivate' : 'Activate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
