import {
  Max,
  IsIn, IsInt, IsISO8601, IsOptional, IsString, MaxLength, Min, MinLength,
} from 'class-validator';

import { CleanString } from '../common/clean-string';
import { ALL_DOMAINS } from '@priority/types';

/**
 * domainType is validated against the real domain list because everything the
 * engine does with a mission — ranking, gap math, XP attribution — looks the
 * domain up by this string. An unknown domain didn't fail; it scored as zero
 * forever, which is worse.
 */
export class CreateMissionDto {
  @CleanString() @IsString() @MinLength(1) @MaxLength(300) title: string;
  @IsIn(ALL_DOMAINS) domainType: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsIn(['one_time', 'ritual', 'milestone', 'relationship', 'recovery'])
  missionType?: string;
  @IsOptional() @IsString() relationshipId?: string;
  @IsOptional() @IsString() goalId?: string;
  @IsOptional() @IsISO8601() dueDate?: string;
  @IsOptional() @IsString() @MaxLength(200) recurrenceRule?: string;
  /* A day holds 1440 minutes. Anything longer is a typo, and the day card
     places missions by duration — a mission of 999999 minutes was accepted
     and is 694 days long. */
  @IsOptional() @IsInt() @Min(1) @Max(1440) estimatedMinutes?: number;
  @IsOptional() @IsString() @MaxLength(30) energyLevel?: string;
  @IsOptional() @IsInt() @Min(0) xpReward?: number;
}

/**
 * What a client may change about a mission after it exists.
 *
 * `PATCH /missions/:id` took `@Body() body: any` and handed it to
 * `prisma.mission.update` unfiltered, which meant every column was writable
 * by whoever owned the row. Demonstrated: `xpReward` set to 999999, `status`
 * to completed, `completedAt` to a date in 2020, `snoozeCount` to -50 — all
 * accepted, all returned 200.
 *
 * `assertOwned` was doing its job the whole time; this was never a way into
 * somebody else's data. What it was is a way to corrupt your own: a mission
 * marked complete this way skips `complete()` entirely, which is where the XP
 * award, the contact log, the scoring recalculation and the double-tap lock
 * all live. A week's `completedMissions` would count it and nothing else in
 * the record would agree.
 *
 * The global pipe runs `whitelist: true`, so it strips anything not declared
 * on a DTO — it simply had no DTO to work from here. Naming the two fields
 * the app actually sends is the whole fix.
 *
 * **Completion has one door.** `status` deliberately cannot be set to
 * `completed`: that transition belongs to `POST /missions/:id/complete`, and
 * a second way in would be a second place for the rules to be forgotten.
 */
export class UpdateMissionDto {
  @IsOptional() @CleanString() @IsString() @MinLength(1) @MaxLength(300) title?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsIn(['pending', 'dismissed'], {
    message: 'status must be pending or dismissed — completing goes through /complete',
  })
  status?: string;
  @IsOptional() @IsISO8601() dueDate?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1440) estimatedMinutes?: number;
}
