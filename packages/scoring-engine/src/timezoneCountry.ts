/**
 * The country a device timezone implies — exact matches only, null when unsure.
 *
 * This exists to retire one line of code: `timezone.startsWith('Asia/') ? 'IN'`,
 * which handed India's life-expectancy table to someone in Tokyo, Singapore or
 * Seoul — up to a nine-year error inside "meaningful visits left with your
 * mother", the app's headline number. A timezone is sent by every device at
 * registration, so this is a fact the app already holds; it was only ever read
 * carelessly.
 *
 * Deliberately a lookup, not a heuristic. A zone either names its country or
 * it says nothing: "America/New_York" is the United States, "Asia/Shanghai" is
 * China, and anything unlisted returns null rather than a guess — the caller's
 * fallback (a default expectancy, an unset profile field the You tab can fill)
 * is honest, and a wrong country in this arithmetic is not. Zones whose
 * country is genuinely ambiguous (plain "UTC", ocean zones, "Etc/*") are
 * omitted on purpose.
 *
 * Countries appear whether or not `LIFE_EXPECTANCY` distinguishes them yet:
 * the profile field is worth being right even where the table falls back to
 * its default, and the table can grow without touching this file.
 */
const TZ_COUNTRY: Record<string, string> = {
  // India — both spellings ship on real devices.
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN',

  // United States
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
  'America/Phoenix': 'US', 'America/Los_Angeles': 'US', 'America/Anchorage': 'US',
  'America/Detroit': 'US', 'America/Boise': 'US', 'Pacific/Honolulu': 'US',

  // United Kingdom & Ireland
  'Europe/London': 'GB', 'Europe/Belfast': 'GB', 'Europe/Dublin': 'IE',

  // Australia & New Zealand
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU',
  'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU', 'Australia/Hobart': 'AU',
  'Australia/Darwin': 'AU', 'Pacific/Auckland': 'NZ',

  // Canada
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA',
  'America/Winnipeg': 'CA', 'America/Halifax': 'CA', 'America/St_Johns': 'CA',
  'America/Montreal': 'CA', 'America/Regina': 'CA',

  // East & Southeast Asia
  'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Shanghai': 'CN',
  'Asia/Chongqing': 'CN', 'Asia/Urumqi': 'CN', 'Asia/Hong_Kong': 'HK',
  'Asia/Taipei': 'TW', 'Asia/Macau': 'MO', 'Asia/Singapore': 'SG',
  'Asia/Kuala_Lumpur': 'MY', 'Asia/Kuching': 'MY', 'Asia/Bangkok': 'TH',
  'Asia/Jakarta': 'ID', 'Asia/Makassar': 'ID', 'Asia/Jayapura': 'ID',
  'Asia/Manila': 'PH', 'Asia/Ho_Chi_Minh': 'VN', 'Asia/Saigon': 'VN',
  'Asia/Phnom_Penh': 'KH', 'Asia/Vientiane': 'LA', 'Asia/Yangon': 'MM',
  'Asia/Rangoon': 'MM', 'Asia/Brunei': 'BN',

  // South & Central Asia
  'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Asia/Dacca': 'BD',
  'Asia/Colombo': 'LK', 'Asia/Kathmandu': 'NP', 'Asia/Katmandu': 'NP',
  'Asia/Thimphu': 'BT', 'Asia/Kabul': 'AF', 'Asia/Tashkent': 'UZ',
  'Asia/Almaty': 'KZ', 'Asia/Bishkek': 'KG', 'Asia/Dushanbe': 'TJ',

  // Middle East
  'Asia/Dubai': 'AE', 'Asia/Riyadh': 'SA', 'Asia/Qatar': 'QA',
  'Asia/Bahrain': 'BH', 'Asia/Kuwait': 'KW', 'Asia/Muscat': 'OM',
  'Asia/Tehran': 'IR', 'Asia/Baghdad': 'IQ', 'Asia/Jerusalem': 'IL',
  'Asia/Tel_Aviv': 'IL', 'Asia/Amman': 'JO', 'Asia/Beirut': 'LB',
  'Asia/Damascus': 'SY', 'Europe/Istanbul': 'TR', 'Asia/Istanbul': 'TR',

  // Europe
  'Europe/Paris': 'FR', 'Europe/Berlin': 'DE', 'Europe/Madrid': 'ES',
  'Europe/Rome': 'IT', 'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE',
  'Europe/Vienna': 'AT', 'Europe/Zurich': 'CH', 'Europe/Lisbon': 'PT',
  'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK',
  'Europe/Helsinki': 'FI', 'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ',
  'Europe/Budapest': 'HU', 'Europe/Bucharest': 'RO', 'Europe/Sofia': 'BG',
  'Europe/Athens': 'GR', 'Europe/Kiev': 'UA', 'Europe/Kyiv': 'UA',
  'Europe/Moscow': 'RU', 'Europe/Minsk': 'BY', 'Europe/Riga': 'LV',
  'Europe/Vilnius': 'LT', 'Europe/Tallinn': 'EE', 'Europe/Bratislava': 'SK',
  'Europe/Ljubljana': 'SI', 'Europe/Zagreb': 'HR', 'Europe/Belgrade': 'RS',
  'Europe/Sarajevo': 'BA', 'Europe/Skopje': 'MK', 'Europe/Tirane': 'AL',
  'Europe/Luxembourg': 'LU', 'Europe/Monaco': 'MC', 'Europe/Malta': 'MT',
  'Europe/Reykjavik': 'IS',

  // Africa
  'Africa/Lagos': 'NG', 'Africa/Cairo': 'EG', 'Africa/Johannesburg': 'ZA',
  'Africa/Nairobi': 'KE', 'Africa/Accra': 'GH', 'Africa/Addis_Ababa': 'ET',
  'Africa/Dar_es_Salaam': 'TZ', 'Africa/Kampala': 'UG', 'Africa/Casablanca': 'MA',
  'Africa/Algiers': 'DZ', 'Africa/Tunis': 'TN', 'Africa/Tripoli': 'LY',
  'Africa/Khartoum': 'SD', 'Africa/Abidjan': 'CI', 'Africa/Dakar': 'SN',
  'Africa/Kinshasa': 'CD', 'Africa/Lusaka': 'ZM', 'Africa/Harare': 'ZW',
  'Africa/Maputo': 'MZ', 'Africa/Luanda': 'AO',

  // Latin America
  'America/Mexico_City': 'MX', 'America/Cancun': 'MX', 'America/Tijuana': 'MX',
  'America/Monterrey': 'MX', 'America/Sao_Paulo': 'BR', 'America/Rio_Branco': 'BR',
  'America/Manaus': 'BR', 'America/Fortaleza': 'BR', 'America/Bahia': 'BR',
  'America/Buenos_Aires': 'AR', 'America/Argentina/Buenos_Aires': 'AR',
  'America/Santiago': 'CL', 'America/Bogota': 'CO', 'America/Lima': 'PE',
  'America/Caracas': 'VE', 'America/Guayaquil': 'EC', 'America/La_Paz': 'BO',
  'America/Asuncion': 'PY', 'America/Montevideo': 'UY', 'America/Panama': 'PA',
  'America/Costa_Rica': 'CR', 'America/Guatemala': 'GT', 'America/Havana': 'CU',
  'America/Santo_Domingo': 'DO', 'America/Jamaica': 'JM', 'America/Port-au-Prince': 'HT',
};

/** ISO 3166 alpha-2 for a device timezone, or null — never a guess. */
export function countryFromTimezone(timezone?: string | null): string | null {
  if (!timezone) return null;
  return TZ_COUNTRY[timezone.trim()] ?? null;
}
