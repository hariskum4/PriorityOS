import { Transform } from 'class-transformer';

/**
 * Trim before the length check, not after it.
 *
 * `@MinLength(1)` counts characters, and a space is a character. A
 * relationship created with `name: "   "` passed validation, reached the
 * service, was trimmed there — every write path trims, sensibly — and landed
 * in the database as an empty string. The row is then a person with no name,
 * and this app writes sentences about people:
 *
 *   Call  — not a text
 *   You and  have fewer unhurried years ahead than the rhythm you have
 *     been keeping assumes.
 *   Take your walk while calling
 *
 * That is the most affecting copy in the product, rendered about nobody, and
 * a double space is the only sign anything went wrong.
 *
 * Control characters go too. A name containing a newline is stored and
 * rendered faithfully, which breaks a card built to hold one line, and
 * nobody types a newline into a name field on purpose.
 *
 * Everything else is left exactly as written. Emoji, right-to-left scripts,
 * apostrophes, accents and one-letter names are all real names — the
 * possessive helper in `tinySteps` was checked against every one of them and
 * handles them correctly. This strips what cannot be meant, not what looks
 * unfamiliar.
 */

/** C0 and C1 control characters, which no name field ever wants. */
const CONTROL = /[\u0000-\u001F\u007F-\u009F]+/g;

export const CleanString = () => Transform(({ value }) => (
  typeof value === 'string'
    ? value.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim()
    : value
));
