// Anonymous traffic counter for the CV site (shared by the functions in netlify/functions/).
//
//   POST /api/hit    {"type": "view" | "download", "ref"?: string, "owner"?: boolean}
//                    records a page view or CV download and returns the 30-day totals
//   GET  /api/stats  ?range=30d|90d|12m|all  aggregated traffic for the stats page
//   GET  /api/owner  {"excluded": boolean}: is this browser left out of the counts?
//   POST /api/owner  {"exclude": boolean}: sets or clears the ys_owner cookie
//
// Every endpoint also accepts ?ns=test, which uses a separate Blobs store, so tests never touch real data.
//
// Storage: one Netlify Blobs store per namespace, read with strong consistency.
//   salt/<day>                                  random daily salt
//   seen/<day>/<sha256>/...                     one visitor's loads and counted visits that day
//   ev/<day>/v-<n|r>-<CC>-<src>-<device>-<id>   one counted visit (n = the visitor's first that day)
//   ev/<day>/d-<id>                             one counted CV download
//   agg/<YYYY-MM>                               per-day totals of a finished month, kept forever
// Hits only ever create new keys (conditional "only if new" writes) and never rewrite one, so
// concurrent hits cannot lose each other's updates. Salts and visitor hashes are deleted about
// 30 minutes after their day ends (hourly job). Days are Europe/London calendar days. No raw IP,
// User-Agent or referrer hostname is ever stored.
//
// Storage and the clock are injected so all of this can be unit-tested.

export const TIMEZONE = "Europe/London";
export const STORE_NAMES = { live: "cv-traffic", test: "cv-traffic-test" } as const;
export type Namespace = keyof typeof STORE_NAMES;

