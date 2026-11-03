import { mergeStarterTaskTypes, mergeMatterTypeNames, normalizeTaxYear } from "./income-tax-matters";
import { normalizeCompOffEntries } from "./comp-off";
import { mergePresetHolidays, HOLIDAY_PRESET_VERSION } from "./officeflow-holidays";

export const OFFICEFLOW_BACKUP_SCHEMA_VERSION = 2.8;
const MAX_SUPPORTED_BACKUP_SCHEMA_VERSION = OFFICEFLOW_BACKUP_SCHEMA_VERSION;

const TASK_STATUSES = new Set([
  "To Do","In Progress","Waiting for client","Waiting for documents","Ready for review","Under Review",
  "Rework required","Approved","Filed / completed","On hold","Done","Partially replied","Fully replied","Closed",
]);
const PRIORITIES = new Set(["Urgent","High","Medium","Low"]);
const ACTS = new Set(["Income-tax Act, 1961","Income-tax Act, 2025"]);
const HOLIDAY_STATUSES = new Set(["karnataka-official","national","karnataka-fixed","central-reference","restricted-reference","provisional","office-confirmed"]);

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year,month,day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear()===year && date.getUTCMonth()===month-1 && date.getUTCDate()===day;
}

function optionalString(data:Record<string,any>, key:string):boolean {
  return !(key in data) || typeof data[key] === "string";
}

function optionalArray(data: Record<string, any>, key: string, validate: (item:any)=>boolean): boolean {
  if (!(key in data)) return true;
  return Array.isArray(data[key]) && data[key].every(validate);
}

function validDocument(value:unknown):boolean {
  return isRecord(value) && typeof value.name==="string" &&
    (typeof value.dataUrl==="string" || typeof value.url==="string") &&
    (!("size" in value) || (Number.isFinite(value.size) && value.size>=0));
}

function validTask(value:unknown):boolean {
  if(!isRecord(value) || typeof value.id!=="string" || typeof value.title!=="string") return false;
  if("juniors" in value && (!Array.isArray(value.juniors) || !value.juniors.every((name:any)=>typeof name==="string"))) return false;
  if("applicableAct" in value && !ACTS.has(value.applicableAct)) return false;
  if("status" in value && !TASK_STATUSES.has(value.status)) return false;
  if("priority" in value && !PRIORITIES.has(value.priority)) return false;
  const stringFields=["description","category","project","client","due","financialYear","assessmentYear","taxYear","taskType","preparer","reviewer","notes","matterName","matterType","documentLinks","statutoryDue","internalDue","noticeDue","reviewComments","lastClientFollowUp","nextClientFollowUp","lastFollowUpOutcome","filedDate","filingAck","lastProgressUpdate","completedAt","roundId","createdByUserId"];
  if(stringFields.some(key=>!optionalString(value,key))) return false;
  if("approvalStatus" in value && !["pending","approved","changes_requested"].includes(value.approvalStatus)) return false;
  if("checklist" in value && (!Array.isArray(value.checklist) || !value.checklist.every((item:any)=>isRecord(item)&&typeof item.text==="string"&&typeof item.done==="boolean"))) return false;
  if("uploadedDocuments" in value && (!Array.isArray(value.uploadedDocuments) || !value.uploadedDocuments.every(validDocument))) return false;
  if("filingAckDocument" in value && value.filingAckDocument!==null && !validDocument(value.filingAckDocument)) return false;
  if("activity" in value && (!Array.isArray(value.activity) || !value.activity.every((item:any)=>isRecord(item)&&typeof item.at==="string"&&typeof item.message==="string"))) return false;
  for(const key of ["billingAmount","amountPaid","reworkCount"]) if(key in value && (!Number.isFinite(value[key]) || value[key]<0)) return false;
  return true;
}

