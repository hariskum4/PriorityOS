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

/**
 * The handful of names that take "the" in an English sentence.
 *
 * Needed because these names now appear in running copy rather than only in a
 * picker: "counted on the figures for United States" is what the first pass
 * produced, and a card whose whole job is to be trusted with somebody's
 * remaining years cannot open by sounding like it was assembled by a machine.
 */
const TAKES_ARTICLE = new Set([
  'US', 'GB', 'AE', 'NL', 'PH', 'DO', 'CD', 'CZ', 'BS', 'GM', 'SD', 'MV',
]);

/**
 * The country's name as it belongs in a sentence — "India", "the Netherlands".
 * Null when nothing is set, so callers can choose their own fallback wording
 * rather than being handed the word "null" to print.
 */
export function countryInSentence(code?: string | null): string | null {
  const name = countryName(code);
  if (!name) return null;
  return TAKES_ARTICLE.has((code ?? '').trim().toUpperCase()) ? `the ${name}` : name;
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
/**
 * The tier between a country and a city.
 *
 * "Where you live" was one box with a country under it, and the reader who
 * typed "Ranchi" got nothing back — Jharkhand's capital, a million people,
 * and not among the ten Indian cities the flat list happened to hold. A list
 * of ten cities for a country of a billion is not a shortlist, it is a
 * rounding error, and the reader is left doing the app's filing for it.
 *
 * So the question is asked the way an address is written: country, then the
 * state inside it, then the city inside that. Each step narrows the next, and
 * three short lists beat one impossible one.
 *
 * Two rules this data follows:
 *
 *  - **The regions are complete or absent.** Every state and union territory
 *    of India is here, every state of the US. A partial list of regions is
 *    worse than none, because a reader who cannot find theirs concludes the
 *    app does not believe they live anywhere.
 *  - **The cities are not, and never claim to be.** A few per region, enough
 *    to tap rather than type. The box still takes anything, because no list
 *    of cities is ever finished and nobody should be told their home is not
 *    a place.
 *
 * Countries absent from here simply have no middle step. The city field then
 * scopes by country exactly as it did before, which is what most of the world
 * gets and is no worse than what everybody had.
 */
export const REGIONS_BY_COUNTRY: Record<string, Record<string, string[]>> = {
  IN: {
    'Andhra Pradesh': ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Tirupati'],
    'Arunachal Pradesh': ['Itanagar', 'Naharlagun'],
    Assam: ['Guwahati', 'Silchar', 'Dibrugarh', 'Jorhat'],
    Bihar: ['Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur'],
    Chhattisgarh: ['Raipur', 'Bhilai', 'Bilaspur', 'Korba'],
    Goa: ['Panaji', 'Margao', 'Vasco da Gama'],
    Gujarat: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Gandhinagar'],
    Haryana: ['Gurugram', 'Faridabad', 'Panipat', 'Ambala', 'Karnal'],
    'Himachal Pradesh': ['Shimla', 'Dharamshala', 'Mandi', 'Solan'],
    Jharkhand: ['Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro'],
    Karnataka: ['Bengaluru', 'Mysuru', 'Mangaluru', 'Hubballi', 'Belagavi'],
    Kerala: ['Kochi', 'Thiruvananthapuram', 'Kozhikode', 'Thrissur', 'Kollam'],
    'Madhya Pradesh': ['Indore', 'Bhopal', 'Jabalpur', 'Gwalior', 'Ujjain'],
    Maharashtra: ['Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Thane', 'Aurangabad'],
    Manipur: ['Imphal'],
    Meghalaya: ['Shillong'],
    Mizoram: ['Aizawl'],
    Nagaland: ['Kohima', 'Dimapur'],
    Odisha: ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Puri'],
    Punjab: ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Mohali'],
    Rajasthan: ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Ajmer'],
    Sikkim: ['Gangtok'],
    'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Erode'],
    Telangana: ['Hyderabad', 'Warangal', 'Nizamabad', 'Karimnagar'],
    Tripura: ['Agartala'],
    'Uttar Pradesh': ['Lucknow', 'Kanpur', 'Varanasi', 'Agra', 'Prayagraj', 'Noida', 'Ghaziabad', 'Meerut'],
    Uttarakhand: ['Dehradun', 'Haridwar', 'Rishikesh', 'Nainital'],
    'West Bengal': ['Kolkata', 'Howrah', 'Siliguri', 'Durgapur', 'Asansol'],
    'Andaman and Nicobar Islands': ['Port Blair'],
    Chandigarh: ['Chandigarh'],
    'Dadra and Nagar Haveli and Daman and Diu': ['Silvassa', 'Daman'],
    Delhi: ['New Delhi', 'Delhi', 'Dwarka', 'Rohini'],
    'Jammu and Kashmir': ['Srinagar', 'Jammu'],
    Ladakh: ['Leh', 'Kargil'],
    Lakshadweep: ['Kavaratti'],
    Puducherry: ['Puducherry', 'Karaikal'],
  },
  US: {
    Alabama: ['Birmingham', 'Montgomery', 'Huntsville'],
    Alaska: ['Anchorage', 'Juneau'],
    Arizona: ['Phoenix', 'Tucson', 'Mesa', 'Scottsdale'],
    Arkansas: ['Little Rock', 'Fayetteville'],
    California: ['Los Angeles', 'San Diego', 'San Jose', 'San Francisco', 'Sacramento', 'Oakland', 'Fresno'],
    Colorado: ['Denver', 'Colorado Springs', 'Boulder'],
    Connecticut: ['Hartford', 'New Haven', 'Stamford'],
    Delaware: ['Wilmington', 'Dover'],
    'District of Columbia': ['Washington'],
    Florida: ['Miami', 'Orlando', 'Tampa', 'Jacksonville'],
    Georgia: ['Atlanta', 'Savannah', 'Augusta'],
    Hawaii: ['Honolulu'],
    Idaho: ['Boise'],
    Illinois: ['Chicago', 'Springfield', 'Naperville'],
    Indiana: ['Indianapolis', 'Fort Wayne'],
    Iowa: ['Des Moines', 'Cedar Rapids'],
    Kansas: ['Wichita', 'Overland Park'],
    Kentucky: ['Louisville', 'Lexington'],
    Louisiana: ['New Orleans', 'Baton Rouge'],
    Maine: ['Portland', 'Augusta'],
    Maryland: ['Baltimore', 'Annapolis', 'Rockville'],
    Massachusetts: ['Boston', 'Cambridge', 'Worcester'],
    Michigan: ['Detroit', 'Grand Rapids', 'Ann Arbor'],
    Minnesota: ['Minneapolis', 'Saint Paul'],
    Mississippi: ['Jackson', 'Gulfport'],
    Missouri: ['Kansas City', 'St. Louis', 'Springfield'],
    Montana: ['Billings', 'Missoula'],
    Nebraska: ['Omaha', 'Lincoln'],
    Nevada: ['Las Vegas', 'Reno'],
    'New Hampshire': ['Manchester', 'Concord'],
    'New Jersey': ['Newark', 'Jersey City', 'Princeton'],
    'New Mexico': ['Albuquerque', 'Santa Fe'],
    'New York': ['New York', 'Buffalo', 'Rochester', 'Albany'],
    'North Carolina': ['Charlotte', 'Raleigh', 'Durham'],
    'North Dakota': ['Fargo', 'Bismarck'],
    Ohio: ['Columbus', 'Cleveland', 'Cincinnati'],
    Oklahoma: ['Oklahoma City', 'Tulsa'],
    Oregon: ['Portland', 'Eugene', 'Salem'],
    Pennsylvania: ['Philadelphia', 'Pittsburgh', 'Harrisburg'],
    'Rhode Island': ['Providence'],
    'South Carolina': ['Charleston', 'Columbia', 'Greenville'],
    'South Dakota': ['Sioux Falls', 'Rapid City'],
    Tennessee: ['Nashville', 'Memphis', 'Knoxville'],
    Texas: ['Houston', 'Dallas', 'Austin', 'San Antonio', 'Fort Worth', 'El Paso'],
    Utah: ['Salt Lake City', 'Provo'],
    Vermont: ['Burlington', 'Montpelier'],
    Virginia: ['Virginia Beach', 'Richmond', 'Arlington'],
    Washington: ['Seattle', 'Spokane', 'Tacoma', 'Bellevue'],
    'West Virginia': ['Charleston', 'Morgantown'],
    Wisconsin: ['Milwaukee', 'Madison'],
    Wyoming: ['Cheyenne', 'Casper'],
  },
  GB: {
    England: ['London', 'Birmingham', 'Manchester', 'Leeds', 'Liverpool', 'Bristol', 'Sheffield', 'Newcastle'],
    Scotland: ['Glasgow', 'Edinburgh', 'Aberdeen', 'Dundee'],
    Wales: ['Cardiff', 'Swansea', 'Newport'],
    'Northern Ireland': ['Belfast', 'Londonderry'],
  },
  CA: {
    Alberta: ['Calgary', 'Edmonton'],
    'British Columbia': ['Vancouver', 'Victoria', 'Surrey'],
    Manitoba: ['Winnipeg'],
    'New Brunswick': ['Moncton', 'Fredericton'],
    'Newfoundland and Labrador': ["St. John's"],
    'Northwest Territories': ['Yellowknife'],
    'Nova Scotia': ['Halifax'],
    Nunavut: ['Iqaluit'],
    Ontario: ['Toronto', 'Ottawa', 'Mississauga', 'Hamilton', 'London'],
    'Prince Edward Island': ['Charlottetown'],
    Quebec: ['Montreal', 'Quebec City', 'Laval', 'Gatineau'],
    Saskatchewan: ['Saskatoon', 'Regina'],
    Yukon: ['Whitehorse'],
  },
  AU: {
    'Australian Capital Territory': ['Canberra'],
    'New South Wales': ['Sydney', 'Newcastle', 'Wollongong'],
    'Northern Territory': ['Darwin', 'Alice Springs'],
    Queensland: ['Brisbane', 'Gold Coast', 'Cairns', 'Townsville'],
    'South Australia': ['Adelaide'],
    Tasmania: ['Hobart', 'Launceston'],
    Victoria: ['Melbourne', 'Geelong', 'Ballarat'],
    'Western Australia': ['Perth', 'Fremantle'],
  },
  DE: {
    'Baden-Wurttemberg': ['Stuttgart', 'Karlsruhe', 'Mannheim', 'Freiburg'],
    Bavaria: ['Munich', 'Nuremberg', 'Augsburg'],
    Berlin: ['Berlin'],
    Brandenburg: ['Potsdam'],
    Bremen: ['Bremen'],
    Hamburg: ['Hamburg'],
    Hesse: ['Frankfurt', 'Wiesbaden', 'Darmstadt'],
    'Lower Saxony': ['Hanover', 'Braunschweig', 'Osnabruck'],
    'Mecklenburg-Vorpommern': ['Rostock', 'Schwerin'],
    'North Rhine-Westphalia': ['Cologne', 'Dusseldorf', 'Dortmund', 'Essen', 'Bonn'],
    'Rhineland-Palatinate': ['Mainz', 'Ludwigshafen'],
    Saarland: ['Saarbrucken'],
    Saxony: ['Leipzig', 'Dresden', 'Chemnitz'],
    'Saxony-Anhalt': ['Magdeburg', 'Halle'],
    'Schleswig-Holstein': ['Kiel', 'Lubeck'],
    Thuringia: ['Erfurt', 'Jena'],
  },
};

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
export function searchCities(
  query: string,
  country?: string | null,
  region?: string | null,
  limit = 6,
): string[] {
  const pool = citiesIn(country, region);
  if (!pool.length) return [];
  const q = fold(query);
  if (!q) return pool.slice(0, limit);
  const starts = pool.filter((c) => fold(c).startsWith(q));
  const contains = pool.filter((c) => !fold(c).startsWith(q) && fold(c).includes(q));
  return [...starts, ...contains].slice(0, limit);
}

