export type HolidayStatus = "karnataka-official" | "national" | "karnataka-fixed" | "central-reference" | "restricted-reference" | "provisional" | "office-confirmed";
export type HolidayEntry = { date: string; name: string; status?: HolidayStatus; sourceLabel?: string };

export const HOLIDAY_PRESET_VERSION = 4;

const LEGACY_V2_PRESET_DATES = [
  "2026-01-15","2026-01-26","2026-03-19","2026-03-21","2026-03-31","2026-04-03","2026-04-14","2026-04-20","2026-05-01","2026-05-28","2026-06-26","2026-08-15","2026-08-26","2026-09-14","2026-10-02","2026-10-20","2026-10-21","2026-11-10","2026-11-27","2026-12-25",
  "2027-01-26","2027-05-01","2027-08-15","2027-10-02","2027-11-01","2027-12-25",
] as const;

// Exact dates present in the version-3 defaults. Missing dates in a v3 saved
// list are treated as deliberate user removals during the v3 -> v4 migration.
const OBSOLETE_V3_PRESET_ENTRIES = new Map<string,string>([
  ["2027-01-14","Makara Sankranti (estimated)"],
  ["2027-04-08","Ugadi (estimated)"],
  ["2027-10-30","Balipadyami / Deepavali (estimated)"],
]);

const LEGACY_V3_PRESET_DATES = [
  "2026-01-15","2026-01-26","2026-03-19","2026-03-21","2026-03-30","2026-04-03","2026-04-14","2026-04-20","2026-05-01","2026-05-28","2026-06-26","2026-08-15","2026-08-26","2026-09-14","2026-10-02","2026-10-20","2026-10-21","2026-11-01","2026-11-10","2026-11-27","2026-12-25",
  "2027-01-14","2027-01-26","2027-03-06","2027-03-10","2027-03-26","2027-04-08","2027-04-14","2027-04-19","2027-05-01","2027-05-09","2027-05-17","2027-05-20","2027-06-16","2027-08-15","2027-09-04","2027-09-29","2027-10-02","2027-10-09","2027-10-10","2027-10-15","2027-10-29","2027-10-30","2027-11-01","2027-11-14","2027-11-16","2027-12-25",
] as const;

export const HOLIDAY_PRESET_NOTICE =
  "2026 includes Karnataka DPAR general holidays plus a separately labelled restricted-holiday reference list; Mahavir Jayanti is revised to 30-Mar-2026. For 2027, Karnataka's State general-holiday notification had not been published as at 3-Nov-2026. The calendar includes the DoPT 2027 central-government gazetted list as a reference, Karnataka fixed-date holidays, and clearly marked provisional Karnataka festival estimates. Central-reference, restricted-reference and provisional dates are not automatically holidays for a private office. Confirm your firm's declared holiday list; moon-sighting dates may change.";

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Legacy localStorage arrays did not store a preset version. Detect the expanded v2 list
 * by overlap; smaller early lists are migrated as pre-v2 so new dates are added. */
export function inferHolidayPresetVersion(savedValue: unknown): number {
  if (!Array.isArray(savedValue)) return 0;
  const savedDates = new Set(savedValue.filter((item:any)=>item && validDate(item.date)).map((item:any)=>item.date));
  const earlyFixedOnlyDates = new Set([
    "2026-01-26","2026-05-01","2026-08-15","2026-10-02","2026-11-01",
    "2027-01-26","2027-05-01","2027-08-15","2027-10-02","2027-11-01",
  ]);
  const isEarlyFixedOnly = [...savedDates].every(date=>earlyFixedOnlyDates.has(date));
  if(isEarlyFixedOnly)return 0;
  const hasKnownV2Preset = LEGACY_V2_PRESET_DATES.some(date=>savedDates.has(date)&&!earlyFixedOnlyDates.has(date));
  return hasKnownV2Preset ? 2 : 0;
}

