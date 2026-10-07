// src/modules/branches/branches.service.js
// Branch CRUD, admin assignment and safe deactivation.

import prisma from '../../config/prisma.js';
import { auditLog } from '../../lib/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/AppError.js';
import { toDec } from '../../lib/money.js';
import { toBranchDTO } from './branches.mapper.js';

const adminNameMap = async (tx, branches) => {
  const ids = [...new Set(branches.map((b) => b.assignedAdminId).filter(Boolean))];
  if (!ids.length) return new Map();
  const users = await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
};

export const toDTOs = async (branches, tx = prisma) => {
  const names = await adminNameMap(tx, branches);
  return branches.map((b) => toBranchDTO(b, names));
};

const getOrThrow = async (tx, id) => {
  const branch = await tx.branch.findUnique({ where: { id } });
  if (!branch) throw notFound('BRANCH_NOT_FOUND', `Branch '${id}' not found.`);
  return branch;
};

const assertCodeFree = async (tx, code, exceptId) => {
  const clash = await tx.branch.findFirst({ where: { code, ...(exceptId ? { NOT: { id: exceptId } } : {}) } });
  if (clash) throw conflict('BRANCH_CODE_TAKEN', `Branch code '${code}' is already registered to another branch.`);
};

// Branch metadata (names, codes, tax config) is needed by every portal for headers,
// receipts and selectors, so all authenticated users can list branches (same as the mock).
export const listBranches = async () => {
  const branches = await prisma.branch.findMany({ orderBy: [{ createdAt: 'asc' }, { code: 'asc' }] });
  return toDTOs(branches);
};

export const getBranch = async (id) => {
  const branch = await prisma.branch.findUnique({ where: { id } });
  if (!branch) return null;
  return (await toDTOs([branch]))[0];
};

export const createBranch = async (input, actor) => {
  return prisma.$transaction(async (tx) => {
    await assertCodeFree(tx, input.code);

    // New branches start with ZERO opening float and tax disabled until explicitly configured.
    const branch = await tx.branch.create({
      data: {
        name:     input.name,
        code:     input.code,
        address:  input.address || 'Address Pending',
        city:     input.city || 'Lahore',
        phone:    input.phone || '+92 (42) 0000-000',
        email:    input.email || null,
        timezone: input.timezone || 'Asia/Karachi',
        currency: input.currency || 'PKR',
        taxRegistrationNumber: input.taxRegistrationNumber || null,
        taxAuthority:          input.taxAuthority || null,
        taxEnabled:       false,
        taxRate:          0,
        openingCashFloat: 0,
      },
    });

    await auditLog(tx, {
      userId: actor.id, userName: actor.name, action: 'BRANCH_CREATED', entity: 'Branch',
      entityId: branch.id, branchId: branch.id, after: branch,
    });
    return (await toDTOs([branch], tx))[0];
  });
};

export const updateBranch = async (id, input, actor) => {
  if (input.isActive === false) {
    // Deactivation must go through the blocker check.
    await deactivateBranch(id, actor);
  }

  return prisma.$transaction(async (tx) => {
    const existing = await getOrThrow(tx, id);
    if (input.code) await assertCodeFree(tx, input.code, id);

    const data = {};
    for (const f of ['name', 'code', 'address', 'city', 'phone', 'timezone']) {
      if (input[f]) data[f] = input[f];
    }
    if (input.email !== undefined) data.email = input.email || null;
    if (input.taxRegistrationNumber !== undefined) data.taxRegistrationNumber = input.taxRegistrationNumber || null;
    if (input.taxAuthority !== undefined) data.taxAuthority = input.taxAuthority || null;
    if (input.isActive === true) data.isActive = true;

    const branch = await tx.branch.update({ where: { id }, data });
    await auditLog(tx, {
      userId: actor.id, userName: actor.name,
      action: input.isActive === true && !existing.isActive ? 'BRANCH_REACTIVATED' : 'BRANCH_UPDATED',
      entity: 'Branch', entityId: id, branchId: id, before: existing, after: branch,
    });
    return (await toDTOs([branch], tx))[0];
  });
};

