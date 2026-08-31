import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import type {
  CandidateQuestionBundleRow,
  GeneratedQuestionBundleRow,
  MasterQuestionBundleRow,
  SourceGraphRepository,
  SourceGraphRow,
  SourceImportDatabase,
  SourceImportRepository,
  TargetSchemaInspection,
} from "./types";

type Client = PrismaClient | Prisma.TransactionClient;

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

const candidateSelect = {
  id: true,
  sourceName: true,
  sourceQuestionId: true,
  originalUrl: true,
  fetchedAt: true,
  category: true,
  classificationMethod: true,
  questionNumber: true,
  questionText: true,
  choices: true,
  normalizedAnswers: true,
  explanation: true,
  explanationReference: true,
  images: true,
  validationStatus: true,
  validationErrors: true,
  contentFingerprint: true,
} as const;

const generatedSelect = {
  id: true,
  candidateQuestionId: true,
  status: true,
  contentFingerprint: true,
  similarityWarning: true,
} as const;

const masterSelect = {
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
} as const;

function candidateBundleRow(row: Awaited<ReturnType<Client["candidateQuestion"]["findFirst"]>> & object): CandidateQuestionBundleRow {
  const value = row as unknown as Omit<CandidateQuestionBundleRow, "fetchedAt"> & { fetchedAt: Date | null };
  return { ...value, fetchedAt: iso(value.fetchedAt) };
}

function masterBundleRow(row: Awaited<ReturnType<Client["masterQuestion"]["findFirst"]>> & object): MasterQuestionBundleRow {
  const value = row as unknown as Omit<MasterQuestionBundleRow, "publishedAt"> & { publishedAt: Date | null };
  return { ...value, publishedAt: iso(value.publishedAt) };
}

async function databaseIdentity(client: Client) {
  const rows = await client.$queryRaw<
    Array<{ database: string; address: string | null; port: number | null; serverVersion: string }>
  >`SELECT current_database() AS database, inet_server_addr()::text AS address, inet_server_port() AS port, current_setting('server_version') AS "serverVersion"`;
  if (!rows[0]) throw new Error("cbt_source_database_identity_empty");
  return rows[0];
}

async function inspectSchema(client: Client): Promise<TargetSchemaInspection> {
  const [migrations, columns, statuses] = await Promise.all([
    client.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      ORDER BY migration_name ASC`,
    client.$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('candidate_questions', 'generated_questions', 'master_questions')
      ORDER BY table_name, ordinal_position`,
    client.$queryRaw<Array<{ value: string }>>`
      SELECT enumlabel AS value
      FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
      WHERE pg_type.typname = 'GeneratedQuestionStatus'
      ORDER BY enumsortorder`,
  ]);
  const tables: Record<string, string[]> = {};
  for (const row of columns) (tables[row.table_name] ??= []).push(row.column_name);
  return {
    appliedMigrations: migrations.map((row) => row.migration_name),
    tables,
    generatedQuestionStatuses: statuses.map((row) => row.value),
  };
}

function createRepository(client: Client): SourceImportRepository {
  return {
    databaseIdentity: () => databaseIdentity(client),
    inspectSchema: () => inspectSchema(client),
    findCategoryBySlug(slug) {
      return client.cbtCategory.findUnique({ where: { slug }, select: { id: true, slug: true, isActive: true } });
    },
    async listCandidateQuestions(ids) {
      if (ids.length === 0) return [];
      const rows = await client.candidateQuestion.findMany({
        where: { id: { in: [...ids] } },
        select: candidateSelect,
        orderBy: { id: "asc" },
      });
      return rows.map((row) => candidateBundleRow(row as never));
    },
    async listGeneratedQuestions(ids) {
      if (ids.length === 0) return [];
      return (await client.generatedQuestion.findMany({
        where: { id: { in: [...ids] } },
        select: generatedSelect,
        orderBy: { id: "asc" },
      })) as GeneratedQuestionBundleRow[];
    },
    async listMasterQuestions(ids) {
      if (ids.length === 0) return [];
      const rows = await client.masterQuestion.findMany({
        where: { id: { in: [...ids] } },
        select: masterSelect,
        orderBy: { id: "asc" },
      });
      return rows.map((row) => masterBundleRow(row as never));
    },
  };
}

function asInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function createDatabase(client: Client, root?: PrismaClient): SourceImportDatabase {
  const repository = createRepository(client);
  return {
    ...repository,
    async createCandidateQuestion(row) {
      await client.candidateQuestion.create({
        data: {
          ...row,
          fetchedAt: row.fetchedAt ? new Date(row.fetchedAt) : null,
          choices: asInputJson(row.choices),
          normalizedAnswers: asInputJson(row.normalizedAnswers),
          explanationReference:
            row.explanationReference === null ? Prisma.DbNull : asInputJson(row.explanationReference),
          images: asInputJson(row.images),
          validationErrors: asInputJson(row.validationErrors),
          rawHtmlSnippetId: null,
        },
      });
    },
    async createGeneratedQuestion(row) {
      await client.generatedQuestion.create({ data: row });
    },
    async createMasterQuestion(row) {
      await client.masterQuestion.create({
        data: {
          ...row,
          choices: asInputJson(row.choices),
          answers: asInputJson(row.answers),
          publishedAt: row.publishedAt ? new Date(row.publishedAt) : null,
        },
      });
    },
    transaction<T>(work: (repository: SourceImportDatabase) => Promise<T>) {
      if (!root) throw new Error("cbt_source_nested_transaction_forbidden");
      return root.$transaction((transaction) => work(createDatabase(transaction)));
    },
    disconnect() {
      return root?.$disconnect() ?? Promise.resolve();
    },
  };
}

export function createPrismaSourceGraphRepository(): SourceGraphRepository & { disconnect(): Promise<void> } {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("cbt_source_database_url_required");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  return {
    databaseIdentity: () => databaseIdentity(prisma),
    async listSourceGraph(masterIds): Promise<SourceGraphRow[]> {
      const rows = await prisma.masterQuestion.findMany({
        where: { id: { in: [...masterIds] } },
        select: {
          ...masterSelect,
          generatedQuestion: {
            select: {
              ...generatedSelect,
              candidateQuestion: { select: candidateSelect },
            },
          },
        },
        orderBy: { id: "asc" },
      });
      return rows.map(({ generatedQuestion, ...master }) => {
        const { candidateQuestion, ...generated } = generatedQuestion;
        return {
          master: master as SourceGraphRow["master"],
          generated: generated as SourceGraphRow["generated"],
          candidate: candidateQuestion as SourceGraphRow["candidate"],
        };
      });
    },
    disconnect: () => prisma.$disconnect(),
  };
}

export function createPrismaSourceImportDatabase(): SourceImportDatabase {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("cbt_source_database_url_required");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  return createDatabase(prisma, prisma);
}
