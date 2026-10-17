// Seed list of feeds. Every URL must be checked once before launch (reachable, RSS terms allow
// headline + short teaser + link). Change `active` to false for any feed whose terms forbid it.
// After launch, feeds live in the D1 table `feeds`; this list only seeds an empty database.

export type Country = "at" | "de" | "ch";
export type Category = "politik" | "wirtschaft" | "welt" | "sport" | "kultur" | "wissen" | "chronik" | "regional";

export interface FeedSeed {
  id: string;
  publisher: string;
  country: Country;
  url: string;
  homepage: string;
  category: Category;
  paywallHint?: boolean; // publisher marks paid articles; we flag them "Abo"
  active: boolean;
}

export const FEEDS: FeedSeed[] = [
  // Österreich
  { id: "orf-news", publisher: "ORF", country: "at", url: "https://rss.orf.at/news.xml", homepage: "https://orf.at", category: "politik", active: true },
  { id: "orf-vbg", publisher: "ORF Vorarlberg", country: "at", url: "https://rss.orf.at/vorarlberg.xml", homepage: "https://vorarlberg.orf.at", category: "regional", active: true },
  { id: "orf-sport", publisher: "ORF Sport", country: "at", url: "https://rss.orf.at/sport.xml", homepage: "https://sport.orf.at", category: "sport", active: true },
  { id: "standard", publisher: "Der Standard", country: "at", url: "https://www.derstandard.at/rss", homepage: "https://www.derstandard.at", category: "politik", paywallHint: true, active: true },
  { id: "presse", publisher: "Die Presse", country: "at", url: "https://www.diepresse.com/rss/", homepage: "https://www.diepresse.com", category: "politik", paywallHint: true, active: true },
  { id: "kurier", publisher: "Kurier", country: "at", url: "https://kurier.at/xml/rssd", homepage: "https://kurier.at", category: "chronik", paywallHint: true, active: true },
  { id: "vn", publisher: "Vorarlberger Nachrichten", country: "at", url: "https://www.vn.at/feed", homepage: "https://www.vn.at", category: "regional", paywallHint: true, active: true },

  // Deutschland
  { id: "tagesschau", publisher: "tagesschau", country: "de", url: "https://www.tagesschau.de/xml/rss2/", homepage: "https://www.tagesschau.de", category: "politik", active: true },
  { id: "spiegel", publisher: "Der Spiegel", country: "de", url: "https://www.spiegel.de/schlagzeilen/index.rss", homepage: "https://www.spiegel.de", category: "politik", paywallHint: true, active: true },
  { id: "zeit", publisher: "Zeit Online", country: "de", url: "https://newsfeed.zeit.de/index", homepage: "https://www.zeit.de", category: "politik", paywallHint: true, active: true },
  { id: "faz", publisher: "FAZ", country: "de", url: "https://www.faz.net/rss/aktuell/", homepage: "https://www.faz.net", category: "politik", paywallHint: true, active: true },
  { id: "sz", publisher: "Süddeutsche Zeitung", country: "de", url: "https://rss.sueddeutsche.de/rss/Topthemen", homepage: "https://www.sueddeutsche.de", category: "politik", paywallHint: true, active: true },
  { id: "dw", publisher: "Deutsche Welle", country: "de", url: "https://rss.dw.com/xml/rss-de-all", homepage: "https://www.dw.com/de", category: "welt", active: true },
  { id: "kicker", publisher: "kicker", country: "de", url: "https://newsfeed.kicker.de/news/aktuell", homepage: "https://www.kicker.de", category: "sport", active: true },

  // Schweiz
  { id: "srf", publisher: "SRF", country: "ch", url: "https://www.srf.ch/news/bnf/rss/1646", homepage: "https://www.srf.ch/news", category: "politik", active: true },
  { id: "nzz", publisher: "NZZ", country: "ch", url: "https://www.nzz.ch/recent.rss", homepage: "https://www.nzz.ch", category: "politik", paywallHint: true, active: true },
  { id: "watson", publisher: "watson", country: "ch", url: "https://www.watson.ch/api/1.0/rss/index.xml", homepage: "https://www.watson.ch", category: "chronik", active: true },
  { id: "swissinfo", publisher: "swissinfo.ch", country: "ch", url: "https://www.swissinfo.ch/ger/rss", homepage: "https://www.swissinfo.ch/ger", category: "welt", active: true },
];

export const COUNTRY_NAME: Record<Country, string> = { at: "Österreich", de: "Deutschland", ch: "Schweiz" };
export const COUNTRY_FLAG: Record<Country, string> = { at: "🇦🇹", de: "🇩🇪", ch: "🇨🇭" };

export const CATEGORY_NAME: Record<Category, string> = {
  politik: "Politik", wirtschaft: "Wirtschaft", welt: "Welt", sport: "Sport",
  kultur: "Kultur", wissen: "Wissen", chronik: "Chronik", regional: "Regional",
};

// Keyword hints so items from general feeds land in a sensible category.
export const CATEGORY_HINTS: [Category, RegExp][] = [
  ["sport", /\b(fu(ss|ß)ball|bundesliga|champions league|europa league|liga|derby|tabellenf(ü|ue)hrung|torjäger|trainer|ski|weltcup|slalom|abfahrt|tennis|formel 1|f1|olympia|wm|em|lask|rapid|austria wien|sturm graz|red bull salzburg|bayern|bvb|dortmund|sieg gegen|niederlage|remis|aufstieg|abstieg|meisterschaft)\b/i],
  ["wirtschaft", /\b(wirtschaft|börse|inflation|zinsen?|leitzins|konzern|unternehmen|aktie|ezb|arbeitsmarkt|arbeitslos\w*|insolvenz|pleite|preise|budget|steuer\w*|pension\w*|rente\w*|lohn|löhne|gehalt|industrie|export|bilanz|gewinn|umsatz)\b/i],
  ["welt", /\b(eu|usa|us-\w+|china|russland|ukraine|nahost|israel|gaza|westjordanland|iran|un-?\w*|nato|trump|putin|selenskyj?|frankreich|italien|spanien|grossbritannien|großbritannien|türkei|indien|indonesien|mexiko|brasilien|afrika|asien)\b/i],
  ["chronik", /\b(polizei|vermisst|verschwunden|festgenommen|festnahme|unfall|verletzt\w*|brand|feuer|einbruch|diebstahl|gericht|prozess|urteil|haft|mord|tot|tote|leiche|rettung|feuerwehr|lawine|unwetter|hochwasser)\b/i],
  ["kultur", /\b(film|musik|theater|festival|buch|roman|ausstellung|konzert|oper|kino|kunst|museum|kulturerbe)\b/i],
  ["wissen", /\b(studie|forscher\w*|forschung|wissenschaft\w*|klima\w*|weltraum|nasa|esa|medizin|künstliche intelligenz|universität|uni-)\b/i],
];
