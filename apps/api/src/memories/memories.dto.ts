import {
  ArrayMaxSize, IsArray, IsIn, IsISO8601, IsOptional, IsString, MaxLength, MinLength,
} from 'class-validator';
import { CleanString } from '../common/clean-string';
import { DOMAIN_TYPES } from '../goals/goals.dto';

/**
 * A kept moment, typed.
 *
 * The controller took `@Body() body: any` — the same open door the fuzz pass
 * found on goals, habits and onboarding, and this one was missed because the
 * sweep never probed `/memories`. Recorded rather than glossed: a sweep that
 * misses an endpoint is a sweep whose clean result means less than it looks.
 *
 * The three prose fields are what make an archive worth returning to. A
 * memory carried one, so the archive was a list of titles with dates — a
 * thing that counts rather than a thing anybody re-reads. All three stay
 * optional, because a moment with only a title is still a moment and the
 * form must never become a questionnaire.
 */
const MEMORY_TYPES = [
  'relationship', 'experience', 'achievement', 'reflection', 'gratitude', 'moment',
] as const;

export class CreateMemoryDto {
  @CleanString() @IsString() @MinLength(1) @MaxLength(300) title: string;
  @IsOptional() @IsIn(MEMORY_TYPES) memoryType?: string;
  @IsOptional() @IsIn(DOMAIN_TYPES) domainType?: string;
  @IsOptional() @IsString() @MaxLength(120) countKey?: string;
  @IsOptional() @IsString() relationshipId?: string;
  @IsOptional() @IsString() missionId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) peoplePresent?: unknown[];
  @IsOptional() @CleanString() @IsString() @MaxLength(200) location?: string;

  /* What happened. The account of the thing. */
  @IsOptional() @IsString() @MaxLength(10_000) reflection?: string;
  /* What was actually said — the beat people go back to a diary for. */
  @IsOptional() @IsString() @MaxLength(10_000) conversation?: string;
  /* The part that stayed with them. */
  @IsOptional() @IsString() @MaxLength(10_000) keepsake?: string;

  /* Generous, because a memory is often logged years after it happened —
     "Kerala trips with Amma" is not necessarily about this week. */
  @IsOptional() @IsISO8601({}, { message: 'occurredAt must be an ISO date' })
  occurredAt?: string;

  /* `timeKnown` is deliberately absent, and not accepted from a caller. It is
     a statement about what the app witnessed, not a claim a client gets to
     make on its own behalf — the service derives it from whether a finished
     mission supplied the hour. */
}

/** Everything optional: an edit says only what changed. */
export class UpdateMemoryDto {
  @IsOptional() @CleanString() @IsString() @MinLength(1) @MaxLength(300) title?: string;
  @IsOptional() @IsIn(MEMORY_TYPES) memoryType?: string;
  @IsOptional() @IsIn(DOMAIN_TYPES) domainType?: string;
  @IsOptional() @IsString() @MaxLength(120) countKey?: string;
  @IsOptional() @IsString() relationshipId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) peoplePresent?: unknown[];
  @IsOptional() @CleanString() @IsString() @MaxLength(200) location?: string;
  @IsOptional() @IsString() @MaxLength(10_000) reflection?: string;
  @IsOptional() @IsString() @MaxLength(10_000) conversation?: string;
  @IsOptional() @IsString() @MaxLength(10_000) keepsake?: string;
  @IsOptional() @IsISO8601() occurredAt?: string;
}