/**
 * Every city the app knows inside a country, or inside one region of it.
 *
 * The two sources are deliberately unioned rather than one replacing the
 * other. `CITIES_BY_COUNTRY` is the flat list every country has; the regional
 * data covers a handful of countries in much more depth. Reading only the
 * flat one would lose Ranchi again; reading only the regional one would empty
 * the city field for the hundred-odd countries that have no regions here.
 */
export function citiesIn(country?: string | null, region?: string | null): string[] {
  const code = (country ?? '').trim().toUpperCase();
  if (!code) return [];
  const byRegion = REGIONS_BY_COUNTRY[code];
  const wanted = (region ?? '').trim();

  if (wanted && byRegion) {
    const key = Object.keys(byRegion).find((r) => fold(r) === fold(wanted));
    return key ? [...byRegion[key]] : [];
  }
  const all = [
    ...(CITIES_BY_COUNTRY[code] ?? []),
    ...(byRegion ? Object.values(byRegion).flat() : []),
  ];
  return [...new Set(all)];
}

/** The states, provinces or nations of a country, or nothing if unknown. */
export function regionsOf(country?: string | null): string[] {
  const code = (country ?? '').trim().toUpperCase();
  return Object.keys(REGIONS_BY_COUNTRY[code] ?? {});
}

