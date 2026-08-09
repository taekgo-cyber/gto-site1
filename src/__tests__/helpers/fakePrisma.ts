/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

function matches(where: any, row: Row): boolean {
  if (!where) return true;

  for (const [field, cond] of Object.entries(where)) {
    if (field === "AND") {
      if (!(cond as any[]).every((part) => matches(part, row))) return false;
      continue;
    }
    if (field === "OR") {
      if (!(cond as any[]).some((part) => matches(part, row))) return false;
      continue;
    }
    if (field === "NOT") {
      if (matches(cond, row)) return false;
      continue;
    }

    const value = row[field];

    if (cond === null || cond === undefined) {
      if (value !== null && value !== undefined) return false;
      continue;
    }

    if (typeof cond === "object" && !(cond instanceof Date)) {
      for (const [op, operand] of Object.entries(cond)) {
        if (op === "equals") {
          if (!Object.is(value, operand)) return false;
        } else if (op === "not") {
          if (operand === null) {
            if (value === null) return false;
          } else if (Object.is(value, operand)) {
            return false;
          }
        } else if (op === "in") {
          if (value === null || !(operand as unknown[]).includes(value)) return false;
        } else if (op === "contains") {
          if (!String(value ?? "").toLowerCase().includes(String(operand).toLowerCase())) {
            return false;
          }
        } else if (op === "lte") {
          if (!(value !== null && value !== undefined && value <= operand)) return false;
        } else if (op === "lt") {
          if (!(value !== null && value !== undefined && value < operand)) return false;
        } else if (op === "gte") {
          if (!(value !== null && value !== undefined && value >= operand)) return false;
        } else if (op === "gt") {
          if (!(value !== null && value !== undefined && value > operand)) return false;
        }
      }
      continue;
    }

    if (!Object.is(value, cond)) return false;
  }

  return true;
}

