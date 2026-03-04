import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Prevent multiple instances in dev/hot-reload
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: Pool;
};

const cs = process.env.DATABASE_URL;
if (!cs) {
  throw new Error(
    "Missing DATABASE_URL in environment. Add DATABASE_URL to your .env file."
  );
}

const pool =
  globalForPrisma.pgPool ??
  new Pool({
    connectionString: cs,
    // If you ever get SSL/cert errors with Neon, uncomment:
    // ssl: { rejectUnauthorized: false },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.pgPool = pool;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg(pool),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
