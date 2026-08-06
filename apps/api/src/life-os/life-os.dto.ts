import {
  ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';
import { CleanString } from '../common/clean-string';
import { DOMAIN_TYPES } from '../goals/goals.dto';

/**
 * The Life OS write surface, typed.
 *
 * These seven endpoints took `@Body() body: any`. Unlike `PATCH /missions`,
 * none of them was mass-assignable — every one names the fields it reads
 * (`body.transcript`, `body.kind`, `body.status`…) and builds its own `data`,
 * so nothing extra could ever reach Prisma.
 *
 * What was missing is the other half of what a DTO buys: limits. `capture`
 * accepted a transcript of any length, `addKnowledge` a topics array of any
 * size, `updateKnowledge` a progress of any number. None of that is a way in;
 * all of it is a way to store something nobody meant to send, and the body
 * limit is the only thing that was saying no.
 *
 * Declaring them also switches the global `whitelist: true` pipe on for these
 * routes, so an unknown field is dropped at the door rather than ignored one
 * line deeper — which is the difference between a rule and a habit.
 */

const KNOWLEDGE_KINDS = ['book', 'course', 'paper', 'talk', 'other'] as const;
const KNOWLEDGE_STATUS = ['queued', 'active', 'done', 'abandoned'] as const;

export class CaptureDto {
  /* Long, because this is where somebody empties their head — and bounded,
     because "long" and "unbounded" are different words. */
  @IsOptional() @IsString() @MaxLength(10_000) transcript?: string;
  @IsOptional() @IsString() @MaxLength(40) kind?: string;
}

export class AcceptCaptureDto {
  @IsOptional() @CleanString() @IsString() @MaxLength(300) title?: string;
  @IsOptional() @IsIn(DOMAIN_TYPES) domainType?: string;
}

export class DismissCaptureDto {
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}

export class CreateDecisionDto {
  @IsOptional() @CleanString() @IsString() @MaxLength(300) title?: string;
  @IsOptional() @IsString() @MaxLength(5_000) context?: string;
  /* A decision with forty options is not a decision. */
  @IsOptional() @IsArray() @ArrayMaxSize(10) options?: unknown[];
}

export class DecideDto {
  @IsOptional() @IsString() @MaxLength(40) status?: string;
  @IsOptional() @IsString() @MaxLength(120) chosenOptionId?: string;
  @IsOptional() @IsString() @MaxLength(5_000) rationale?: string;
}

export class AddKnowledgeDto {
  @CleanString() @IsString() @MaxLength(300) title: string;
  @IsOptional() @IsIn(KNOWLEDGE_KINDS) kind?: string;
  @IsOptional() @IsIn(KNOWLEDGE_STATUS) status?: string;
  @IsOptional() @IsIn(DOMAIN_TYPES) domainType?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) topics?: string[];
}

export class UpdateKnowledgeDto {
  @IsOptional() @IsIn(KNOWLEDGE_STATUS) status?: string;
  /* A percentage. It was accepting any number at all, including 4e9. */
  @IsOptional() @IsInt() @Min(0) @Max(100) progress?: number;
  @IsOptional() @IsString() @MaxLength(2_000) takeaway?: string;
}
