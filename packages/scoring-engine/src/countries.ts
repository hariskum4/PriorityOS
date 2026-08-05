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

/**
 * The cities each country offers as suggestions.
 *
 * Why a list at all: "where you live" was a bare text box beside a single
 * guess chip read off the device timezone, so a reader in Kolkata saw
 * "Kolkata" — correct, and completely unexplained — while everybody the
 * guess was wrong about got a blank box and no help. The country field
 * directly beneath it had a searchable list. Two fields about the same
 * question, answered two different ways.
 *
 * Scoped by country on purpose. It is the field above, it is nearly always
 * already answered, and it turns an unbounded question into a short one:
 * a few dozen names rather than every settlement on earth. Anything not
 * listed is still typed, because a list of three hundred cities is a
 * shortlist however long it looks, and the box has always accepted prose.
 *
 * Not exhaustive and not trying to be — the largest handful per country,
 * enough that most readers tap rather than type.
 */
export const CITIES_BY_COUNTRY: Record<string, string[]> = {
  IN: ["Mumbai", "Delhi", "Bengaluru", "Hyderabad", "Chennai", "Kolkata", "Pune", "Ahmedabad", "Jaipur", "Kochi"],
  US: ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphia", "San Antonio", "San Diego", "Dallas", "San Francisco", "Seattle", "Boston", "Austin", "Denver"],
  GB: ["London", "Birmingham", "Manchester", "Glasgow", "Leeds", "Liverpool", "Bristol", "Edinburgh", "Sheffield", "Cardiff"],
  CA: ["Toronto", "Montreal", "Vancouver", "Calgary", "Ottawa", "Edmonton", "Winnipeg", "Quebec City"],
  AU: ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Canberra", "Hobart", "Gold Coast"],
  SG: ["Singapore"],
  AE: ["Dubai", "Abu Dhabi", "Sharjah", "Ajman"],
  DE: ["Berlin", "Hamburg", "Munich", "Cologne", "Frankfurt", "Stuttgart", "Dusseldorf", "Leipzig"],
  JP: ["Tokyo", "Yokohama", "Osaka", "Nagoya", "Sapporo", "Fukuoka", "Kobe", "Kyoto"],
  ES: ["Madrid", "Barcelona", "Valencia", "Seville", "Zaragoza", "Malaga", "Bilbao", "Vigo"],
  FR: ["Paris", "Marseille", "Lyon", "Toulouse", "Nice", "Nantes", "Strasbourg", "Bordeaux"],
  IT: ["Rome", "Milan", "Naples", "Turin", "Palermo", "Genoa", "Bologna", "Florence"],
  NL: ["Amsterdam", "Rotterdam", "The Hague", "Utrecht", "Eindhoven"],
  BR: ["Sao Paulo", "Rio de Janeiro", "Brasilia", "Salvador", "Fortaleza", "Belo Horizonte", "Curitiba", "Recife"],
  MX: ["Mexico City", "Guadalajara", "Monterrey", "Puebla", "Tijuana", "Leon"],
  ZA: ["Johannesburg", "Cape Town", "Durban", "Pretoria", "Port Elizabeth"],
  NG: ["Lagos", "Kano", "Ibadan", "Abuja", "Port Harcourt"],
  KE: ["Nairobi", "Mombasa", "Kisumu", "Nakuru"],
  PK: ["Karachi", "Lahore", "Faisalabad", "Rawalpindi", "Islamabad", "Peshawar"],
  BD: ["Dhaka", "Chittagong", "Khulna", "Rajshahi", "Sylhet"],
  LK: ["Colombo", "Kandy", "Galle", "Jaffna"],
  NP: ["Kathmandu", "Pokhara", "Lalitpur"],
  PH: ["Manila", "Quezon City", "Davao", "Cebu City", "Makati"],
  ID: ["Jakarta", "Surabaya", "Bandung", "Medan", "Semarang"],
  MY: ["Kuala Lumpur", "George Town", "Johor Bahru", "Ipoh", "Kuching"],
  TH: ["Bangkok", "Chiang Mai", "Phuket", "Pattaya"],
  VN: ["Ho Chi Minh City", "Hanoi", "Da Nang", "Hai Phong"],
  CN: ["Shanghai", "Beijing", "Shenzhen", "Guangzhou", "Chengdu", "Hangzhou", "Wuhan", "Xian"],
  HK: ["Hong Kong"],
  KR: ["Seoul", "Busan", "Incheon", "Daegu", "Daejeon"],
  TW: ["Taipei", "Kaohsiung", "Taichung", "Tainan"],
  IE: ["Dublin", "Cork", "Galway", "Limerick"],
  NZ: ["Auckland", "Wellington", "Christchurch", "Hamilton"],
  PT: ["Lisbon", "Porto", "Braga", "Coimbra"],
  PL: ["Warsaw", "Krakow", "Lodz", "Wroclaw", "Poznan", "Gdansk"],
  SE: ["Stockholm", "Gothenburg", "Malmo", "Uppsala"],
  NO: ["Oslo", "Bergen", "Trondheim", "Stavanger"],
  DK: ["Copenhagen", "Aarhus", "Odense", "Aalborg"],
  FI: ["Helsinki", "Espoo", "Tampere", "Vantaa"],
  CH: ["Zurich", "Geneva", "Basel", "Bern", "Lausanne"],
  AT: ["Vienna", "Graz", "Linz", "Salzburg"],
  BE: ["Brussels", "Antwerp", "Ghent", "Bruges"],
  GR: ["Athens", "Thessaloniki", "Patras", "Heraklion"],
  CZ: ["Prague", "Brno", "Ostrava"],
  RO: ["Bucharest", "Cluj-Napoca", "Timisoara", "Iasi"],
  RU: ["Moscow", "Saint Petersburg", "Novosibirsk", "Yekaterinburg", "Kazan"],
  UA: ["Kyiv", "Kharkiv", "Odesa", "Dnipro", "Lviv"],
  TR: ["Istanbul", "Ankara", "Izmir", "Bursa", "Antalya"],
  IL: ["Tel Aviv", "Jerusalem", "Haifa", "Beersheba"],
  SA: ["Riyadh", "Jeddah", "Mecca", "Medina", "Dammam"],
  QA: ["Doha", "Al Rayyan"],
  EG: ["Cairo", "Alexandria", "Giza", "Luxor"],
  MA: ["Casablanca", "Rabat", "Marrakesh", "Fez", "Tangier"],
  AR: ["Buenos Aires", "Cordoba", "Rosario", "Mendoza"],
  CL: ["Santiago", "Valparaiso", "Concepcion"],
  CO: ["Bogota", "Medellin", "Cali", "Barranquilla"],
  PE: ["Lima", "Arequipa", "Trujillo", "Cusco"],
  ET: ["Addis Ababa", "Dire Dawa"],
  GH: ["Accra", "Kumasi", "Tamale"],
};

/**
 * City suggestions for what has been typed so far, inside one country.
 *
 * With no country known this stays empty rather than searching the world:
 * a suggestion list that offers Birmingham to somebody in Alabama and
 * Birmingham to somebody in the Midlands, with no way to tell which is
 * meant, is worse than no list.
 */
export function searchCities(query: string, country?: string | null, limit = 6): string[] {
  const code = (country ?? '').trim().toUpperCase();
  const pool = CITIES_BY_COUNTRY[code];
  if (!pool) return [];
  const q = fold(query);
  if (!q) return pool.slice(0, limit);
  const starts = pool.filter((c) => fold(c).startsWith(q));
  const contains = pool.filter((c) => !fold(c).startsWith(q) && fold(c).includes(q));
  return [...starts, ...contains].slice(0, limit);
}
