import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsDefined, IsString, MaxLength, MinLength, ValidateNested,
} from 'class-validator';

/**
 * What onboarding may write, typed.
 *
 * The controller annotated the body and nothing checked it, so three
 * different shapes of nothing all reached the service and died there:
 *
 *   {}                          → 500, `body.answers` undefined
 *   { answers: 'nope' }         → 500, a string has no `.map`
 *   { answers: [{ section }] }  → 500, a row with no key, refused by the
 *                                 unique index it was meant to satisfy
 *
 * This is the widest write surface in the app — profession, ranking,
 * hobbies, the counts on the Time tab and the answers every engine reads all
 * arrive through this one endpoint — which makes it the worst one to have
 * left open, and the one where "Internal server error" tells a caller least.
 *
 * `value` stays `unknown` deliberately. It is a string here, an array of
 * domain keys there, an object for a saved count; narrowing it would mean
 * teaching this file every question the app will ever ask, and the section
 * and key are what the service actually dispatches on.
 */
export class AnswerDto {
  @IsString() @MinLength(1) @MaxLength(60) section: string;
  @IsString() @MinLength(1) @MaxLength(120) key: string;
  /* Present, but any shape. `@IsDefined` still refuses a row that forgot it
     — which is a row that would land as a NULL in a NOT NULL column. */
  @IsDefined() value: unknown;
}

export class SaveAnswersDto {
  @IsArray()
  /* One screen's worth of answers, not a bulk import. The cap is an upper
     bound on abuse; no lane of onboarding comes close to it. */
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers: AnswerDto[];
}
