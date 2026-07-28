import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { ClockModule } from './common/clock.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { RelationshipsModule } from './relationships/relationships.module';
import { GoalsModule } from './goals/goals.module';
import { MissionsModule } from './missions/missions.module';
import { HabitsModule } from './habits/habits.module';
import { JournalModule } from './journal/journal.module';
import { MemoriesModule } from './memories/memories.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { InsightsModule } from './insights/insights.module';
import { WeeklyReviewModule } from './weekly-review/weekly-review.module';
import { AiModule } from './ai/ai.module';
import { ScoringModule } from './scoring/scoring.module';
import { GamificationModule } from './gamification/gamification.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { PartnersModule } from './partners/partners.module';
import { LifeOsModule } from './life-os/life-os.module';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    PrismaModule,
    ClockModule,
    AnalyticsModule,
    AuthModule,
    UsersModule,
    OnboardingModule,
    RelationshipsModule,
    GoalsModule,
    MissionsModule,
    HabitsModule,
    JournalModule,
    MemoriesModule,
    DashboardModule,
    InsightsModule,
    WeeklyReviewModule,
    AiModule,
    ScoringModule,
    GamificationModule,
    NotificationsModule,
    PartnersModule,
    LifeOsModule,
  ],
  providers: [
    /**
     * Registering ThrottlerModule alone does nothing: without this guard the
     * `@Throttle` decorators on login and register are inert documentation,
     * and credential stuffing is unmetered. It is global so a new controller
     * is rate-limited by default rather than by remembering.
     */
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
