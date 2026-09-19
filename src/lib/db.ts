import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Prevent multiple instances in dev/hot-reload
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: Pool;
};

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "Missing DATABASE_URL in environment. Add DATABASE_URL to your .env file.",
  );
}

const parsedDatabaseUrl = new URL(databaseUrl);
if (
  ["prefer", "require", "verify-ca"].includes(
    parsedDatabaseUrl.searchParams.get("sslmode") ?? "",
  )
) {
  // pg currently treats these modes as verify-full and warns that its future
  // defaults will be weaker. Keep the current certificate verification explicit.
  parsedDatabaseUrl.searchParams.set("sslmode", "verify-full");
}
const connectionString = parsedDatabaseUrl.toString();

const pool =
  globalForPrisma.pgPool ??
  new Pool({
    connectionString,
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.pgPool = pool;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg(pool, {
      schema: process.env.DATABASE_SCHEMA || "public",
    }),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
