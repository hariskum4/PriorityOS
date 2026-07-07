import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GoalsService {
  constructor(private prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.goal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(userId: string, data: any) {
    return this.prisma.goal.create({
      data: {
        userId,
        domainType: data.domainType,
        title: data.title,
        description: data.description ?? null,
        horizon: data.horizon ?? '1y',
        targetDate: data.targetDate ? new Date(data.targetDate) : null,
      },
    });
  }

  async update(userId: string, id: string, data: any) {
    const goal = await this.prisma.goal.findFirst({ where: { id, userId } });
    if (!goal) throw new NotFoundException('Goal not found');
    return this.prisma.goal.update({ where: { id }, data });
  }
}
