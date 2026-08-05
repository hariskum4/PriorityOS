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
    /* Same normalisation as `create`. The client sends an ISO string, and
       `null` is a real value here — it is how somebody takes a date back off
       a goal, so it must survive rather than be treated as "not supplied". */
    if ('targetDate' in patch) {
      patch.targetDate = patch.targetDate ? new Date(patch.targetDate) : null;
    }
    return this.prisma.goal.update({ where: { id }, data: patch });
  }

  /**
   * Drop a goal that was never really yours.
   *
   * Onboarding files a goal under whichever domain the answer suggested, and
   * it guesses wrong often enough that "abandon" is not the same request as
   * "this was a mistake". Missions already made from it keep their own record
   * — they were still done — so the link is cut rather than cascading them
   * into nothing.
   */
  async remove(userId: string, id: string) {
    const goal = await this.prisma.goal.findFirst({ where: { id, userId } });
    if (!goal) throw new NotFoundException('Goal not found');
    await this.prisma.mission.updateMany({ where: { goalId: id }, data: { goalId: null } });
    await this.prisma.goal.delete({ where: { id } });
    return { deleted: true };
  }
}
