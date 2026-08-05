/**
 * Every country this app can end up holding, with a name a person recognises.
 *
 * The gap this closes: `countryFromTimezone` can produce a hundred and twenty
 * ISO codes, `LIFE_EXPECTANCY` gives fifty-nine of them their own arithmetic —
 * and the only screen that let anybody *choose* offered nine. A merchant navy
 * officer who registered on a phone still set to Asia/Calcutta, then typed
 * "Vigo" into "where you live", was filed as living in India: his visits
 * with his daughter were counted over fourteen years instead of twenty-two,
 * and nothing in the interface could set it right, because Spain was not one
 * of the nine.
 *
 * The nine were not a bad list — they cover most of who opens this, and one
 * tap is the right cost for the common case. The bug was that they were the
 * *only* list. So the shortcuts stay and this exists behind them, for the
 * person the timezone guessed wrong about. Which is precisely the person the
 * field is editable for.
 *
 * Names are the ordinary English ones rather than the protocol's: "South
 * Korea", not "Korea, Republic of". Nobody searching for where they live
 * types the second one.
 */

export interface Country {
  /** ISO 3166-1 alpha-2, matching what `countryFromTimezone` returns. */
  code: string;
  name: string;
}

export const KNOWN_COUNTRIES: ReadonlyArray<Country> = [
  { code: 'AE', name: 'United Arab Emirates' }, { code: 'AF', name: 'Afghanistan' }, { code: 'AL', name: 'Albania' },
  { code: 'AO', name: 'Angola' }, { code: 'AR', name: 'Argentina' }, { code: 'AT', name: 'Austria' },
  { code: 'AU', name: 'Australia' }, { code: 'BA', name: 'Bosnia and Herzegovina' }, { code: 'BD', name: 'Bangladesh' },
  { code: 'BE', name: 'Belgium' }, { code: 'BG', name: 'Bulgaria' }, { code: 'BH', name: 'Bahrain' },
  { code: 'BN', name: 'Brunei' }, { code: 'BO', name: 'Bolivia' }, { code: 'BR', name: 'Brazil' },
  { code: 'BT', name: 'Bhutan' }, { code: 'BY', name: 'Belarus' }, { code: 'CA', name: 'Canada' },
  { code: 'CD', name: 'DR Congo' }, { code: 'CH', name: 'Switzerland' }, { code: 'CI', name: 'Côte d’Ivoire' },
  { code: 'CL', name: 'Chile' }, { code: 'CN', name: 'China' }, { code: 'CO', name: 'Colombia' },
  { code: 'CR', name: 'Costa Rica' }, { code: 'CU', name: 'Cuba' }, { code: 'CZ', name: 'Czechia' },
  { code: 'DE', name: 'Germany' }, { code: 'DK', name: 'Denmark' }, { code: 'DO', name: 'Dominican Republic' },
  { code: 'DZ', name: 'Algeria' }, { code: 'EC', name: 'Ecuador' }, { code: 'EE', name: 'Estonia' },
  { code: 'EG', name: 'Egypt' }, { code: 'ES', name: 'Spain' }, { code: 'ET', name: 'Ethiopia' },
  { code: 'FI', name: 'Finland' }, { code: 'FR', name: 'France' }, { code: 'GB', name: 'United Kingdom' },
  { code: 'GH', name: 'Ghana' }, { code: 'GR', name: 'Greece' }, { code: 'GT', name: 'Guatemala' },
  { code: 'HK', name: 'Hong Kong' }, { code: 'HR', name: 'Croatia' }, { code: 'HT', name: 'Haiti' },
  { code: 'HU', name: 'Hungary' }, { code: 'ID', name: 'Indonesia' }, { code: 'IE', name: 'Ireland' },
  { code: 'IL', name: 'Israel' }, { code: 'IN', name: 'India' }, { code: 'IQ', name: 'Iraq' },
  { code: 'IR', name: 'Iran' }, { code: 'IS', name: 'Iceland' }, { code: 'IT', name: 'Italy' },
  { code: 'JM', name: 'Jamaica' }, { code: 'JO', name: 'Jordan' }, { code: 'JP', name: 'Japan' },
  { code: 'KE', name: 'Kenya' }, { code: 'KG', name: 'Kyrgyzstan' }, { code: 'KH', name: 'Cambodia' },
  { code: 'KR', name: 'South Korea' }, { code: 'KW', name: 'Kuwait' }, { code: 'KZ', name: 'Kazakhstan' },
  { code: 'LA', name: 'Laos' }, { code: 'LB', name: 'Lebanon' }, { code: 'LK', name: 'Sri Lanka' },
  { code: 'LT', name: 'Lithuania' }, { code: 'LU', name: 'Luxembourg' }, { code: 'LV', name: 'Latvia' },
  { code: 'LY', name: 'Libya' }, { code: 'MA', name: 'Morocco' }, { code: 'MC', name: 'Monaco' },
  { code: 'MK', name: 'North Macedonia' }, { code: 'MM', name: 'Myanmar' }, { code: 'MO', name: 'Macao' },
  { code: 'MT', name: 'Malta' }, { code: 'MX', name: 'Mexico' }, { code: 'MY', name: 'Malaysia' },
  { code: 'MZ', name: 'Mozambique' }, { code: 'NG', name: 'Nigeria' }, { code: 'NL', name: 'Netherlands' },
  { code: 'NO', name: 'Norway' }, { code: 'NP', name: 'Nepal' }, { code: 'NZ', name: 'New Zealand' },
  { code: 'OM', name: 'Oman' }, { code: 'PA', name: 'Panama' }, { code: 'PE', name: 'Peru' },
  { code: 'PH', name: 'Philippines' }, { code: 'PK', name: 'Pakistan' }, { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' }, { code: 'PY', name: 'Paraguay' }, { code: 'QA', name: 'Qatar' },
  { code: 'RO', name: 'Romania' }, { code: 'RS', name: 'Serbia' }, { code: 'RU', name: 'Russia' },
  { code: 'SA', name: 'Saudi Arabia' }, { code: 'SD', name: 'Sudan' }, { code: 'SE', name: 'Sweden' },
  { code: 'SG', name: 'Singapore' }, { code: 'SI', name: 'Slovenia' }, { code: 'SK', name: 'Slovakia' },
  { code: 'SN', name: 'Senegal' }, { code: 'SY', name: 'Syria' }, { code: 'TH', name: 'Thailand' },
  { code: 'TJ', name: 'Tajikistan' }, { code: 'TN', name: 'Tunisia' }, { code: 'TR', name: 'Türkiye' },
  { code: 'TW', name: 'Taiwan' }, { code: 'TZ', name: 'Tanzania' }, { code: 'UA', name: 'Ukraine' },
  { code: 'UG', name: 'Uganda' }, { code: 'US', name: 'United States' }, { code: 'UY', name: 'Uruguay' },
  { code: 'UZ', name: 'Uzbekistan' }, { code: 'VE', name: 'Venezuela' }, { code: 'VN', name: 'Vietnam' },
  { code: 'ZA', name: 'South Africa' }, { code: 'ZM', name: 'Zambia' }, { code: 'ZW', name: 'Zimbabwe' },
];

const BY_CODE = new Map(KNOWN_COUNTRIES.map((c) => [c.code, c]));

/**
 * A country's name, or the code itself when we do not have one.
 *
 * Returning the raw code rather than null is deliberate: a stored value that
 * has no name here still has to be displayable, and "ZZ" tells the reader
 * something is set. Showing nothing would read as "unset" and invite them to
 * set it again.
 */
export function countryName(code?: string | null): string | null {
  const key = (code ?? '').trim().toUpperCase();
  if (!key) return null;
  return BY_CODE.get(key)?.name ?? key;
}

/** Spelling-tolerant enough for a phone keyboard: accents and case ignored. */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/**
 * Countries matching what has been typed so far.
 *
 * Prefix matches first, because somebody typing "in" means India far more
 * often than they mean Argentina — and a substring match that outranks a
 * prefix match is the single most irritating thing a picker can do. The exact
 * ISO code is allowed too, for the small number of people who know it.
 *
 * Within the prefix matches, the shorter name wins: "in" prefixes both India
 * and Indonesia, and the one that is *only* what you typed is the better
 * guess than the one that carries on. The list is stored in code order, so
 * without this rule Indonesia came first for no reason a reader could see.
 */
export function searchCountries(query: string, limit = 6): Country[] {
  const q = fold(query);
  if (!q) return [];
  const starts: Country[] = [];
  const contains: Country[] = [];
  for (const c of KNOWN_COUNTRIES) {
    const name = fold(c.name);
    if (name.startsWith(q) || fold(c.code) === q) starts.push(c);
    else if (name.includes(q)) contains.push(c);
  }
  starts.sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name));
  return [...starts, ...contains].slice(0, limit);
}