export function presetHolidays2026_2027(): HolidayEntry[] {
  const k2026: HolidayEntry[] = [
    ["2026-01-15","Makara Sankranti"],
    ["2026-01-26","Republic Day"],
    ["2026-03-19","Ugadi"],
    ["2026-03-21","Khutub-E-Ramzan (moon-sighting dependent)"],
    ["2026-03-30","Mahavir Jayanti (revised from 31-Mar-2026)"],
    ["2026-04-03","Good Friday"],
    ["2026-04-14","Dr. B.R. Ambedkar Jayanthi"],
    ["2026-04-20","Basava Jayanthi / Akshaya Tritiya"],
    ["2026-05-01","May Day"],
    ["2026-05-28","Bakrid (moon-sighting dependent)"],
    ["2026-06-26","Last Day of Moharam (moon-sighting dependent)"],
    ["2026-08-15","Independence Day"],
    ["2026-08-26","Eid-Milad (moon-sighting dependent)"],
    ["2026-09-14","Varasiddhi Vinayaka Vrata"],
    ["2026-10-02","Gandhi Jayanti"],
    ["2026-10-20","Mahanavami / Ayudhapooja"],
    ["2026-10-21","Vijayadasami"],
    ["2026-11-01","Karnataka Rajyotsava (falls on Sunday; no substitute holiday)"],
    ["2026-11-10","Balipadyami / Deepavali"],
    ["2026-11-27","Kanakadasa Jayanthi"],
    ["2026-12-25","Christmas"],
  ].map(([date, name]) => ({
    date,
    name,
    status: ["2026-01-26","2026-08-15","2026-10-02"].includes(date) ? "national" as const : date === "2026-11-01" ? "karnataka-fixed" as const : "karnataka-official" as const,
    sourceLabel: date === "2026-11-01"
      ? "Karnataka DPAR 2026 notification notes Rajyotsava falls on Sunday and is not a separate general-holiday date; no substitute is listed"
      : "Karnataka DPAR Notification No. DPAR 16 HHL 2025; Mahavir Jayanti amendment applied where relevant",
  }));

  const restricted2026: HolidayEntry[] = [
    ["2026-01-01","New Year's Day"],
    ["2026-01-27","Sri Madhvanavami"],
    ["2026-02-04","Shab-e-Barath"],
    ["2026-03-02","Holi Festival"],
    ["2026-03-17","Shab-e-Qadar (moon-sighting dependent)"],
    ["2026-03-20","Jumat-ul-Wida (moon-sighting dependent)"],
    ["2026-03-23","Devara Daseemayya Jayanthi"],
    ["2026-03-27","Sri Rama Navami"],
    ["2026-04-04","Holy Saturday"],
    ["2026-04-21","Sri Shankaracharya Jayanthi"],
    ["2026-04-22","Sri Ramanujacharya Jayanthi"],
    ["2026-08-21","Varamahalakshmi Vrata"],
    ["2026-08-27","Yajur Upakarma"],
    ["2026-08-28","Narayana Guru Jayanthi / Raksha Bandhan"],
    ["2026-09-04","Sri Krishna Janmashtami"],
    ["2026-09-08","Kanya Mariyamma Jayanthi"],
    ["2026-09-17","Vishwakarma Jayanthi"],
    ["2026-09-25","Ananta Padmanabha Vrata"],
    ["2026-11-24","Guru Nanak Jayanthi"],
    ["2026-11-26","Huttari Festival (Kodagu reference)"],
    ["2026-12-24","Christmas Eve"],
  ].map(([date,name])=>({
    date,
    name,
    status:"restricted-reference" as const,
    sourceLabel:"Karnataka DPAR 2026 Notification-I restricted-holiday annexure; state-government employees may use subject to approval, not an automatic private-office closure",
  }));

  // DoPT O.M. F. No. 12/2/2023-JCA dated 16-Jul-2026 lists 17 gazetted
  // holidays for Central Government offices in Delhi/New Delhi. Two entries
  // fall on 15-Aug-2027, so the calendar stores one combined date row.
  const central2027: HolidayEntry[] = [
    {date:"2027-01-26",name:"Republic Day",status:"national",sourceLabel:"National fixed-date holiday; also in DoPT 2027 list"},
    {date:"2027-03-10",name:"Id-ul-Fitr (moon-sighting dependent)",status:"central-reference",sourceLabel:"DoPT O.M. F. No. 12/2/2023-JCA dated 16-Jul-2026; date may change by local moon-sighting direction"},
    {date:"2027-03-23",name:"Holi",status:"central-reference",sourceLabel:"DoPT central-government gazetted holiday reference 2027"},
    {date:"2027-03-26",name:"Good Friday",status:"central-reference",sourceLabel:"DoPT central-government gazetted holiday reference 2027"},
    {date:"2027-04-15",name:"Ram Navami",status:"central-reference",sourceLabel:"DoPT central-government gazetted holiday reference 2027"},
    {date:"2027-04-19",name:"Mahavir Jayanti",status:"central-reference",sourceLabel:"DoPT central-government gazetted holiday reference 2027"},
    {date:"2027-05-17",name:"Id-ul-Zuha / Bakrid (moon-sighting dependent)",status:"central-reference",sourceLabel:"DoPT central-government gazetted holiday reference 2027; date may change"},
    {date:"2027-05-20",name:"Buddha Purnima",status:"central-reference",sourceLabel:"DoPT central-government gazetted holiday reference 2027"},
    {date:"2027-06-16",name:"Muharram (moon-sighting dependent)",status:"central-reference",sourceLabel:"DoPT central-government gazetted holiday reference 2027; date may change"},
    {date:"2027-08-15",name:"Independence Day / Milad-un-Nabi (moon-sighting dependent)",status:"national",sourceLabel:"National fixed-date holiday; DoPT list also places Milad on the same date"},
    {date:"2027-08-25",name:"Janmashtami (Vaishnav)",status:"central-reference",sourceLabel:"DoPT central-government gazetted holiday reference 2027"},
    {date:"2027-10-02",name:"Gandhi Jayanti",status:"national",sourceLabel:"National fixed-date holiday; also in DoPT 2027 list"},
    {date:"2027-10-09",name:"Dussehra / Maha Navami / Ayudhapooja (Karnataka date subject to State notification)",status:"central-reference",sourceLabel:"DoPT central-government gazetted holiday reference 2027; Karnataka may notify Maha Navami / Ayudhapooja on this date"},
    {date:"2027-10-29",name:"Diwali / Balipadyami / Deepavali (Karnataka estimate)",status:"provisional",sourceLabel:"DoPT central-government gazetted date; Karnataka holiday calendars place Balipadyami / Deepavali on this date, pending DPAR notification"},
    {date:"2027-11-14",name:"Guru Nanak Jayanti",status:"central-reference",sourceLabel:"DoPT central-government gazetted holiday reference 2027"},
    {date:"2027-12-25",name:"Christmas",status:"central-reference",sourceLabel:"DoPT central-government gazetted holiday reference 2027"},
  ];

  const karnatakaFixed2027: HolidayEntry[] = [
    {date:"2027-05-01",name:"May Day",status:"karnataka-fixed",sourceLabel:"Karnataka fixed-date observance; confirm the firm's declared holiday list"},
    {date:"2027-11-01",name:"Karnataka Rajyotsava",status:"karnataka-fixed",sourceLabel:"Karnataka fixed-date observance; confirm the firm's declared holiday list"},
  ];

  const provisional2027: HolidayEntry[] = [
    {date:"2027-01-15",name:"Makara Sankranti (estimated)",status:"provisional",sourceLabel:"Karnataka festival-date estimate; verify against the 2027 State notification"},
    {date:"2027-03-06",name:"Maha Shivaratri (estimated)",status:"provisional",sourceLabel:"Karnataka festival-date estimate; verify against the 2027 State notification"},
    {date:"2027-04-07",name:"Ugadi (estimated)",status:"provisional",sourceLabel:"Karnataka festival-date estimate; verify against the 2027 State notification"},
    {date:"2027-04-14",name:"Dr. B.R. Ambedkar Jayanthi (State holiday estimate)",status:"provisional",sourceLabel:"Fixed observance date; Karnataka 2027 general-holiday notification pending"},
    {date:"2027-09-04",name:"Ganesh Chaturthi / Varasiddhi Vinayaka Vrata (estimated)",status:"provisional",sourceLabel:"Karnataka festival-date estimate; verify against the 2027 State notification"},
    {date:"2027-05-09",name:"Basava Jayanthi (Karnataka estimate)",status:"provisional",sourceLabel:"Karnataka 2027 holiday-calendar estimates; verify against the DPAR State notification"},
    {date:"2027-09-29",name:"Mahalaya Amavasye (Karnataka estimate)",status:"provisional",sourceLabel:"Karnataka 2027 holiday-calendar estimates; verify against the DPAR State notification"},
    {date:"2027-10-10",name:"Vijayadashami (Karnataka estimate)",status:"provisional",sourceLabel:"Karnataka 2027 holiday-calendar estimates; central-government Dussehra date is listed separately on 09-Oct"},
    {date:"2027-10-15",name:"Maharshi Valmiki Jayanti (Karnataka estimate)",status:"provisional",sourceLabel:"Karnataka 2027 holiday-calendar estimates; verify against the DPAR State notification"},
    {date:"2027-10-28",name:"Naraka Chaturdashi (Karnataka estimate)",status:"provisional",sourceLabel:"Karnataka 2027 holiday-calendar estimates; verify against the DPAR State notification"},
    {date:"2027-11-16",name:"Kanakadasa Jayanthi (Karnataka estimate)",status:"provisional",sourceLabel:"Karnataka 2027 holiday-calendar estimates; verify against the DPAR State notification"},
  ];

  return [...k2026,...restricted2026,...central2027,...karnatakaFixed2027,...provisional2027].sort((a,b)=>a.date.localeCompare(b.date));
}

