const MAX_SUPPORTED_BACKUP_SCHEMA_VERSION = 2.7;

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year,month,day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear()===year && date.getUTCMonth()===month-1 && date.getUTCDate()===day;
}

function optionalArray(data: Record<string, any>, key: string, validate: (item:any)=>boolean): boolean {
  if (!(key in data)) return true;
  return Array.isArray(data[key]) && data[key].every(validate);
}

/** Strictly validates a backup before any live workspace state is replaced. */
export function isValidOfficeFlowBackup(value: unknown): boolean {
  if (!isRecord(value) || typeof value.schemaVersion!=="number" || value.schemaVersion<1 || value.schemaVersion>MAX_SUPPORTED_BACKUP_SCHEMA_VERSION) return false;
  if (!Array.isArray(value.tasks) || !value.tasks.every((task:any) =>
    isRecord(task) && typeof task.id === "string" && typeof task.title === "string" &&
    Array.isArray(task.juniors) && task.juniors.every((name:any)=>typeof name==="string")
  )) return false;
  if (!isRecord(value.juniorDirectory) || Object.values(value.juniorDirectory).some(name=>typeof name!=="string")) return false;
  if (!Array.isArray(value.clientDirectory) || !value.clientDirectory.every((client:any)=>isRecord(client)&&typeof client.name==="string")) return false;
  if (!optionalArray(value,"clientGroups",(item:any)=>isRecord(item)&&typeof item.id==="string"&&typeof item.name==="string"&&Array.isArray(item.clientNames)&&item.clientNames.every((name:any)=>typeof name==="string"))) return false;
  if (!optionalArray(value,"matterRounds",(item:any)=>isRecord(item)&&typeof item.id==="string"&&typeof item.matterId==="string"&&typeof item.roundType==="string"&&Number.isFinite(item.sequenceNumber)&&Array.isArray(item.attachments))) return false;
  if (!optionalArray(value,"matterTaskTypes",(item:any)=>isRecord(item)&&typeof item.id==="string"&&typeof item.matterType==="string"&&typeof item.taskType==="string"&&(item.act==="Income-tax Act, 1961"||item.act==="Income-tax Act, 2025")&&typeof item.active==="boolean"&&Number.isFinite(item.sortOrder))) return false;
  if (!optionalArray(value,"matterTypeNames",(item:any)=>typeof item==="string")) return false;
  if (!optionalArray(value,"compOffEntries",(item:any)=>isRecord(item)&&typeof item.id==="string"&&(item.type==="earned"||item.type==="used")&&validDate(item.date))) return false;
  if (!optionalArray(value,"compOffHolidays",(item:any)=>isRecord(item)&&validDate(item.date)&&typeof item.name==="string")) return false;
  if (!optionalArray(value,"meetings",(item:any)=>isRecord(item)&&typeof item.id==="string"&&validDate(item.date)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(item.start)&&Number.isFinite(item.duration)&&item.duration>0&&typeof item.subject==="string"&&typeof item.client==="string")) return false;
  if (!optionalArray(value,"auditLog",(item:any)=>isRecord(item)&&typeof item.id==="string"&&typeof item.at==="string"&&typeof item.action==="string")) return false;
  if ("dark" in value && typeof value.dark!=="boolean") return false;
  if ("remindersEnabled" in value && typeof value.remindersEnabled!=="boolean") return false;
  if ("profileDisplayName" in value && typeof value.profileDisplayName!=="string") return false;
  return true;
}
