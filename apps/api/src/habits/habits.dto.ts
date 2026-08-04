import {
  ArrayMaxSize, IsArray, IsInt, IsOptional, Max, Min,
} from 'class-validator';

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