/** Merge defaults with saved edits while preserving dates a manager deliberately removed. */
export function mergePresetHolidays(savedValue: unknown, presetVersion = 0): HolidayEntry[] {
  const saved = Array.isArray(savedValue)
    ? savedValue.filter((item: any) => item && validDate(item.date) && typeof item.name === "string") as HolidayEntry[]
    : [];
  if (presetVersion >= HOLIDAY_PRESET_VERSION) return [...saved].sort((a,b)=>a.date.localeCompare(b.date));

  const defaults = presetHolidays2026_2027();
  const defaultByDate = new Map(defaults.map(item=>[item.date,item]));
  const mergeSaved = (item:HolidayEntry, base?:HolidayEntry):HolidayEntry => base
    ? {
        ...base,
        ...item,
        // Keep an explicit office confirmation, but refresh stale preset status/source metadata.
        status: item.status === "office-confirmed" ? "office-confirmed" : (base.status || item.status),
        sourceLabel: base.sourceLabel || item.sourceLabel,
      }
    : item;

  if (presetVersion === 3) {
    const retainedSaved = saved.filter(item => {
      const obsoleteName = OBSOLETE_V3_PRESET_ENTRIES.get(item.date);
      if (!obsoleteName || item.status === "office-confirmed") return true;
      return item.name !== obsoleteName;
    });
    const savedDates = new Set(retainedSaved.map(item=>item.date));
    const removedLegacyDates = new Set<string>(LEGACY_V3_PRESET_DATES.filter(date=>!savedDates.has(date)));
    const merged = new Map<string,HolidayEntry>();
    for (const item of defaults) if (!removedLegacyDates.has(item.date)) merged.set(item.date,item);
    for (const item of retainedSaved) merged.set(item.date,mergeSaved(item,defaultByDate.get(item.date)));
    return [...merged.values()].sort((a,b)=>a.date.localeCompare(b.date));
  }

  if (presetVersion === 2) {
    const savedDates = new Set(saved.map(item=>item.date));
    const removedLegacyDates = new Set<string>(LEGACY_V2_PRESET_DATES.filter(date=>!savedDates.has(date)));
    const legacyDates = new Set<string>(LEGACY_V2_PRESET_DATES);
    const merged = new Map<string,HolidayEntry>();
    for (const item of defaults) {
      if (item.date === "2026-03-30" && removedLegacyDates.has("2026-03-31")) continue;
      if (legacyDates.has(item.date) && removedLegacyDates.has(item.date)) continue;
      merged.set(item.date,item);
    }
    for (const item of saved) {
      if (item.date === "2026-03-31") continue;
      if (legacyDates.has(item.date) && removedLegacyDates.has(item.date)) continue;
      merged.set(item.date,mergeSaved(item,defaultByDate.get(item.date)));
    }
    return [...merged.values()].sort((a,b)=>a.date.localeCompare(b.date));
  }

  const merged = new Map<string,HolidayEntry>();
  for (const item of defaults) merged.set(item.date,item);
  for (const item of saved) merged.set(item.date,mergeSaved(item,defaultByDate.get(item.date)));
  return [...merged.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
