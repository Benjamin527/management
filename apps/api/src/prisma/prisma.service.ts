import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client';
import { parseMySqlUrl } from './mysql-url';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const adapter = new PrismaMariaDb(
      parseMySqlUrl(process.env.DATABASE_URL as string),
    );
    super({ adapter });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
