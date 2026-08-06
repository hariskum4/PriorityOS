import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

/**
 * What a screen says it showed somebody.
 *
 * The other half of making `GET /life-os/today` safe. It is the client's
 * report rather than the server's own observation, which is a trade worth
 * naming: a caller could send ids it never rendered, or omit ones it did.
 *
 * The blast radius of both is one account's own experience — proposals it
 * will not see again, or will see once more. Nobody else's record moves, and
 * nothing here is a permission. Defending it would mean running the cycle a
 * second time on the write, and `buildContext` is the expensive call on the
 * hot path; paying that on every render to stop somebody mildly inconveniencing
 * themselves is the wrong trade.
 */
export class MarkSeenDto {
  @IsArray()
  /* A cycle proposes a handful. The cap is an upper bound on abuse. */
  @ArrayMaxSize(100)
  @IsString({ each: true })
  observationIds: string[];

  /**
   * Whether one of the rationed findings was among them — the client can see
   * this, the engine is `regret` or `time`. Absent means no, which is the
   * safe direction: it leaves the weekly truth unspent rather than burning
   * one nobody read.
   */
  @IsOptional() @IsBoolean() usedProfound?: boolean;
}