function sortRows(rows: Row[], orderBy: any): Row[] {
  if (!orderBy) return rows;

  if (orderBy.publishedAt === "desc") {
    return [...rows].sort((a, b) => {
      const av = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const bv = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return bv - av;
    });
  }
  if (orderBy.sortOrder === "asc") {
    return [...rows].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  return rows;
}

export type FakeDb = ReturnType<typeof createFakeDb>;

export function createFakeDb() {
  const leasePosts: Row[] = [];
  const attachments: Row[] = [];
  const regions = new Map<string, Row>();
  const vehicleTypes = new Map<string, Row>();
  const tonnages = new Map<string, Row>();
  const users = new Map<string, Row>();

  function refreshPostAttachments(): void {
    for (const post of leasePosts) {
      post.attachments = attachments.filter(
        (attachment) => attachment.postId === post.id && attachment.deletedAt === null,
      );
    }
  }

  const leasePost = {
    async findUnique(args: any) {
      return leasePosts.find((row) => row.id === args?.where?.id) ?? null;
    },
    async findFirst(args: any) {
      const rows = leasePosts.filter((row) => matches(args?.where, row));
      return rows[0] ?? null;
    },
    async findMany(args: any) {
      let rows = leasePosts.filter((row) => matches(args?.where, row));
      rows = sortRows(rows, args?.orderBy);
      const skip = args?.skip ?? 0;
      const take = args?.take;
      return take !== undefined ? rows.slice(skip, skip + take) : rows.slice(skip);
    },
    async count(args: any) {
      return leasePosts.filter((row) => matches(args?.where, row)).length;
    },
    async create(args: any) {
      const data = args.data;
      const id = data.id ?? `leasepost_${leasePosts.length + 1}`;
      const row: Row = {
        id,
        type: data.type,
        title: data.title,
        content: data.content,
        status: data.status ?? "DRAFT",
        viewCount: data.viewCount ?? 0,
        authorId: data.authorId,
        companyId: data.companyId ?? null,
        regionId: data.regionId ?? null,
        vehicleTypeId: data.vehicleTypeId ?? null,
        tonnageId: data.tonnageId ?? null,
        payType: data.payType ?? null,
        payAmount: data.payAmount ?? null,
        workType: data.workType ?? null,
        conditions: data.conditions ?? null,
        publishedAt: data.publishedAt ?? null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        author:
          users.get(data.authorId) ?? { id: data.authorId, name: "tester", nickname: null },
        region: data.regionId ? regions.get(data.regionId) ?? { name: "지역" } : null,
        vehicleType: data.vehicleTypeId
          ? vehicleTypes.get(data.vehicleTypeId) ?? { name: "차종" }
          : null,
        tonnage: data.tonnageId ? tonnages.get(data.tonnageId) ?? { name: "톤수" } : null,
        attachments: [],
      };
      leasePosts.push(row);
      return row;
    },
    async update(args: any) {
      const row = leasePosts.find((candidate) => candidate.id === args?.where?.id);
      if (!row) throw new Error("not found");
      const patch = { ...args.data };
      if (
        patch.viewCount &&
        typeof patch.viewCount === "object" &&
        "increment" in patch.viewCount
      ) {
        row.viewCount = (row.viewCount ?? 0) + patch.viewCount.increment;
        delete patch.viewCount;
      }
      Object.assign(row, patch);
      row.updatedAt = new Date();
      return row;
    },
    async updateMany(args: any) {
      let count = 0;
      for (const row of leasePosts) {
        if (matches(args?.where, row)) {
          Object.assign(row, args.data);
          count += 1;
        }
      }
      return { count };
    },
  };

  const leasePostAttachment = {
    async findUnique(args: any) {
      return attachments.find((row) => row.id === args?.where?.id) ?? null;
    },
    async findFirst(args: any) {
      const rows = attachments.filter((row) => matches(args?.where, row));
      const sorted = sortRows(rows, args?.orderBy);
      return sorted[0] ?? null;
    },
    async findMany(args: any) {
      let rows = attachments.filter((row) => matches(args?.where, row));
      rows = sortRows(rows, args?.orderBy);
      return rows;
    },
    async count(args: any) {
      return attachments.filter((row) => matches(args?.where, row)).length;
    },
    async create(args: any) {
      const data = args.data;
      const row: Row = {
        id: data.id ?? `attachment_${attachments.length + 1}`,
        postId: data.postId,
        storageKey: data.storageKey,
        originalName: data.originalName,
        mimeType: data.mimeType,
        fileSize: data.fileSize,
        mediaType: data.mediaType,
        sortOrder: data.sortOrder ?? 0,
        isRepresentative: data.isRepresentative ?? false,
        deletedAt: data.deletedAt ?? null,
        createdAt: new Date(),
      };
      attachments.push(row);
      refreshPostAttachments();
      return row;
    },
    async createMany(args: any) {
      for (const item of args.data) {
        await leasePostAttachment.create({ data: item });
      }
      refreshPostAttachments();
      return { count: args.data.length };
    },
    async update(args: any) {
      const row = attachments.find((candidate) => candidate.id === args?.where?.id);
      if (!row) throw new Error("not found");
      Object.assign(row, args.data);
      refreshPostAttachments();
      return row;
    },
    async updateMany(args: any) {
      let count = 0;
      for (const row of attachments) {
        if (matches(args?.where, row)) {
          Object.assign(row, args.data);
          count += 1;
        }
      }
      refreshPostAttachments();
      return { count };
    },
    async delete(args: any) {
      const index = attachments.findIndex((row) => row.id === args?.where?.id);
      if (index === -1) throw new Error("not found");
      const [removed] = attachments.splice(index, 1);
      refreshPostAttachments();
      return removed;
    },
  };

  const makeFindUnique = (store: Map<string, Row>) =>
    async (args: any) => store.get(args?.where?.id) ?? null;

  const region = { findUnique: makeFindUnique(regions) };
  const vehicleType = { findUnique: makeFindUnique(vehicleTypes) };
  const tonnage = { findUnique: makeFindUnique(tonnages) };
  const user = { findUnique: makeFindUnique(users) };

  return {
    prisma: {
      leasePost,
      leasePostAttachment,
      region,
      vehicleType,
      tonnage,
      user,
    },
    seed: {
      addUser(userRow: Row) {
        users.set(userRow.id, userRow);
        return userRow;
      },
      addRegion(regionRow: Row) {
        regions.set(regionRow.id, regionRow);
        return regionRow;
      },
      addVehicleType(row: Row) {
        vehicleTypes.set(row.id, row);
        return row;
      },
      addTonnage(row: Row) {
        tonnages.set(row.id, row);
        return row;
      },
      addPost(row: Row) {
        leasePosts.push(row);
        return row;
      },
      addAttachment(row: Row) {
        attachments.push(row);
        refreshPostAttachments();
        return row;
      },
    },
    store: { leasePosts, attachments },
  };
}
