import { app } from "./app";
import { env } from "./config/env";
import { prisma } from "./config/prisma";

const server = app.listen(env.PORT, async () => {
  console.info(`MiniLedger API listening on http://localhost:${env.PORT}`);
  console.info(`Health check: http://localhost:${env.PORT}/api/health`);
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.info("PostgreSQL database connected successfully.");
  } catch (error) {
    console.warn("WARNING: Unable to connect to PostgreSQL database on startup. Ensure database is running on localhost:5432.");
  }
});

async function shutdown() {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