/**
 * Region suggestions for what has been typed so far.
 *
 * Empty query returns the whole list, unlike the country field — a country
 * has a couple of hundred peers and a state has a couple of dozen siblings,
 * so showing them all is a menu rather than a wall.
 */
export function searchRegions(query: string, country?: string | null, limit = 8): string[] {
  const pool = regionsOf(country);
  if (!pool.length) return [];
  const q = fold(query);
  if (!q) return pool.slice(0, limit);
  const starts = pool.filter((r) => fold(r).startsWith(q));
  const contains = pool.filter((r) => !fold(r).startsWith(q) && fold(r).includes(q));
  return [...starts, ...contains].slice(0, limit);
}

/**
 * Which region a city sits in — how the middle step is filled on a return
 * visit without storing it.
 *
 * The state is a filter, not a fact about somebody's life: the app uses the
 * country for its life-expectancy figure and the city for nothing but
 * context, so adding a column to remember a narrowing step would be storing
 * data to serve the form rather than the reader. Derived on the way in, it
 * costs nothing and cannot go stale.
 *
 * Null for a city we do not know, which is the honest answer — the field
 * simply stays unanswered and the city box still takes anything.
 */
export function regionOfCity(country?: string | null, city?: string | null): string | null {
  const code = (country ?? '').trim().toUpperCase();
  const want = fold(city ?? '');
  if (!code || !want) return null;
  const byRegion = REGIONS_BY_COUNTRY[code];
  if (!byRegion) return null;
  for (const [region, cities] of Object.entries(byRegion)) {
    if (cities.some((c) => fold(c) === want)) return region;
  }
  return null;
}

