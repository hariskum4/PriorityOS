import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CleanString } from '../common/clean-string';
import { DOMAIN_TYPES } from '../goals/goals.dto';

/** What was just finished, for the draft to be about. */
export class DraftJournalDto {
  @CleanString() @IsString() @MinLength(1) @MaxLength(300) title: string;
  @IsOptional() @CleanString() @IsString() @MaxLength(200) personName?: string;
  @IsOptional() @IsIn(DOMAIN_TYPES) domainType?: string;
}
