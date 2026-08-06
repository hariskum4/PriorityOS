import {
  ArrayMaxSize, IsArray, IsIn, IsObject, IsOptional, IsString, MaxLength,
} from 'class-validator';
import { CleanString } from '../common/clean-string';
import { DOMAIN_TYPES } from '../goals/goals.dto';

/**
 * The Sunday Session, typed.
 *
 * The last untyped body on the API. Not mass-assignable — `completeSession`
 * destructures the five fields it wants — but the priorities it accepts
 * become real missions, so an unbounded array here is an unbounded write.
 * The service already slices to seven; this says so at the door, where a
 * caller can be told rather than silently truncated.
 */
class NextWeekPriorityDto {
  @CleanString() @IsString() @MaxLength(300) title: string;
  @IsIn(DOMAIN_TYPES) domainType: string;
}

export class CompleteSessionDto {
  /* One word. It is asked for as one word. */
  @IsOptional() @CleanString() @IsString() @MaxLength(40) weekWord?: string;
  @IsOptional() @IsObject() domainSelfScores?: Record<string, number>;
  @IsOptional() @IsArray() @ArrayMaxSize(7) nextWeekPriorities?: NextWeekPriorityDto[];
  @IsOptional() @CleanString() @IsString() @MaxLength(300) oneThing?: string;
  @IsOptional() @CleanString() @IsString() @MaxLength(40) intentionWord?: string;
}
