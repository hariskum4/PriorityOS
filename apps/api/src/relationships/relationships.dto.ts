import {
  IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength,
} from 'class-validator';

/**
 * What a request may claim about a person, typed.
 *
 * Before these existed the controller took `any`, and a missing relationType
 * travelled all the way to Postgres to die as a NOT NULL violation — a 500
 * with no hint of which field was wrong. Validation belongs at the door:
 * the caller who forgot a field gets told which one, not "Internal server
 * error". The service's own allowlist stays; this is the outer lock.
 *
 * Cadence/health/location values stay free strings on purpose — the scoring
 * engine normalises them with aliases, and rejecting "fortnightly" outright
 * would trade a tolerable unknown for a lost answer.
 */
export class CreateRelationshipDto {
  @IsString() @MinLength(1) @MaxLength(200) name: string;
  @IsString() @MinLength(1) @MaxLength(50) relationType: string;
  @IsOptional() @IsInt() @Min(0) @Max(129) age?: number;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsInt() @Min(1) @Max(10) closenessScore?: number;
  @IsOptional() @IsString() @MaxLength(30) inPersonFrequency?: string;
  @IsOptional() @IsString() @MaxLength(30) callFrequency?: string;
  @IsOptional() @IsString() @MaxLength(30) desiredCallFrequency?: string;
  @IsOptional() @IsString() @MaxLength(50) healthStatus?: string;
  @IsOptional() @IsString() @MaxLength(50) locationType?: string;
  @IsOptional() @IsBoolean() wantsMoreTime?: boolean;
  @IsOptional() @IsArray() meaningfulMomentTypes?: unknown[];
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  @IsOptional() @IsString() @MaxLength(30) birthday?: string;
}

/** Everything optional: an edit says only what changed. */
export class UpdateRelationshipDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(50) relationType?: string;
  @IsOptional() @IsInt() @Min(0) @Max(129) age?: number;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsInt() @Min(1) @Max(10) closenessScore?: number;
  @IsOptional() @IsString() @MaxLength(30) inPersonFrequency?: string;
  @IsOptional() @IsString() @MaxLength(30) callFrequency?: string;
  @IsOptional() @IsString() @MaxLength(30) desiredCallFrequency?: string;
  @IsOptional() @IsString() @MaxLength(50) healthStatus?: string;
  @IsOptional() @IsString() @MaxLength(50) locationType?: string;
  @IsOptional() @IsBoolean() wantsMoreTime?: boolean;
  @IsOptional() @IsArray() meaningfulMomentTypes?: unknown[];
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  @IsOptional() @IsString() @MaxLength(30) birthday?: string;
}

export class LogContactDto {
  @IsIn(['call', 'visit', 'message', 'activity']) kind: 'call' | 'visit' | 'message' | 'activity';
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}
