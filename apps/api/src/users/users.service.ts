import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, fullName: true, dob: true, timezone: true,
        city: true, country: true, profession: true, workType: true,
        workHoursPerWeek: true, maritalStatus: true, childrenCount: true,
        livesAwayFromParents: true, onboardingCompleted: true,
        motivationStyle: true, createdAt: true,
      },
    });
  }

  update(userId: string, data: Record<string, unknown>) {
    const allowed = [
      'fullName', 'dob', 'timezone', 'city', 'country', 'profession',
      'workType', 'workHoursPerWeek', 'maritalStatus', 'childrenCount',
      'livesAwayFromParents', 'motivationStyle',
    ];
    const patch = Object.fromEntries(
      Object.entries(data).filter(([k]) => allowed.includes(k)),
    );
    return this.prisma.user.update({ where: { id: userId }, data: patch });
  }

  preferences(userId: string) {
    return this.prisma.userPreferences.findUnique({ where: { userId } });
  }

  updatePreferences(userId: string, data: Record<string, unknown>) {
    const allowed = [
      'reminderTone', 'insightIntensity', 'quietHoursStart', 'quietHoursEnd',
      'preferredReminderHour', 'gamificationEnabled', 'weeklyReviewDay',
    ];
    const patch = Object.fromEntries(
      Object.entries(data).filter(([k]) => allowed.includes(k)),
    );
    return this.prisma.userPreferences.update({ where: { userId }, data: patch });
  }
}
