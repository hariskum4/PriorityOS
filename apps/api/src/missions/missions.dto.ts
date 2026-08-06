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
