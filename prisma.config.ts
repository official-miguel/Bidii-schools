const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "Missing DATABASE_URL env var. A PostgreSQL connection URL is required for Prisma CLI."
  );
}

/**
 * Prisma migrate status (v7.x) expects the datasource URL at `datasource.url`
 * in prisma.config.ts.
 */
export default {
  datasource: {
    url: databaseUrl,
  },
};