const WINDOW_MS = 30 * 60 * 1000; // a visitor's loads less than 30 minutes apart count once
const ROLLUP_GRACE_MS = 60 * 60 * 1000; // roll a month up once it has been over for an hour
const MAX_BODY_BYTES = 4096;
// Answer with a 500 rather than hang if storage stalls. Generous on purpose: @netlify/blobs retries
// failed requests itself (5 s apart), and `netlify dev` is slow under bursts. Netlify's own limit is 60 s.
const DEADLINE_MS = 25000;
const OWNER_COOKIE = "ys_owner";
const OWNER_MAX_AGE = 34560000; // 400 days, Chrome's maximum
const OWNER_COOKIE_SET = `${OWNER_COOKIE}=1; Max-Age=${OWNER_MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Lax`;
const OWNER_COOKIE_CLEAR = `${OWNER_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;

// ---------------------------------------------------------------------------------------------
// Storage interface (the subset of @netlify/blobs' Store that this module uses)

export type WriteResult = { modified: boolean; etag?: string };
export type WriteConditions = { onlyIfNew: true } | { onlyIfMatch: string };
export interface TrafficStore {
  getWithMetadata(key: string): Promise<{ data: string | null; etag?: string } | null>;
  set(key: string, data: string, options?: WriteConditions): Promise<WriteResult>;
  delete(key: string): Promise<void>;
  list(options: { prefix: string }): Promise<{ blobs: { key: string }[] }>;
}

export interface TrafficContext {
  ip?: string;
  geo?: { country?: { code?: string } };
  waitUntil?: (promise: Promise<unknown>) => void;
}

export interface TrafficDeps {
  store: (ns: Namespace) => TrafficStore;
  now?: () => number;
  deadlineMs?: number;
}

// ---------------------------------------------------------------------------------------------
// Europe/London calendar days ("YYYY-MM-DD") and months ("YYYY-MM")

const londonParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The Europe/London calendar day of an instant, e.g. "2026-11-16". */
export const londonDay = (ms: number): string => {
  const parts: Record<string, string> = {};
  for (const part of londonParts.formatToParts(new Date(ms))) parts[part.type] = part.value;
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const DAY_RE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const MONTH_RE = /^\d{4}-(?:0[1-9]|1[0-2])$/;
export const isDay = (value: unknown): value is string => typeof value === "string" && DAY_RE.test(value);

/** Calendar arithmetic on day strings (no time zone involved, so clock changes can't affect it). */
export const addDays = (day: string, n: number): string => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** Every day from `from` to `to`, inclusive. */
export const daysBetween = (from: string, to: string): string[] => {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
};

export const nextMonth = (month: string): string => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
};

/** Every month from `from` to `to`, inclusive. */
export const monthsBetween = (from: string, to: string): string[] => {
  const months: string[] = [];
  for (let month = from; month <= to; month = nextMonth(month)) months.push(month);
  return months;
};

// ---------------------------------------------------------------------------------------------
// Classification: referrer source, device, country, bots

export const SOURCES = {
  dir: "Direct",
  li: "LinkedIn",
  se: "Search engines",
  em: "Email & messaging",
  job: "Job sites",
  oth: "Other websites",
} as const;
export type SourceCode = keyof typeof SOURCES;
export type SourceName = (typeof SOURCES)[SourceCode];

const LINKEDIN = new Set(["linkedin.com", "lnkd.in"]);
const SEARCH = new Set([
  "bing.com", "duckduckgo.com", "ecosia.org", "baidu.com", "startpage.com", "search.brave.com", "qwant.com",
]);
const SEARCH_NAMES = new Set(["google", "yahoo", "yandex"]); // with any TLD
const EMAIL = new Set([
  "mail.google.com", "outlook.live.com", "outlook.office.com", "outlook.office365.com", "mail.yahoo.com",
  "teams.microsoft.com", "teams.live.com", "slack.com", "web.whatsapp.com", "wa.me", "web.telegram.org", "t.me",
  "messenger.com", "mail.proton.me", "icloud.com",
]);
const JOBS = new Set([
  "reed.co.uk", "totaljobs.com", "cv-library.co.uk", "jobsite.co.uk", "jobs.ac.uk", "otta.com",
  "welcometothejungle.com", "myworkdayjobs.com", "greenhouse.io", "lever.co", "smartrecruiters.com", "hays.co.uk",
  "michaelpage.co.uk",
]);
const JOB_NAMES = new Set(["indeed", "glassdoor", "monster", "adzuna"]); // with any TLD
const ANDROID_APPS: Record<string, SourceCode> = {
  "com.linkedin.android": "li",
  "com.google.android.gm": "em",
  "com.microsoft.office.outlook": "em",
  "com.whatsapp": "em",
  "org.telegram.messenger": "em",
  "com.slack": "em", // com.Slack (package names are matched case-insensitively)
  "com.google.android.googlequicksearchbox": "se",
};
// "Any TLD": a single label (com, de, xn--p1ai) or a two-level country suffix (co.uk, com.tr).
const TLD_RE = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59}|[a-z]{2,3}\.[a-z]{2})$/;

/** The host itself and each parent domain: a.b.com -> a.b.com, b.com, com. */
const withParents = (host: string): string[] => {
  const labels = host.split(".");
  return labels.map((_, i) => labels.slice(i).join("."));
};
const matchesDomain = (host: string, domains: Set<string>) => withParents(host).some((d) => domains.has(d));
const matchesNameAnyTld = (host: string, names: Set<string>) =>
  withParents(host).some((d) => {
    const dot = d.indexOf(".");
    return dot > 0 && names.has(d.slice(0, dot)) && TLD_RE.test(d.slice(dot + 1));
  });

/** Maps document.referrer to one of the six public source categories. Only the category is kept. */
export const classifyReferrer = (ref: unknown, siteHost = ""): SourceCode => {
  if (typeof ref !== "string" || ref.trim() === "") return "dir";
  let url: URL;
  try {
    url = new URL(ref.trim());
  } catch {
    return "dir";
  }
  const host = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (url.protocol === "android-app:") return ANDROID_APPS[host] ?? "oth";
  if (
    host === "" ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === siteHost.toLowerCase() ||
    host.endsWith("yunusseven.netlify.app")
  ) {
    return "dir";
  }
  if (matchesDomain(host, LINKEDIN)) return "li";
  if (matchesDomain(host, EMAIL)) return "em"; // before search, so mail.google.com isn't "Search engines"
  if (matchesDomain(host, SEARCH) || matchesNameAnyTld(host, SEARCH_NAMES)) return "se";
  if (matchesDomain(host, JOBS) || matchesNameAnyTld(host, JOB_NAMES)) return "job";
  return "oth";
};

export type Device = "desktop" | "mobile" | "tablet";
const TABLET_RE = /iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i;
const MOBILE_RE = /Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i;
export const deviceOf = (ua: string): Device => (TABLET_RE.test(ua) ? "tablet" : MOBILE_RE.test(ua) ? "mobile" : "desktop");

/** ISO 3166-1 alpha-2 code from Netlify's geo data, or "XX" when unknown. */
export const countryOf = (code: unknown): string => {
  const value = typeof code === "string" ? code.toUpperCase() : "";
  return /^[A-Z]{2}$/.test(value) ? value : "XX";
};

const BOT_RE =
  /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|inspectiontool|preview|facebookexternalhit|linkedinbot|slackbot|twitterbot|whatsapp|telegrambot|discordbot|embedly|curl|wget|python-requests|python-urllib|aiohttp|axios|node-fetch|undici|go-http-client|java\/|okhttp|postman|insomnia|httpclient|puppeteer|playwright|selenium|phantomjs/i;
export const isBot = (ua: string | null | undefined): boolean => !ua || ua.trim() === "" || BOT_RE.test(ua);

// ---------------------------------------------------------------------------------------------
// Stored records

export type DayTotals = {
  v: number; // visits
  u: number; // visitors (first counted visit of the day)
  d: number; // downloads
  c: Record<string, number>; // visits by country
  s: Partial<Record<SourceCode, number>>; // visits by source
  dev: Partial<Record<Device, number>>; // visits by device
};
type MonthDoc = { month: string; days: Record<string, DayTotals> };
type ParsedEvent =
  | { day: string; kind: "d" }
  | { day: string; kind: "v"; first: boolean; country: string; source: SourceCode; device: Device };

const EVENT_RE =
  /^ev\/(\d{4}-\d{2}-\d{2})\/(?:v-([nr])-([A-Z]{2})-(dir|li|se|em|job|oth)-(desktop|mobile|tablet)|d)-[0-9a-f]{32}$/;

export const parseEventKey = (key: string): ParsedEvent | null => {
  const m = EVENT_RE.exec(key);
  if (!m || !isDay(m[1])) return null;
  if (!m[2]) return { day: m[1], kind: "d" };
  return { day: m[1], kind: "v", first: m[2] === "n", country: m[3], source: m[4] as SourceCode, device: m[5] as Device };
};

const count = (n: unknown): number => (typeof n === "number" && Number.isSafeInteger(n) && n > 0 ? n : 0);
const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isSalt = (x: unknown): x is { salt: string } => isObject(x) && typeof x.salt === "string" && /^[0-9a-f]{64}$/.test(x.salt);
const isMonthDoc = (x: unknown): x is MonthDoc =>
  isObject(x) && typeof x.month === "string" && MONTH_RE.test(x.month) && isObject(x.days);

const emptyDay = (): DayTotals => ({ v: 0, u: 0, d: 0, c: {}, s: {}, dev: {} });

/** Copies only well-formed counters out of a stored day record. */
const cleanDay = (raw: unknown): DayTotals => {
  const day = emptyDay();
  if (!isObject(raw)) return day;
  day.v = count(raw.v);
  day.u = count(raw.u);
  day.d = count(raw.d);
  if (isObject(raw.c)) for (const [k, n] of Object.entries(raw.c)) if (/^[A-Z]{2}$/.test(k) && count(n)) day.c[k] = count(n);
  if (isObject(raw.s)) for (const [k, n] of Object.entries(raw.s)) if (k in SOURCES && count(n)) day.s[k as SourceCode] = count(n);
  if (isObject(raw.dev)) for (const k of ["desktop", "mobile", "tablet"] as const) if (count(raw.dev[k])) day.dev[k] = count(raw.dev[k]);
  return day;
};

const addEvent = (days: Map<string, DayTotals>, event: ParsedEvent) => {
  let day = days.get(event.day);
  if (!day) days.set(event.day, (day = emptyDay()));
  if (event.kind === "d") {
    day.d += 1;
    return;
  }
  day.v += 1;
  if (event.first) day.u += 1;
  day.c[event.country] = (day.c[event.country] ?? 0) + 1;
  day.s[event.source] = (day.s[event.source] ?? 0) + 1;
  day.dev[event.device] = (day.dev[event.device] ?? 0) + 1;
};

async function readJSON<T>(store: TrafficStore, key: string, valid: (x: unknown) => x is T) {
  const entry = await store.getWithMetadata(key);
  if (!entry) return { exists: false, value: null as T | null, etag: undefined as string | undefined };
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(entry.data ?? "");
  } catch {
    // Treated as missing; a conditional write replaces it.
  }
  return { exists: true, value: valid(parsed) ? parsed : null, etag: entry.etag || undefined };
}

const toHex = (bytes: ArrayBuffer | Uint8Array) =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
const randomHex = (bytes: number) => toHex(crypto.getRandomValues(new Uint8Array(bytes)));
const sha256 = async (text: string) => toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));

/** The salt for a day, created (once, with a conditional write) when `create` is set. */
async function daySalt(store: TrafficStore, day: string, create: boolean) {
  const key = `salt/${day}`;
  const current = await readJSON(store, key, isSalt);
  if (current.value) return { salt: current.value.salt, created: false };
  if (!create) return { salt: null, created: false };
  const conditions: WriteConditions =
    current.exists && current.etag ? { onlyIfMatch: current.etag } : { onlyIfNew: true };
  const { modified } = await store.set(key, JSON.stringify({ salt: randomHex(32) }), conditions);
  // Read it back: when several requests race to create the salt, they all use the one that was stored.
  const stored = await readJSON(store, key, isSalt);
  if (!stored.value) throw new Error("Could not create the daily salt");
  return { salt: stored.value.salt, created: modified };
}

// A visitor's state for one day lives under seen/<day>/<hash>/ as create-only keys:
//   <v|d>-<ms>-<rand>   one load (view or download) at that time; every load slides the window
//   <v|d>-claim-<ms>    the load after the one at <ms> (0: none) was counted
const LOAD_RE = /^([vd])-(\d{13})-[0-9a-f]{8}$/;
const CLAIM_RE = /^([vd])-claim-\d+$/;

/** The visitor's loads and claims of one kind that day: latest load time, and whether any load was counted. */
async function visitorState(store: TrafficStore, prefix: string, kind: "v" | "d") {
  const { blobs } = await store.list({ prefix });
  let last: number | null = null;
  let claimed = false;
  for (const { key } of blobs) {
    const name = key.slice(prefix.length);
    const load = LOAD_RE.exec(name);
    if (load && load[1] === kind) last = Math.max(last ?? 0, Number(load[2]));
    const claim = CLAIM_RE.exec(name);
    if (claim && claim[1] === kind) claimed = true;
  }
  return { last, claimed };
}

/**
 * Records a load and decides whether it counts: it does when the visitor has no load in the
 * previous 30 minutes (`earlier` is their latest load from the day before, which matters just
 * after midnight). Loads that see the same previous state race for the same create-only claim
 * key, so simultaneous loads from one visitor count once.
 */
async function recordLoad(store: TrafficStore, prefix: string, kind: "v" | "d", now: number, earlier: number | null) {
  const state = await visitorState(store, prefix, kind);
  const last = Math.max(state.last ?? 0, earlier ?? 0);
  const counted = !(now - last < WINDOW_MS);
  const load = store.set(`${prefix}${kind}-${String(now).padStart(13, "0")}-${randomHex(4)}`, "1", { onlyIfNew: true });
  const claim = counted ? store.set(`${prefix}${kind}-claim-${last}`, "1", { onlyIfNew: true }) : null;
  const [, won] = await Promise.all([load, claim]);
  if (!won?.modified) return { counted: false, first: false };
  return { counted: true, first: kind === "v" && !state.claimed };
}

// ---------------------------------------------------------------------------------------------
// Reading totals

/**
 * Per-day totals. Finished months come from their agg/ document, other months from the raw
 * events. `months` limits the work to those months; null loads everything.
 */
async function loadDays(store: TrafficStore, months: string[] | null, currentMonth: string) {
  const aggMonths = months
    ? Promise.resolve(months.filter((m) => m < currentMonth))
    : store.list({ prefix: "agg/" }).then(({ blobs }) => blobs.map((b) => b.key.slice(4)).filter((m) => MONTH_RE.test(m)));
  const docs = aggMonths.then((list) => Promise.all(list.map((m) => readJSON(store, `agg/${m}`, isMonthDoc))));
  const [events, monthDocs] = await Promise.all([store.list({ prefix: "ev/" }), docs]);

  const days = new Map<string, DayTotals>();
  const rolledUp = new Set<string>();
  for (const { value } of monthDocs) {
    if (!value) continue;
    rolledUp.add(value.month);
    for (const [day, totals] of Object.entries(value.days)) {
      if (isDay(day) && day.startsWith(value.month)) days.set(day, cleanDay(totals));
    }
  }
  for (const { key } of events.blobs) {
    const event = parseEventKey(key);
    if (!event) continue;
    const month = event.day.slice(0, 7);
    if (rolledUp.has(month) || (months && !months.includes(month))) continue;
    addEvent(days, event);
  }
  return days;
}

const sumDays = (days: Map<string, DayTotals>, list: string[]) => {
  const total = { visits: 0, visitors: 0, downloads: 0 };
  for (const date of list) {
    const day = days.get(date);
    if (!day) continue;
    total.visits += day.v;
    total.visitors += day.u;
    total.downloads += day.d;
  }
  return total;
};

const last30Days = (now: number) => {
  const today = londonDay(now);
  return daysBetween(addDays(today, -29), today);
};

async function readLast30(store: TrafficStore, now: number) {
  const window = last30Days(now);
  const months = [...new Set(window.map((d) => d.slice(0, 7)))];
  const days = await loadDays(store, months, londonDay(now).slice(0, 7));
  const { visits, downloads } = sumDays(days, window);
  return { visits, downloads };
}

export const RANGES = ["30d", "90d", "12m", "all"] as const;
export type Range = (typeof RANGES)[number];
const RANGE_DAYS: Record<Exclude<Range, "all">, number> = { "30d": 30, "90d": 90, "12m": 365 };

const ranked = <K extends string>(counts: Map<K, number>) =>
  [...counts].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

/** Builds the /api/stats response body from per-day totals. */
export const buildStats = (days: Map<string, DayTotals>, range: Range, now: number) => {
  const today = londonDay(now);
  const active = [...days].filter(([, d]) => d.v > 0 || d.d > 0).map(([day]) => day).sort();
  const trackingSince = active.length ? (active[0] < today ? active[0] : today) : null;
  const start = range === "all" ? (trackingSince ?? today) : addDays(today, -(RANGE_DAYS[range] - 1));
  const rangeDays = daysBetween(start, today);

  const daily = rangeDays.map((date) => {
    const day = days.get(date);
    return { date, visits: day?.v ?? 0, visitors: day?.u ?? 0, downloads: day?.d ?? 0 };
  });
  const monthly = monthsBetween((trackingSince ?? today).slice(0, 7), today.slice(0, 7)).map((month) => ({
    month,
    ...sumDays(days, [...days.keys()].filter((d) => d.startsWith(month) && d <= today)),
  }));

  const countries = new Map<string, number>();
  const sources = new Map<SourceCode, number>();
  const devices = new Map<Device, number>();
  for (const date of rangeDays) {
    const day = days.get(date);
    if (!day) continue;
    for (const [code, n] of Object.entries(day.c)) countries.set(code, (countries.get(code) ?? 0) + n);
    for (const [code, n] of Object.entries(day.s) as [SourceCode, number][]) sources.set(code, (sources.get(code) ?? 0) + n);
    for (const [device, n] of Object.entries(day.dev) as [Device, number][]) devices.set(device, (devices.get(device) ?? 0) + n);
  }
  const last30 = sumDays(days, last30Days(now));

  return {
    timezone: TIMEZONE,
    generatedAt: new Date(now).toISOString(),
    trackingSince,
    range,
    last30: { visits: last30.visits, downloads: last30.downloads },
    totals: sumDays(days, rangeDays),
    daily,
    monthly,
    countries: ranked(countries).map(([code, visits]) => ({ code, visits })),
    sources: ranked(new Map([...sources].map(([code, n]) => [SOURCES[code], n] as const))).map(([source, visits]) => ({
      source,
      visits,
    })),
    devices: ranked(devices).map(([device, visits]) => ({ device, visits })),
  };
};

// ---------------------------------------------------------------------------------------------
// Maintenance: delete expired salts and visitor hashes, roll finished months up (hourly job)

async function deleteKeys(store: TrafficStore, keys: string[]) {
  for (let i = 0; i < keys.length; i += 20) await Promise.all(keys.slice(i, i + 20).map((key) => store.delete(key)));
}

export async function runMaintenance(store: TrafficStore, now: number) {
  const today = londonDay(now);
  // A day's salt and hashes are needed until 30 minutes after it ends (repeat check across midnight).
  const keepFrom = londonDay(now - WINDOW_MS);
  const openFrom = londonDay(now - ROLLUP_GRACE_MS).slice(0, 7); // months before this one are finished
  const [salts, seen, events] = await Promise.all([
    store.list({ prefix: "salt/" }),
    store.list({ prefix: "seen/" }),
    store.list({ prefix: "ev/" }),
  ]);

  const expired = [...salts.blobs, ...seen.blobs]
    .map((b) => b.key)
    .filter((key) => {
      const day = key.split("/")[1];
      return isDay(day) && day < keepFrom;
    });

  const eventsByMonth = new Map<string, { key: string; event: ParsedEvent }[]>();
  for (const { key } of events.blobs) {
    const event = parseEventKey(key);
    if (!event) continue;
    const month = event.day.slice(0, 7);
    if (!eventsByMonth.has(month)) eventsByMonth.set(month, []);
    eventsByMonth.get(month)!.push({ key, event });
  }

  const rolledUp: string[] = [];
  const doneEvents: string[] = [];
  for (const month of [...eventsByMonth.keys()].sort()) {
    const list = eventsByMonth.get(month)!;
    if (month >= openFrom) continue;
    let doc = await readJSON(store, `agg/${month}`, isMonthDoc);
    if (!doc.value) {
      const days = new Map<string, DayTotals>();
      for (const { event } of list) addEvent(days, event);
      const conditions: WriteConditions = doc.exists && doc.etag ? { onlyIfMatch: doc.etag } : { onlyIfNew: true };
      const result = await store.set(`agg/${month}`, JSON.stringify({ month, days: Object.fromEntries(days) }), conditions);
      if (result.modified) rolledUp.push(month);
      doc = await readJSON(store, `agg/${month}`, isMonthDoc);
      if (!doc.value) continue;
    }
    // Keep the raw events two more days, so a reader that listed them just before the roll-up
    // still sees a complete month; readers prefer agg/ once it exists.
    if (today >= addDays(`${nextMonth(month)}-01`, 2)) doneEvents.push(...list.map((e) => e.key));
  }

  await deleteKeys(store, [...expired, ...doneEvents]);
  return { deletedVisitorKeys: expired.length, deletedEvents: doneEvents.length, rolledUp };
}

// ---------------------------------------------------------------------------------------------
// HTTP

const NO_STORE = { "cache-control": "no-store" };
const STATS_CACHE = {
  // Browsers always revalidate; Netlify's CDN may reuse a response for up to 60 s.
  "cache-control": "public, max-age=0, must-revalidate",
  "netlify-cdn-cache-control": "public, durable, s-maxage=60",
  "netlify-vary": "query=range|ns",
};

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex",
      ...headers,
    },
  });
const fail = (status: number, error: string, headers: Record<string, string> = {}) =>
  json({ error }, status, { ...NO_STORE, ...headers });

/** False when an Origin header is present and names a different host. */
const sameOrigin = (request: Request, url: URL) => {
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  try {
    return new URL(origin).host === url.host;
  } catch {
    return false;
  }
};

const hasOwnerCookie = (request: Request) =>
  (request.headers.get("cookie") ?? "").split(";").some((pair) => {
    const [name, ...value] = pair.trim().split("=");
    return name === OWNER_COOKIE && value.join("=") === "1";
  });

/** Reads a JSON object body of at most MAX_BODY_BYTES bytes (any Content-Type, for sendBeacon). */
async function readBody(request: Request): Promise<{ value: Record<string, unknown> } | { status: number; error: string }> {
  const tooLarge = { status: 413, error: `Body must be at most ${MAX_BODY_BYTES} bytes` };
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return tooLarge;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (request.body) {
      const reader = request.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) {
          await reader.cancel().catch(() => {});
          return tooLarge;
        }
        chunks.push(value);
      }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (isObject(value)) return { value };
  } catch {
    // Unreadable body, invalid UTF-8 or invalid JSON
  }
  return { status: 400, error: "Body must be a JSON object" };
}

type Handler = (request: Request, url: URL, context: TrafficContext, deps: Required<TrafficDeps>, ns: Namespace) => Promise<Response>;

const hit: Handler = async (request, url, context, deps, ns) => {
  if (!sameOrigin(request, url)) return fail(403, "Cross-origin requests are not allowed");
  const body = await readBody(request);
  if ("status" in body) return fail(body.status, body.error);
  const { type, ref, owner } = body.value;
  if (type !== "view" && type !== "download") return fail(400, 'type must be "view" or "download"');
  if (ref !== undefined && typeof ref !== "string") return fail(400, "ref must be a string");

  const now = deps.now();
  const store = deps.store(ns);
  const ua = request.headers.get("user-agent") ?? "";
  const isOwner = hasOwnerCookie(request) || owner === true;
  let reason: "counted" | "owner" | "bot" | "repeat";
  let newSalt = false;

  if (isOwner) {
    reason = "owner"; // excluded browsers never change anything stored
  } else if (isBot(ua)) {
    reason = "bot";
  } else {
    const today = londonDay(now);
    const windowStartDay = londonDay(now - WINDOW_MS);
    const kind = type === "view" ? "v" : "d";
    const identity = `|${context.ip ?? ""}|${ua}`;
    // Just after midnight the 30-minute window reaches into yesterday, which had its own salt.
    const earlierLoad = async () => {
      if (windowStartDay === today) return null;
      const { salt } = await daySalt(store, windowStartDay, false);
      if (!salt) return null;
      return (await visitorState(store, `seen/${windowStartDay}/${await sha256(salt + identity)}/`, kind)).last;
    };
    const [{ salt, created }, earlier] = await Promise.all([daySalt(store, today, true), earlierLoad()]);
    newSalt = created;
    const hash = await sha256(salt + identity);
    const { counted, first } = await recordLoad(store, `seen/${today}/${hash}/`, kind, now, earlier);
    if (counted) {
      const id = randomHex(16);
      const key =
        kind === "v"
          ? `ev/${today}/v-${first ? "n" : "r"}-${countryOf(context.geo?.country?.code)}-${classifyReferrer(ref, url.hostname)}-${deviceOf(ua)}-${id}`
          : `ev/${today}/d-${id}`;
      const { modified } = await store.set(key, "1", { onlyIfNew: true });
      if (!modified) throw new Error("Event key collision");
    }
    reason = counted ? "counted" : "repeat";
  }

  const last30 = await readLast30(store, now);
  if (newSalt) {
    // First hit of the day: tidy up in the background too (the hourly job is the guarantee).
    const tidy = runMaintenance(store, now).catch((error) => console.error("[traffic] maintenance failed:", error));
    context.waitUntil?.(tidy);
  }
  const headers: Record<string, string> = { ...NO_STORE };
  if (isOwner) headers["set-cookie"] = OWNER_COOKIE_SET; // keeps the 400-day cookie from lapsing while in use
  return json({ counted: reason === "counted", reason, last30 }, 200, headers);
};

const stats: Handler = async (_request, url, _context, deps, ns) => {
  const values = url.searchParams.getAll("range");
  const range = values.length ? values[0] : "30d";
  if (values.length > 1 || !(RANGES as readonly string[]).includes(range)) {
    return fail(400, "range must be one of 30d, 90d, 12m, all");
  }
  const now = deps.now();
  const days = await loadDays(deps.store(ns), null, londonDay(now).slice(0, 7));
  return json(buildStats(days, range as Range, now), 200, STATS_CACHE);
};

const ownerRoute: Handler = async (request, url) => {
  if (!sameOrigin(request, url)) return fail(403, "Cross-origin requests are not allowed");
  if (request.method === "GET") return json({ excluded: hasOwnerCookie(request) }, 200, NO_STORE);
  const body = await readBody(request);
  if ("status" in body) return fail(body.status, body.error);
  const { exclude } = body.value;
  if (typeof exclude !== "boolean") return fail(400, "exclude must be true or false");
  return json({ excluded: exclude }, 200, { ...NO_STORE, "set-cookie": exclude ? OWNER_COOKIE_SET : OWNER_COOKIE_CLEAR });
};

const ROUTES: Record<string, { methods: string[]; handler: Handler }> = {
  "/api/hit": { methods: ["POST"], handler: hit },
  "/api/stats": { methods: ["GET"], handler: stats },
  "/api/owner": { methods: ["GET", "POST"], handler: ownerRoute },
};

class StorageTimeout extends Error {}

export async function handleTrafficRequest(request: Request, context: TrafficContext, deps: TrafficDeps): Promise<Response> {
  const url = new URL(request.url);
  // `netlify dev` re-sends a request that got a 403 or 404 as /path.html, /path/index.html and so
  // on, so map those back (on Netlify itself only the exact paths reach this function).
  const route = ROUTES[url.pathname.replace(/(?:\.html?|\/index\.html?)$/, "")];
  if (!route) return fail(404, "Not found");
  const ns = url.searchParams.getAll("ns");
  if (ns.length > 1 || (ns.length === 1 && ns[0] !== "test")) return fail(400, 'ns must be omitted or "test"');
  if (!route.methods.includes(request.method)) return fail(405, "Method not allowed", { allow: route.methods.join(", ") });

  const full: Required<TrafficDeps> = {
    store: deps.store,
    now: deps.now ?? (() => Date.now()),
    deadlineMs: deps.deadlineMs ?? DEADLINE_MS,
  };
  const work = route.handler(request, url, context, full, ns.length ? "test" : "live");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Answer now, but let the hit finish recording in the background (a claimed visit must be written).
      context.waitUntil?.(work.catch(() => {}));
      reject(new StorageTimeout("Storage timed out"));
    }, full.deadlineMs);
  });
  try {
    return await Promise.race([work, deadline]);
  } catch (error) {
    console.error(`[traffic] ${request.method} ${url.pathname} failed:`, error);
    return fail(500, error instanceof StorageTimeout ? "Storage timed out" : "Storage is unavailable");
  } finally {
    clearTimeout(timer);
  }
}
