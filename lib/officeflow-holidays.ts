export type HolidayStatus = "karnataka-official" | "national" | "karnataka-fixed" | "central-reference" | "provisional" | "office-confirmed";
export type HolidayEntry = { date: string; name: string; status?: HolidayStatus; sourceLabel?: string };

const LEGACY_V2_PRESET_DATES = [
  "2026-01-15","2026-01-26","2026-03-19","2026-03-21","2026-03-31","2026-04-03","2026-04-14","2026-04-20","2026-05-01","2026-05-28","2026-06-26","2026-08-15","2026-08-26","2026-09-14","2026-10-02","2026-10-20","2026-10-21","2026-11-10","2026-11-27","2026-12-25",
  "2027-01-26","2027-05-01","2027-08-15","2027-10-02","2027-11-01","2027-12-25",
] as const;

export const HOLIDAY_PRESET_NOTICE =
  "2026 uses Karnataka's DPAR general-holiday notification, updated for the 30-Mar-2026 Mahavir Jayanti amendment. For 2027, the Karnataka State general-holiday notification was not yet published as at 3-Nov-2026: the calendar therefore combines national/fixed dates, the DoPT central reference list and clearly marked Karnataka festival estimates. Central and provisional dates are not automatically holidays for a private office. Under Karnataka's holiday law, private establishments generally declare the five fixed holidays plus five festival holidays selected in consultation with employees. Use Confirm for office only for dates your firm actually observes; the firm's declared holiday list governs.";

export function presetHolidays2026_2027(): HolidayEntry[] {
  const k2026: HolidayEntry[] = [
    ["2026-01-15","Makara Sankranti"],["2026-01-26","Republic Day"],["2026-03-19","Ugadi"],["2026-03-21","Khutub-E-Ramzan (moon-sighting dependent)"],
    ["2026-03-30","Mahaveera Jayanthi (revised from 31-Mar-2026)"],["2026-04-03","Good Friday"],["2026-04-14","Dr. B.R. Ambedkar Jayanthi"],["2026-04-20","Basava Jayanthi / Akshaya Tritiya"],
    ["2026-05-01","May Day"],["2026-05-28","Bakrid (moon-sighting dependent)"],["2026-06-26","Last Day of Moharam (moon-sighting dependent)"],["2026-08-15","Independence Day"],
    ["2026-08-26","Eid-Milad (moon-sighting dependent)"],["2026-09-14","Varasiddhi Vinayaka Vrata"],["2026-10-02","Gandhi Jayanti"],["2026-10-20","Mahanavami / Ayudhapooja"],
    ["2026-10-21","Vijayadasami"],["2026-11-01","Karnataka Rajyotsava (falls on Sunday)"],["2026-11-10","Balipadyami / Deepavali"],["2026-11-27","Kanakadasa Jayanthi"],["2026-12-25","Christmas"],
  ].map(([date,name]) => ({ date, name, status: "karnataka-official" as const, sourceLabel: "Karnataka DPAR 16 HHL 2025; 30-Mar amendment applied" }));

  const central2027: HolidayEntry[] = [
    {date:"2027-01-26",name:"Republic Day",status:"national",sourceLabel:"National fixed-date holiday"},
    {date:"2027-03-10",name:"Id-ul-Fitr (moon-sighting dependent)",status:"central-reference",sourceLabel:"DoPT central gazetted holiday list 2027"},
    {date:"2027-03-26",name:"Good Friday",status:"central-reference",sourceLabel:"DoPT central gazetted holiday list 2027"},
    {date:"2027-04-19",name:"Mahavir Jayanti",status:"central-reference",sourceLabel:"DoPT central gazetted holiday list 2027"},
    {date:"2027-05-17",name:"Id-ul-Zuha / Bakrid (moon-sighting dependent)",status:"central-reference",sourceLabel:"DoPT central gazetted holiday list 2027"},
    {date:"2027-05-20",name:"Buddha Purnima",status:"central-reference",sourceLabel:"DoPT central gazetted holiday list 2027"},
    {date:"2027-06-16",name:"Muharram (moon-sighting dependent)",status:"central-reference",sourceLabel:"DoPT central gazetted holiday list 2027"},
    {date:"2027-08-15",name:"Independence Day / Milad-un-Nabi (moon-sighting dependent)",status:"national",sourceLabel:"National holiday and DoPT central list 2027"},
    {date:"2027-10-02",name:"Gandhi Jayanti",status:"national",sourceLabel:"National fixed-date holiday"},
    {date:"2027-10-09",name:"Mahanavami / Dussehra (central gazetted date)",status:"central-reference",sourceLabel:"DoPT central gazetted holiday list 2027; Karnataka observance may differ"},
    {date:"2027-10-29",name:"Diwali / Deepavali",status:"central-reference",sourceLabel:"DoPT central gazetted holiday list 2027"},
    {date:"2027-11-14",name:"Guru Nanak Jayanti",status:"central-reference",sourceLabel:"DoPT central gazetted holiday list 2027"},
    {date:"2027-12-25",name:"Christmas",status:"central-reference",sourceLabel:"DoPT central gazetted holiday list 2027"},
  ];

  const karnatakaFixed2027: HolidayEntry[] = [
    {date:"2027-05-01",name:"May Day",status:"karnataka-fixed",sourceLabel:"Karnataka statutory fixed holiday; state notification pending"},
    {date:"2027-11-01",name:"Karnataka Rajyotsava",status:"karnataka-fixed",sourceLabel:"Karnataka statutory fixed holiday; state notification pending"},
  ];

  const provisional2027: HolidayEntry[] = [
    ["2027-01-14","Makara Sankranti"],["2027-03-06","Maha Shivaratri"],["2027-04-08","Ugadi"],["2027-04-14","Dr. B.R. Ambedkar Jayanthi"],
    ["2027-05-09","Basava Jayanthi"],["2027-09-04","Ganesh Chaturthi"],["2027-09-29","Mahalaya Amavasye"],["2027-10-10","Vijayadashami"],
    ["2027-10-15","Maharishi Valmiki Jayanthi"],["2027-10-30","Balipadyami / Deepavali holiday"],["2027-11-16","Kanakadasa Jayanthi"],
  ].map(([date,name]) => ({date,name,status:"provisional" as const,sourceLabel:"Karnataka 2027 festival-date estimate; verify when State notification is issued"}));

  return [...k2026,...central2027,...karnatakaFixed2027,...provisional2027].sort((a,b)=>a.date.localeCompare(b.date));
}

export function mergePresetHolidays(savedValue: unknown, presetVersion = 0): HolidayEntry[] {
  const saved = Array.isArray(savedValue)
    ? savedValue.filter((item: any) => item && typeof item.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && typeof item.name === "string") as HolidayEntry[]
    : [];
  if (presetVersion >= 3) return [...saved].sort((a,b)=>a.date.localeCompare(b.date));

  const defaults = presetHolidays2026_2027();
  const defaultByDate = new Map(defaults.map(item=>[item.date,item]));
  const mergeSaved = (item:HolidayEntry, base?:HolidayEntry):HolidayEntry => base
    ? {...base,...item,status:item.status||base.status,sourceLabel:item.sourceLabel||base.sourceLabel}
    : item;

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