/** Validate all persisted collections before restore can replace any live state. */
export function isValidOfficeFlowBackup(value: unknown): boolean {
  if (!isRecord(value) || !Number.isFinite(value.schemaVersion) || value.schemaVersion<1 || value.schemaVersion>MAX_SUPPORTED_BACKUP_SCHEMA_VERSION) return false;
  if (!Array.isArray(value.tasks) || !value.tasks.every(validTask)) return false;

  // Missing fields are migrated for old backups; explicit null/invalid values are rejected.
  if ("juniorDirectory" in value && (!isRecord(value.juniorDirectory) || Object.values(value.juniorDirectory).some(name=>typeof name!=="string"))) return false;
  if ("clientDirectory" in value && (!Array.isArray(value.clientDirectory) || !value.clientDirectory.every((client:any)=>isRecord(client)&&typeof client.name==="string"&&optionalString(client,"pan")&&optionalString(client,"entityType")&&optionalString(client,"groupId")))) return false;
  if (!optionalArray(value,"clientGroups",(item:any)=>isRecord(item)&&typeof item.id==="string"&&typeof item.name==="string"&&Array.isArray(item.clientNames)&&item.clientNames.every((name:any)=>typeof name==="string"))) return false;
  if (!optionalArray(value,"matterRounds",(item:any)=>isRecord(item)&&typeof item.id==="string"&&typeof item.matterId==="string"&&typeof item.roundType==="string"&&Number.isFinite(item.sequenceNumber)&&Array.isArray(item.attachments)&&item.attachments.every((a:any)=>isRecord(a)&&typeof a.name==="string"&&optionalString(a,"dataUrl")&&optionalString(a,"url")))) return false;
  if (!optionalArray(value,"matterTaskTypes",(item:any)=>isRecord(item)&&typeof item.id==="string"&&typeof item.matterType==="string"&&typeof item.taskType==="string"&&(!("act" in item)||ACTS.has(item.act))&&(!("active" in item)||typeof item.active==="boolean")&&(!("sortOrder" in item)||Number.isFinite(item.sortOrder)))) return false;
  if (!optionalArray(value,"matterTypeNames",(item:any)=>typeof item==="string")) return false;
  if (!optionalArray(value,"compOffEntries",(item:any)=>isRecord(item)&&typeof item.id==="string"&&(item.type==="earned"||item.type==="used")&&validDate(item.date)&&optionalString(item,"notes")&&optionalString(item,"earnedEntryId")&&(!("expiresAt" in item)||validDate(item.expiresAt)))) return false;
  if (!optionalArray(value,"compOffHolidays",(item:any)=>isRecord(item)&&validDate(item.date)&&typeof item.name==="string"&&(!("status" in item)||HOLIDAY_STATUSES.has(item.status))&&optionalString(item,"sourceLabel"))) return false;
  if (!optionalArray(value,"meetings",(item:any)=>isRecord(item)&&typeof item.id==="string"&&validDate(item.date)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(item.start)&&Number.isFinite(item.duration)&&item.duration>0&&item.duration<=1440&&typeof item.subject==="string"&&typeof item.client==="string"&&optionalString(item,"contact")&&optionalString(item,"mode")&&optionalString(item,"recurrence"))) return false;
  if (!optionalArray(value,"auditLog",(item:any)=>isRecord(item)&&typeof item.id==="string"&&typeof item.at==="string"&&typeof item.action==="string"&&optionalString(item,"actor")&&optionalString(item,"taskTitle")&&optionalString(item,"details"))) return false;
  if ("dark" in value && typeof value.dark!=="boolean") return false;
  if ("remindersEnabled" in value && typeof value.remindersEnabled!=="boolean") return false;
  if ("profileDisplayName" in value && typeof value.profileDisplayName!=="string") return false;
  if ("compOffHolidayPresetVersion" in value && (!Number.isInteger(value.compOffHolidayPresetVersion)||value.compOffHolidayPresetVersion<0||value.compOffHolidayPresetVersion>HOLIDAY_PRESET_VERSION)) return false;
  if ("exportedAt" in value && typeof value.exportedAt!=="string") return false;
  return true;
}

/** Migrate a validated legacy backup into the current workspace shape without discarding user records. */
export function migrateOfficeFlowBackup(value: unknown): Record<string, any> {
  if (!isValidOfficeFlowBackup(value)) throw new Error("Invalid or unsupported OfficeFlow backup");
  const data=value as Record<string,any>;
  const tasks=data.tasks.map((task:any)=>({
    ...task,
    description:typeof task.description==="string"?task.description:"",
    priority:PRIORITIES.has(task.priority)?task.priority:"Medium",
    category:typeof task.category==="string"?task.category:"Income tax",
    project:typeof task.project==="string"?task.project:"",
    client:typeof task.client==="string"?task.client:"",
    due:typeof task.due==="string"?task.due:"",
    status:TASK_STATUSES.has(task.status)?task.status:"To Do",
    juniors:Array.isArray(task.juniors)?task.juniors:[],
    applicableAct:task.applicableAct==="Income-tax Act, 2025"?"Income-tax Act, 2025":"Income-tax Act, 1961",
    financialYear:typeof task.financialYear==="string"?task.financialYear:"",
    assessmentYear:typeof task.assessmentYear==="string"?task.assessmentYear:"",
    taxYear:task.applicableAct==="Income-tax Act, 2025"?(normalizeTaxYear(task.taxYear||"")||task.taxYear||""):"",
    checklist:Array.isArray(task.checklist)?task.checklist:[],
    uploadedDocuments:Array.isArray(task.uploadedDocuments)?task.uploadedDocuments:[],
    activity:Array.isArray(task.activity)?task.activity:[],
  }));
  const presetVersion=Number(data.compOffHolidayPresetVersion||0);
  const legacyTaskTypes=Array.isArray(data.matterTaskTypes)?data.matterTaskTypes.map((item:any,index:number)=>({...item,act:ACTS.has(item.act)?item.act:"Income-tax Act, 1961",active:typeof item.active==="boolean"?item.active:true,sortOrder:Number.isFinite(item.sortOrder)?item.sortOrder:index})):[];
  return {
    ...data,
    schemaVersion:OFFICEFLOW_BACKUP_SCHEMA_VERSION,
    tasks,
    juniorDirectory:data.juniorDirectory||{},
    clientDirectory:Array.isArray(data.clientDirectory)?data.clientDirectory:[],
    clientGroups:Array.isArray(data.clientGroups)?data.clientGroups:[],
    matterRounds:Array.isArray(data.matterRounds)?data.matterRounds:[],
    matterTaskTypes:mergeStarterTaskTypes(legacyTaskTypes),
    matterTypeNames:mergeMatterTypeNames(data.matterTypeNames),
    compOffEntries:normalizeCompOffEntries(data.compOffEntries),
    compOffHolidays:mergePresetHolidays(data.compOffHolidays,presetVersion),
    compOffHolidayPresetVersion:HOLIDAY_PRESET_VERSION,
    meetings:Array.isArray(data.meetings)?data.meetings:[],
    auditLog:Array.isArray(data.auditLog)?data.auditLog:[],
    profileDisplayName:typeof data.profileDisplayName==="string"?data.profileDisplayName:"Charan Reddy",
    dark:typeof data.dark==="boolean"?data.dark:true,
    remindersEnabled:typeof data.remindersEnabled==="boolean"?data.remindersEnabled:false,
  };
}