export const assignBranchAdmin = async (branchId, adminUserId, actor) => {
  return prisma.$transaction(async (tx) => {
    const branch = await getOrThrow(tx, branchId);
    const user = await tx.user.findUnique({ where: { id: adminUserId } });
    if (!user) throw notFound('USER_NOT_FOUND', `Admin user '${adminUserId}' not found.`);
    if (user.role !== 'ADMIN') throw badRequest('NOT_ADMIN', `User '${user.name}' does not have the ADMIN role.`);
    if (!user.isActive) throw badRequest('USER_INACTIVE', `Cannot assign inactive administrator '${user.name}' to a branch.`);

    // Clear any other branch that previously had this admin assigned.
    await tx.branch.updateMany({
      where: { assignedAdminId: user.id, NOT: { id: branchId } },
      data:  { assignedAdminId: null },
    });
    await tx.user.update({ where: { id: user.id }, data: { branchId } });
    const updated = await tx.branch.update({ where: { id: branchId }, data: { assignedAdminId: user.id } });

    await auditLog(tx, {
      userId: actor.id, userName: actor.name, action: 'BRANCH_ADMIN_ASSIGNED', entity: 'Branch',
      entityId: branchId, branchId, before: { assignedAdminId: branch.assignedAdminId }, after: { assignedAdminId: user.id },
    });
    return (await toDTOs([updated], tx))[0];
  });
};

/** Everything that must be closed/moved before a branch can be deactivated. */
export const checkDeactivationBlockers = async (id, tx = prisma) => {
  await getOrThrow(tx, id);
  const blockers = [];

  const activeUsers = await tx.user.findMany({ where: { branchId: id, isActive: true }, select: { name: true } });
  if (activeUsers.length) {
    blockers.push(
      `Branch has ${activeUsers.length} active login account(s) (${activeUsers.map((u) => u.name).join(', ')}). Deactivate or reassign them first.`
    );
  }

  const activeStaff = await tx.staff.count({ where: { branchId: id, isActive: true } });
  if (activeStaff) blockers.push(`Branch has ${activeStaff} active staff member(s). Deactivate or transfer them first.`);

  // Cash drawers (not the vault) still holding cash: expected cash = Σ IN − Σ OUT.
  const openDrawers = await tx.cashDrawer.findMany({
    where: { branchId: id, kind: 'DRAWER', status: { not: 'SETTLED' } }, select: { id: true },
  });
  if (openDrawers.length) {
    const sums = await tx.drawerMovement.groupBy({
      by: ['direction'],
      where: { drawerId: { in: openDrawers.map((d) => d.id) } },
      _sum: { amount: true },
    });
    const inSum = sums.find((s) => s.direction === 'IN')?._sum.amount ?? 0;
    const outSum = sums.find((s) => s.direction === 'OUT')?._sum.amount ?? 0;
    const total = toDec(inSum).minus(toDec(outSum));
    if (total.greaterThan(0)) {
      blockers.push(
        `Branch holds PKR ${total.toNumber().toLocaleString('en-PK')} in active cash drawers. Perform shift close & custody transfer first.`
      );
    }
  }

  const pendingSettlements = await tx.settlement.count({ where: { branchId: id, status: 'SUBMITTED' } });
  if (pendingSettlements) blockers.push(`Branch has ${pendingSettlements} cash settlement(s) awaiting verification.`);

  return { canDeactivate: blockers.length === 0, blockers };
};

export const deactivateBranch = async (id, actor) => {
  if (actor.role !== 'SUPER_ADMIN') {
    throw forbidden('FORBIDDEN', 'Access Denied: Only Super Administrators can deactivate salon branches.');
  }
  return prisma.$transaction(async (tx) => {
    const { canDeactivate, blockers } = await checkDeactivationBlockers(id, tx);
    if (!canDeactivate) {
      throw conflict('BRANCH_HAS_BLOCKERS', `Cannot deactivate branch due to active dependencies:\n• ${blockers.join('\n• ')}`, blockers);
    }
    const branch = await tx.branch.update({ where: { id }, data: { isActive: false } });
    await auditLog(tx, {
      userId: actor.id, userName: actor.name, action: 'BRANCH_DEACTIVATED', entity: 'Branch', entityId: id, branchId: id,
    });
    return { success: true, message: `Branch '${branch.name}' has been deactivated.` };
  });
};
