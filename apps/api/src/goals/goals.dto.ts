import {
  IsIn, IsISO8601, IsOptional, IsString, MaxLength, MinLength,
} from 'class-validator';

/**
 * What a request may claim about a goal, typed.
 *
 * The controller took `@Body() body: any` — an annotation TypeScript erases,
 * leaving the door open. Probed:
 *
 *   {}                                    → 500, an unhandled throw on
 *                                           `data.title ?? ''` reaching the
 *                                           database as a NOT NULL violation
 *   { title: 'A', targetDate: 'soon' }    → 500, `new Date('soon')` is an
 *                                           Invalid Date and Prisma refuses it
 *   { title: '', domainType: 'health' }   → 201, a goal with no name
 *   { title: 'A', domainType: 'wombat' }  → 201, filed under a domain that
 *                                           does not exist
 *
 * The last one is the quiet one. `domainType` decides the colour, the engine
 * that reads the goal, the first step it suggests and which part of a life
 * gets the credit — a goal filed under `wombat` is invisible to all of it and
 * looks fine on the row.
 *
 * `horizon` and `targetDate` stay optional because both genuinely are: "no
 * date yet" is a legitimate answer the form offers first, and the risk rule
 * that flags an undated goal is the point rather than a gap to close here.
 */
export const DOMAIN_TYPES = [
  'family', 'partner', 'children', 'health', 'career', 'finance',
  'growth', 'friends', 'experiences', 'reflection', 'purpose', 'impact',
] as const;

export class CreateGoalDto {
  /* Long prose is expected and handled — `deriveGoalTitle` splits it into a
     title and a description. The cap is an upper bound on abuse, not on how
     much somebody may say. */
  @IsString() @MinLength(1) @MaxLength(2000) title: string;
  @IsIn(DOMAIN_TYPES, { message: 'domainType must be one of the twelve domains' })
  domainType: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() @MaxLength(10) horizon?: string;
  /* ISO only. `new Date('soon')` is an Invalid Date, which Prisma rejects
     with a 500 rather than telling the caller which field was wrong. */
  @IsOptional() @IsISO8601({}, { message: 'targetDate must be an ISO date' })
  targetDate?: string;
}

/** Everything optional: an edit says only what changed. */
export class UpdateGoalDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(2000) title?: string;
  @IsOptional() @IsIn(DOMAIN_TYPES) domainType?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() @MaxLength(10) horizon?: string;
  @IsOptional() @IsISO8601() targetDate?: string;
  @IsOptional() @IsIn(['active', 'achieved', 'abandoned']) status?: string;
}
