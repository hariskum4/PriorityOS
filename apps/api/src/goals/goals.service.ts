import { Injectable, NotFoundException } from '@nestjs/common';
import { deriveGoalTitle } from '@priority/scoring-engine';
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

  /**
   * Onboarding asks open questions, so `title` arrives as whatever the person
   * typed — sometimes several paragraphs. Normalising here rather than at the
   * call site means every client (mobile, admin, anything later) gets a title
   * that is actually a title, with the full prose preserved as the
   * description. Short input passes through untouched.
   */
  create(userId: string, data: any) {
    const { title, description } = deriveGoalTitle(data.title ?? '', data.description);
    return this.prisma.goal.create({
      data: {
        userId,
        domainType: data.domainType,
        title,
        description,
        horizon: data.horizon ?? '1y',
        targetDate: data.targetDate ? new Date(data.targetDate) : null,
      },
    });
  }

  async update(userId: string, id: string, data: any) {
    const goal = await this.prisma.goal.findFirst({ where: { id, userId } });
    if (!goal) throw new NotFoundException('Goal not found');
    // A rename goes through the same normalisation as a create, but only when
    // the caller is actually touching the title.
    const patch = { ...data };
    if (typeof patch.title === 'string') {
      const derived = deriveGoalTitle(patch.title, patch.description ?? goal.description);
      patch.title = derived.title;
      patch.description = derived.description;
    }
    return this.prisma.goal.update({ where: { id }, data: patch });
  }
}
