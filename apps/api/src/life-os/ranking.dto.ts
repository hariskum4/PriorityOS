import { ArrayMaxSize, ArrayMinSize, ArrayNotEmpty, IsArray, IsString } from 'class-validator';

/**
 * A new order for the parts of a life.
 *
 * The whole ranking, always — never a partial move. The endpoint compares
 * what arrives against what the account currently holds and refuses anything
 * that is not a permutation of it, which makes an accidental unranking
 * impossible: a client that forgets a domain gets a 400 rather than quietly
 * dropping it out of the person's plan.
 *
 * Twelve is the number of domains that exist, so it is the only ceiling worth
 * stating here; the real check is against this user's own ranked set.
 */
export class SetDomainRankingDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @IsString({ each: true })
  order!: string[];
}
