import { resolveActiveCompanyActor, canDiscoverLead } from "./authorization";
import {
  countDiscoverableLeads,
  findDiscoverableLeadById,
  findDiscoverableLeads,
  type LeadDiscoveryFilters,
} from "./dal";
import { toPreUnlockDto } from "./dto";

export type LeadDiscoveryPage = {
  items: ReturnType<typeof toPreUnlockDto>[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

async function assertDiscoveryAccess(actorUserId: string, companyId: string) {
  const result = await resolveActiveCompanyActor(actorUserId, companyId);
  if (!result.ok) throw new Error(result.message);
  if (!canDiscoverLead(result.actor)) throw new Error("Forbidden: lead discovery is not allowed");
  return result.actor;
}

function clampPageInt(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return fallback;
  return Math.min(10_000, n);
}

export async function discoverCandidateLeads(input: {
  actorUserId: string;
  companyId: string;
  page?: number;
  pageSize?: number;
  filters?: LeadDiscoveryFilters;
}): Promise<LeadDiscoveryPage> {
  await assertDiscoveryAccess(input.actorUserId, input.companyId);
  const page = clampPageInt(input.page, 1);
  const pageSize = Math.min(50, clampPageInt(input.pageSize, 20));
  const filters = input.filters ?? {};
  const [rows, totalCount] = await Promise.all([
    findDiscoverableLeads({ ...filters, take: pageSize, skip: (page - 1) * pageSize }),
    countDiscoverableLeads(filters),
  ]);
  return {
    items: rows.map((lead) => toPreUnlockDto(lead as never)),
    page,
    pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

export async function getDiscoverableLeadDetail(input: {
  actorUserId: string;
  companyId: string;
  leadId: string;
}) {
  await assertDiscoveryAccess(input.actorUserId, input.companyId);
  const lead = await findDiscoverableLeadById(input.leadId);
  if (!lead) throw new Error("Discoverable lead not found");
  return toPreUnlockDto(lead as never);
}
