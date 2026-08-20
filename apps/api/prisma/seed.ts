import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient, UserRole } from '../src/generated/prisma/client';
import { parseMySqlUrl } from '../src/prisma/mysql-url';

function requiredEnv(name: 'ADMIN_EMAIL' | 'ADMIN_PASSWORD') {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required to seed the administrator`);
  }
  return value;
}

const email = requiredEnv('ADMIN_EMAIL');
const password = requiredEnv('ADMIN_PASSWORD');

const adapter = new PrismaMariaDb(
  parseMySqlUrl(process.env.DATABASE_URL as string),
);
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, active: true, role: UserRole.ADMIN },
    create: {
      email,
      name: '系统管理员',
      passwordHash,
      role: UserRole.ADMIN,
    },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
