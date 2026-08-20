import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: CustomerQueryDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const where = {
      deletedAt: null,
      ...(query.keyword ? { name: { contains: query.keyword.trim() } } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
        include: {
          owner: { select: { id: true, name: true } },
          _count: {
            select: {
              issues: {
                where: {
                  deletedAt: null,
                  status: { notIn: ['RESOLVED', 'CLOSED'] },
                },
              },
            },
          },
        },
      }),
      this.prisma.customer.count({ where }),
    ]);
    return { items, page, pageSize, total };
  }

  async create(input: CreateCustomerDto) {
    try {
      return await this.prisma.customer.create({ data: input });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException('客户名称已经存在');
      }
      throw error;
    }
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        issues: {
          where: { deletedAt: null },
          orderBy: { updatedAt: 'desc' },
          take: 10,
        },
        consumptions: { orderBy: { date: 'desc' }, take: 30 },
      },
    });
    if (!customer) throw new NotFoundException('客户不存在');
    return customer;
  }

  async update(id: string, input: UpdateCustomerDto) {
    await this.findOne(id);
    try {
      return await this.prisma.customer.update({ where: { id }, data: input });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException('客户名称已经存在');
      }
      throw error;
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { success: true };
  }
}
