import {
  ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength,
} from 'class-validator';
import { DOMAIN_TYPES } from '../goals/goals.dto';

/**
 * A rhythm, as somebody sets one up.
 *
 * The create endpoint took `@Body() body: any`, so `{}` was a 500 and every
 * impossible cadence was a 201: zero a week, a thousand a week, minus three
 * a week — all stored, all listed, all handed to the day screen. The mobile
 * client happens to clamp with `Math.max(1, …)` in three places, which is
 * why nobody saw `Infinity%` on a progress ring, but that is the client
 * defending itself against its own server rather than the value being right.
 *
 * `targetPerWeek` is 1..21 — three times a day, every day, is already past
 * anything this app should encourage calling a rhythm, and 0 is not a
 * rhythm, it is the absence of one.
 */
export class CreateHabitDto {
  @IsString() @MinLength(1) @MaxLength(200) title: string;
  @IsIn(DOMAIN_TYPES, { message: 'domainType must be one of the twelve domains' })
  domainType: string;
  @IsOptional() @IsInt() @Min(1) @Max(21) targetPerWeek?: number;
  @IsOptional() @IsString() @MaxLength(60) sourceType?: string;
  @IsOptional() @IsString() @MaxLength(120) sourceKey?: string;
  @IsOptional() @IsInt() @Min(0) @Max(1439) plannedMinute?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(7) @IsInt({ each: true })
  @Min(0, { each: true }) @Max(6, { each: true })
  plannedDays?: number[];
}

/**
 * When a rhythm runs, as the reader answered it.
 *
 * Both fields are separately optional and separately clearable: sending
 * `null` hands that half of the question back to the engine, and omitting
 * it leaves the stored answer alone. Those are different intentions and
 * the old device-local version could not tell them apart.
 *
 * Bounds are the real ones rather than defensive rounding — a weekday is
 * 0..6 and a minute of the day is 0..1439, so anything else is a bug in
 * the caller and deserves a 400 naming the field rather than a row that
 * quietly means nothing.
 */
export class SetHabitScheduleDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  plannedDays?: number[] | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  plannedMinute?: number | null;
}
