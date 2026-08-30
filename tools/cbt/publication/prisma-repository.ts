import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import type {
  PublicationCreateInput,
  PublicationDatabase,
  PublicationRepository,
  PublicationTarget,
} from "./types";

type PrismaPublicationClient = PrismaClient | Prisma.TransactionClient;

function asTarget(row: {
  id: string;
  categoryId: string;
  subject: string;
  questionText: string;
  options: unknown;
  correctOption: number;
  explanation: string | null;
  imageUrl: string | null;
  status: "DRAFT" | "PUBLISHED" | "HIDDEN";
  source: string | null;
  metadata: unknown;
}): PublicationTarget {
  return row;
}

export function createPrismaPublicationRepository(
  client: PrismaPublicationClient,
): PublicationRepository {
  return {
    async listMasters(ids) {
      return client.masterQuestion.findMany({
        where: ids ? { id: { in: [...ids] } } : undefined,
        orderBy: { id: "asc" },
        select: {
          id: true,
          generatedQuestionId: true,
          category: true,
          questionText: true,
          choices: true,
          answers: true,
          explanation: true,
          difficulty: true,
          isActive: true,
          publishedAt: true,
          generatedQuestion: {
            select: {
              id: true,
              status: true,
              candidateQuestionId: true,
              contentFingerprint: true,
              candidateQuestion: {
                select: {
                  id: true,
                  sourceName: true,
                  sourceQuestionId: true,
                  originalUrl: true,
                  contentFingerprint: true,
                },
              },
            },
          },
        },
      });
    },
    async findCategoryBySlug(slug) {
      return client.cbtCategory.findUnique({
        where: { slug },
        select: { id: true, slug: true, name: true, isActive: true },
      });
    },
    async listTargets(ids) {
      if (ids.length === 0) return [];
      const rows = await client.cbtQuestion.findMany({
        where: { id: { in: [...ids] } },
        select: {
          id: true,
          categoryId: true,
          subject: true,
          questionText: true,
          options: true,
          correctOption: true,
          explanation: true,
          imageUrl: true,
          status: true,
          source: true,
          metadata: true,
        },
      });
      return rows.map(asTarget);
    },
    async createTarget(input: PublicationCreateInput) {
      const row = await client.cbtQuestion.create({
        data: {
          ...input,
          options: input.options as Prisma.InputJsonValue,
          metadata: input.metadata as unknown as Prisma.InputJsonValue,
        },
        select: {
          id: true,
          categoryId: true,
          subject: true,
          questionText: true,
          options: true,
          correctOption: true,
          explanation: true,
          imageUrl: true,
          status: true,
          source: true,
          metadata: true,
        },
      });
      return asTarget(row);
    },
    async updateTargetStatus(id, status) {
      const row = await client.cbtQuestion.update({
        where: { id },
        data: { status },
        select: {
          id: true,
          categoryId: true,
          subject: true,
          questionText: true,
          options: true,
          correctOption: true,
          explanation: true,
          imageUrl: true,
          status: true,
          source: true,
          metadata: true,
        },
      });
      return asTarget(row);
    },
  };
}

export function createPrismaPublicationDatabase(): PublicationDatabase {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("publication_database_url_required");
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });
  const repository = createPrismaPublicationRepository(prisma);

  return {
    ...repository,
    transaction(work) {
      return prisma.$transaction((transaction) =>
        work(createPrismaPublicationRepository(transaction)),
      );
    },
    disconnect() {
      return prisma.$disconnect();
    },
  };
}
