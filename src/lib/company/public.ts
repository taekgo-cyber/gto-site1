import { prisma } from "@/lib/prisma";

const PUBLIC_COMPANY_PAGE_SIZE = 24;

export async function listPublicCompanies(input: { query?: string; page?: number } = {}) {
  const query = input.query?.normalize("NFKC").trim().slice(0, 100) ?? "";
  const page = Number.isInteger(input.page) && (input.page ?? 0) > 0 ? Math.min(input.page ?? 1, 10_000) : 1;
  const where = {
    status: "ACTIVE" as const,
    deletedAt: null,
    ...(query ? { name: { contains: query, mode: "insensitive" as const } } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.company.count({ where }),
    prisma.company.findMany({
      where,
      select: {
        id: true,
        name: true,
        introduction: true,
        createdAt: true,
        region: { select: { name: true } },
        _count: {
          select: {
            jobPosts: { where: { status: "OPEN", deletedAt: null, publishedAt: { not: null } } },
            leasePosts: { where: { status: "PUBLISHED", deletedAt: null, publishedAt: { not: null } } },
          },
        },
      },
      orderBy: [{ createdAt: "asc" }, { name: "asc" }],
      skip: (page - 1) * PUBLIC_COMPANY_PAGE_SIZE,
      take: PUBLIC_COMPANY_PAGE_SIZE,
    }),
  ]);
  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / PUBLIC_COMPANY_PAGE_SIZE)) };
}

export async function getPublicCompany(companyId: string) {
  if (!/^[a-z0-9_-]{10,40}$/i.test(companyId)) return null;
  return prisma.company.findFirst({
    where: { id: companyId, status: "ACTIVE", deletedAt: null },
    select: {
      id: true,
      name: true,
      introduction: true,
      createdAt: true,
      updatedAt: true,
      region: { select: { name: true } },
      jobPosts: {
        where: { status: "OPEN", deletedAt: null, publishedAt: { not: null } },
        select: {
          id: true,
          title: true,
          type: true,
          payType: true,
          payAmount: true,
          workType: true,
          publishedAt: true,
          originRegion: { select: { name: true } },
          destRegion: { select: { name: true } },
          vehicleType: { select: { name: true } },
          tonnage: { select: { name: true } },
        },
        orderBy: { publishedAt: "desc" },
        take: 12,
      },
      leasePosts: {
        where: { status: "PUBLISHED", deletedAt: null, publishedAt: { not: null } },
        select: {
          id: true,
          title: true,
          type: true,
          payType: true,
          payAmount: true,
          workType: true,
          publishedAt: true,
          region: { select: { name: true } },
          vehicleType: { select: { name: true } },
          tonnage: { select: { name: true } },
        },
        orderBy: { publishedAt: "desc" },
        take: 12,
      },
    },
  });
}
