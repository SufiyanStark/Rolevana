import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const user = await prisma.user.upsert({ where: { email: "developer@localhost" }, update: {}, create: { email: "developer@localhost", name: "Local developer" } });
  await prisma.setting.upsert({ where: { userId: user.id }, update: { dryRun: true }, create: { userId: user.id, dryRun: true, autopilotStatus: "OFF" } });
  await prisma.jobSource.upsert({ where: { name: "mock" }, update: { enabled: true }, create: { name: "mock", enabled: true } });
}
main().finally(() => prisma.$disconnect());

