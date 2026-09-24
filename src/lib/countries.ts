import countryData from "./remarkable-countries.json";

// Snapshot of all 49 market options in the user-supplied reMarkable page source.
export const countries = countryData;

export function getCountry(code = "US") {
  const country = countries.find((item) => item.code === code.toUpperCase());
  if (!country) throw new Error("Select a supported country.");
  return country;
}

export function isRemarkableUrl(url: URL) {
  return url.hostname === "remarkable.com" || url.hostname === "www.remarkable.com";
}

export function countryUrl(value: string, code: string): string {
  const country = getCountry(code);
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol)) throw new Error("Enter a valid http(s) website URL.");
  if (!isRemarkableUrl(url)) return value;
  // Replace a commerce country or language-country prefix, retaining the page and query.
  const path = url.pathname.replace(/^\/(?:[a-z]{2}(?:-[a-z]{2})?)(?=\/|$)/i, "");
  url.pathname = "/" + country.code.toLowerCase() + (path.startsWith("/") ? path : "/" + path);
  return url.toString();
}

export function countrySettings(code = "US") {
  const country = getCountry(code);
  // A representative timezone for multi-zone markets; URL selection does not change IP.
  const zones: Record<string, string> = {
    AU: "Australia/Sydney", AT: "Europe/Vienna", BE: "Europe/Brussels", BG: "Europe/Sofia", CA: "America/Toronto",
    IC: "Atlantic/Canary", HR: "Europe/Zagreb", CY: "Asia/Nicosia", CZ: "Europe/Prague", DK: "Europe/Copenhagen",
    EE: "Europe/Tallinn", FI: "Europe/Helsinki", FR: "Europe/Paris", DE: "Europe/Berlin", GR: "Europe/Athens",
    HK: "Asia/Hong_Kong", HU: "Europe/Budapest", IS: "Atlantic/Reykjavik", IN: "Asia/Kolkata", IE: "Europe/Dublin",
    IL: "Asia/Jerusalem", IT: "Europe/Rome", JP: "Asia/Tokyo", JE: "Europe/Jersey", LV: "Europe/Riga",
    LI: "Europe/Vaduz", LT: "Europe/Vilnius", LU: "Europe/Luxembourg", MT: "Europe/Malta", NL: "Europe/Amsterdam",
    NZ: "Pacific/Auckland", NO: "Europe/Oslo", PL: "Europe/Warsaw", PT: "Europe/Lisbon", QA: "Asia/Qatar",
    RO: "Europe/Bucharest", SA: "Asia/Riyadh", SG: "Asia/Singapore", SK: "Europe/Bratislava", SI: "Europe/Ljubljana",
    KR: "Asia/Seoul", ES: "Europe/Madrid", SE: "Europe/Stockholm", CH: "Europe/Zurich", TW: "Asia/Taipei",
    TH: "Asia/Bangkok", AE: "Asia/Dubai", GB: "Europe/London", US: "America/New_York",
  };
  const language = country.language === "tw" ? "zh" : country.language;
  return { locale: language + "-" + country.code, timezone: zones[country.code] };
}
