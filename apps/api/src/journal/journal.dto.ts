import {
  IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';

/**
 * Mood is an integer 1–5 — the schema has said so from the start, but the
 * endpoint took `any`, so a client sending the word "mixed" learned it from a
 * Prisma 500 instead of a 400 naming the field. The service's "is there
 * anything to keep" check stays; this only guarantees the types.
 */
export class CreateJournalEntryDto {
  @IsOptional() @IsInt() @Min(1) @Max(5) mood?: number;
  @IsOptional() @IsString() @MaxLength(20_000) gratitude?: string;
  @IsOptional() @IsString() @MaxLength(20_000) whatMattered?: string;
  @IsOptional() @IsString() @MaxLength(20_000) whatIAvoided?: string;
  @IsOptional() @IsString() @MaxLength(20_000) gladNotPostponed?: string;
  @IsOptional() @IsString() @MaxLength(20_000) freeText?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) domainTags?: string[];
}

export class UpdateJournalEntryDto extends CreateJournalEntryDto {}
