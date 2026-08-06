import { IsEmail, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Who an invite is addressed to, typed.
 *
 * The controller took `{ email: string }` as a bare annotation, which
 * TypeScript erases and nothing then checked. What that produced, from an
 * endpoint whose whole job is to create a sharing link:
 *
 *   {}                        → 500, an unhandled TypeError on `.trim()`
 *   { email: 12345 }          → 500
 *   { email: ['a@b.com'] }    → 500
 *   { email: 'not-an-email' } → 201, a link addressed to nobody
 *   500 characters            → 201
 *
 * The 500s are the loud half and the 201s are the worse one. An invite is
 * matched to its recipient by email at accept time, so a link created for a
 * string that is not an address can never be accepted by anyone — it is a
 * dangling row that the owner's screen will show as "waiting for them to
 * join" forever, about a person who was never asked.
 *
 * Lowercased and trimmed here rather than only in the service, so the value
 * that gets validated is the value that gets stored — a check against one
 * string and a write of another is how case-sensitive duplicates appear.
 */
export class InvitePartnerDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  /* Before @IsEmail, so a non-string is refused as a type rather than
     reported as a malformed address. */
  @MaxLength(320) // RFC 5321 maximum for a forward path.
  @IsEmail({}, { message: 'A valid email address is required' })
  email: string;
}
