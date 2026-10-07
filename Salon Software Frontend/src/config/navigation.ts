import { Role } from '../types/auth';

export interface NavItem {
  id: string;
  label: string;
  href: string;
  iconName: string;
  allowedRoles: Role[];
  badge?: string;
  description?: string;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
  allowedRoles: Role[];
}

export const NAVIGATION_GROUPS: NavGroup[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'],
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        href: '/dashboard',
        iconName: 'LayoutDashboard',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'],
      },
      {
        id: 'pos',
        label: 'Point of Sale (POS)',
        href: '/pos',
        iconName: 'Receipt',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'],
        description: 'Instant billing, payments & outstanding receivables collection',
      },
    ],
  },
  {
    id: 'staff-personal',
    label: 'My Workspace',
    allowedRoles: ['STAFF'],
    items: [
      {
        id: 'my-performance',
        label: 'My Performance',
        href: '/my-performance',
        iconName: 'TrendingUp',
        allowedRoles: ['STAFF'],
        description: 'Personal services, commissions, client rebookings & tips',
      },
      {
        id: 'my-attendance',
        label: 'My Attendance',
        href: '/my-attendance',
        iconName: 'Clock',
        allowedRoles: ['STAFF'],
        description: 'Punches, shifts, approved overtime & monthly hours',
      },
      {
        id: 'my-reports',
        label: 'My Reports',
        href: '/my-reports',
        iconName: 'FileText',
        allowedRoles: ['STAFF'],
        description: 'Personal payout breakdown and service performance archive',
      },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
    items: [
      {
        id: 'appointments',
        label: 'Appointments',
        href: '/operations/appointments',
        iconName: 'Calendar',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
        description: 'Multi-chair calendar scheduling & status flow',
      },
      {
        id: 'staff',
        label: 'Staff Directory',
        href: '/operations/staff',
        iconName: 'Users',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
        description: 'Stylists, technicians, commissions & contracts',
      },
      {
        id: 'attendance',
        label: 'Attendance & Punches',
        href: '/operations/attendance',
        iconName: 'ClockAlert',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
        description: 'Biometric & manual check-in verification',
      },
      {
        id: 'manual-overtime',
        label: 'Manual Overtime',
        href: '/operations/manual-overtime',
        iconName: 'Timer',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
        description: 'Admin-only overtime minutes entry and approval',
      },
      {
        id: 'services-packages',
        label: 'Services & Packages',
        href: '/operations/services-packages',
        iconName: 'Scissors',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
        description: 'Service catalogue, bundled packages & multi-staff assignments',
      },
      {
        id: 'inventory-suppliers',
        label: 'Inventory & Suppliers',
        href: '/operations/inventory-suppliers',
        iconName: 'Package',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
        description: 'Stock consumption, retail products & supplier purchase orders',
      },
      {
        id: 'clients',
        label: 'Clients & CRM',
        href: '/operations/clients',
        iconName: 'UserCheck',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
        description: 'Client profiles, histories, memberships & loyalty points',
      },
    ],
  },
  {
    id: 'accounts',
    label: 'Accounts & Finance',
    allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'],
    items: [
      {
        id: 'expenses',
        label: 'Expense Management',
        href: '/accounts/expenses',
        iconName: 'CreditCard',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'],
        description: 'Cash drawer disbursements & bank expense vouchers',
      },
      {
        id: 'payroll',
        label: 'Payroll Generation',
        href: '/accounts/payroll',
        iconName: 'BadgeDollarSign',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'], // Accountant excluded
        description: 'Base pay calculation with verified attendance & manual overtime',
      },
      {
        id: 'commission',
        label: 'Staff Commission',
        href: '/accounts/commission',
        iconName: 'PieChart',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'], // Accountant excluded
        description: 'Tiered service commission separate from gratuity',
      },
      {
        id: 'tips-management',
        label: 'Tips Management',
        href: '/accounts/tips-management',
        iconName: 'Coins',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'], // Accountant cannot allocate/pay tips
        description: '100% staff gratuity custody, allocation & payouts',
      },
      {
        id: 'ledger',
        label: 'General Ledger',
        href: '/accounts/ledger',
        iconName: 'BookOpen',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
        description: 'Double-entry audit entries across all payment methods',
      },
      {
        id: 'my-balance-sheet',
        label: 'My Balance Sheet',
        href: '/accounts/my-balance-sheet',
        iconName: 'Scale',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'],
        description: 'Individual financial custody, drawer balance & disbursements',
      },
      {
        id: 'account-settlement',
        label: 'Account Settlement',
        href: '/accounts/account-settlement',
        iconName: 'ArrowRightLeft',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'],
        description: 'Cash custody transfer between Accountant and Admin Safe',
      },
    ],
  },
  {
    id: 'reporting',
    label: 'Reporting & Analytics',
    allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'],
    items: [
      {
        id: 'rep-income-expense',
        label: 'Income & Expense',
        href: '/reports/income-expense',
        iconName: 'BarChart3',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'],
      },
      {
        id: 'rep-sales-invoices',
        label: 'Sales & Invoices',
        href: '/reports/sales-invoices',
        iconName: 'FileSpreadsheet',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'],
      },
      {
        id: 'rep-unpaid-invoices',
        label: 'Unpaid Invoices',
        href: '/reports/unpaid-invoices',
        iconName: 'AlertCircle',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'],
      },
      {
        id: 'rep-payment-accounts',
        label: 'Payment Accounts',
        href: '/reports/payment-accounts',
        iconName: 'Landmark',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'],
      },
      {
        id: 'rep-cash-drawer',
        label: 'Cash Drawer Log',
        href: '/reports/cash-drawer',
        iconName: 'Wallet',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'],
      },
      {
        id: 'rep-detailed-expenses',
        label: 'Detailed Expenses',
        href: '/reports/detailed-expenses',
        iconName: 'ListOrdered',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'],
      },
      {
        id: 'rep-staff-salary',
        label: 'Staff Salary Report',
        href: '/reports/staff-salary',
        iconName: 'Banknote',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'], // Accountant excluded
      },
      {
        id: 'rep-staff-commission',
        label: 'Staff Commission Report',
        href: '/reports/staff-commission',
        iconName: 'Percent',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'], // Accountant excluded
      },
      {
        id: 'rep-staff-performance',
        label: 'Staff Performance',
        href: '/reports/staff-performance',
        iconName: 'TrendingUp',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'], // Accountant excluded
      },
      {
        id: 'rep-tips-statement',
        label: 'Tips Statement',
        href: '/reports/tips-statement',
        iconName: 'Sparkles',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'], // Accountant excluded
      },
      {
        id: 'rep-appointments',
        label: 'Appointment Report',
        href: '/reports/appointments',
        iconName: 'CalendarRange',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'], // Accountant excluded
        description: 'Scheduled reservation velocity, quoted values and POS conversions',
      },
      {
        id: 'rep-inventory-movement',
        label: 'Inventory Movement',
        href: '/reports/inventory-movement',
        iconName: 'Boxes',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
      },
      {
        id: 'rep-attendance',
        label: 'Attendance Report',
        href: '/reports/attendance',
        iconName: 'CalendarCheck',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'], // Accountant excluded
      },
      {
        id: 'rep-overtime',
        label: 'Overtime Audit',
        href: '/reports/overtime',
        iconName: 'Clock3',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'], // Accountant excluded
      },
      {
        id: 'rep-operating-profit',
        label: 'Operating Profit',
        href: '/reports/operating-profit',
        iconName: 'TrendingUp',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'],
      },
      {
        id: 'rep-settlement-history',
        label: 'Settlement History',
        href: '/reports/settlement-history',
        iconName: 'History',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'],
      },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
    items: [
      {
        id: 'branches',
        label: 'Branches Management',
        href: '/admin/branches',
        iconName: 'Building2',
        allowedRoles: ['SUPER_ADMIN'], // Only Super Admin
        description: 'Multi-branch creation, locations, opening floats & tax configs',
      },
      {
        id: 'users-access',
        label: 'Users & Access Control',
        href: '/admin/users',
        iconName: 'ShieldCheck',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
        description: 'Manage administrator roles, branch assignments and credentials',
      },
      {
        id: 'branch-settings',
        label: 'Branch Settings',
        href: '/admin/branch-settings',
        iconName: 'Sliders',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
        description: 'Branch profile, hours, default tax rules and payment accounts',
      },
      {
        id: 'data-reset',
        label: 'Reset Data (Testing)',
        href: '/admin/data-reset',
        iconName: 'RotateCcw',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
        badge: 'Testing',
        description: 'Wipe operational test records and reset registers to zero for fresh testing',
      },
      {
        id: 'activity-log',
        label: 'Audit & Activity Log',
        href: '/admin/activity-log',
        iconName: 'ShieldAlert',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
        description: 'Immutable record of financial changes, logins and approvals',
      },
    ],
  },
];