/**
 * What money is counted in, where somebody lives.
 *
 * The compounding card printed "Investing 10000 a month … grows to
 * ~2,323,391" with no unit anywhere on it. That was a considered choice, and
 * the reasoning was sound as far as it went: the reader types a bare number,
 * so the figure inherits whatever currency they were thinking in and the card
 * does not have to guess. What it missed is that a quantity of money with no
 * unit is not neutral — it is unreadable, and the reader has to supply from
 * memory the one fact the screen is for.
 *
 * The app already localises arithmetic by country and says so out loud
 * ("Time numbers use India's life expectancy"). Money is the same kind of
 * fact, so it follows the same field rather than inventing a second one.
 *
 * Symbol, not ISO code: "₹2,323,391" reads as money and "INR 2,323,391" reads
 * as a bank statement. Countries not listed get no symbol at all, which
 * restores exactly the old behaviour for them rather than guessing wrong —
 * and an expat thinking in another currency can change the country field,
 * which is the same lever that already moves their life-expectancy figures.
 */
const CURRENCY_BY_COUNTRY: Record<string, string> = {
  IN: '₹', US: '$', CA: 'C$', AU: 'A$', NZ: 'NZ$', SG: 'S$', HK: 'HK$',
  GB: '£', IE: '€', DE: '€', FR: '€', ES: '€', IT: '€', NL: '€', BE: '€',
  AT: '€', PT: '€', FI: '€', GR: '€', SK: '€', SI: '€', EE: '€', LV: '€',
  LT: '€', LU: '€', MT: '€', CY: '€', HR: '€',
  JP: '¥', CN: '¥', KR: '₩', CH: 'CHF ', SE: 'kr ', NO: 'kr ', DK: 'kr ',
  PL: 'zł ', CZ: 'Kč ', HU: 'Ft ', RU: '₽', TR: '₺', BR: 'R$', MX: 'MX$',
  AR: 'AR$', CL: 'CL$', CO: 'CO$', ZA: 'R', NG: '₦', KE: 'KSh ', EG: 'E£',
  AE: 'AED ', SA: 'SAR ', QA: 'QAR ', KW: 'KWD ', BH: 'BHD ', OM: 'OMR ',
  IL: '₪', PK: '₨', BD: '৳', LK: 'Rs ', NP: 'रू', ID: 'Rp ', MY: 'RM ',
  TH: '฿', VN: '₫', PH: '₱', TW: 'NT$',
};

/** The symbol for a country, or null when we would only be guessing. */
export function currencySymbol(code?: string | null): string | null {
  if (!code) return null;
  return CURRENCY_BY_COUNTRY[code.trim().toUpperCase()] ?? null;
}

/**
 * An amount with its unit, or the bare number when the country is unknown.
 * Never a wrong symbol: not knowing is a better answer than dollars in Delhi.
 */
export function money(amount: number, country?: string | null): string {
  const symbol = currencySymbol(country);
  const n = Math.round(amount).toLocaleString();
  return symbol ? `${symbol}${n}` : n;
}
