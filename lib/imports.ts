export const IMPORT_ENTITY_TYPES = ["lead", "property"] as const;

export type ImportEntityType = (typeof IMPORT_ENTITY_TYPES)[number];

export const IMPORT_JOB_STATUSES = [
  "draft",
  "parsing",
  "mapped",
  "validating",
  "ready",
  "processing",
  "completed",
  "completed_with_errors",
  "failed",
  "cancelled",
] as const;

export type ImportJobStatus = (typeof IMPORT_JOB_STATUSES)[number];

export const IMPORT_FIELD_TYPES = [
  "string",
  "number",
  "currency",
  "email",
  "phone",
  "date",
  "dictionary",
  "tags",
  "member",
  "project",
  "array",
  "fullName",
] as const;

export type ImportFieldType = (typeof IMPORT_FIELD_TYPES)[number];

export type ImportFieldConfigResponse = {
  key: string;
  label: string;
  required: boolean;
  aliases: string[];
  type: ImportFieldType;
  helpText?: string;
  dictionaryType?: string;
  supportsDefault: boolean;
};

export type ImportEntityConfigResponse = {
  entityType: ImportEntityType;
  label: string;
  fields: ImportFieldConfigResponse[];
};

export type ImportColumnPreview = {
  index: number;
  header: string;
  sampleValues: string[];
  suggestedField: string | null;
};

export type ImportPreviewRow = {
  rowNumber: number;
  values: string[];
};

export type ImportMappingEntry = {
  sourceColumnIndex: number;
  targetField: string | null;
};

export type ImportDefaults = Record<string, string>;

export type ImportRowIssue = {
  rowNumber: number;
  field?: string;
  message: string;
  severity: "error" | "warning";
};

export type ImportValidationSummary = {
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
};

export type ImportJobSummary = {
  id: string;
  entityType: ImportEntityType;
  status: ImportJobStatus;
  fileName: string;
  fileSize: number;
  mimeType: string;
  sheetName: string | null;
  headerRowIndex: number;
  rowCount: number;
  mappings: ImportMappingEntry[];
  defaults: ImportDefaults;
  validationSummary: ImportValidationSummary | null;
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const IMPORT_EXECUTE_MODES = ["valid_rows_only", "strict"] as const;

export type ImportExecuteMode = (typeof IMPORT_EXECUTE_MODES)[number];

export const MAX_IMPORT_FILE_SIZE_BYTES = 25 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 10_000;
export const MAX_IMPORT_COLUMNS = 200;
export const IMPORT_PREVIEW_ROW_LIMIT = 50;

export const SUPPORTED_IMPORT_MIME_TYPES = [
  "text/csv",
  "application/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export const SUPPORTED_IMPORT_EXTENSIONS = [".csv", ".xlsx", ".xls"] as const;

export function isImportEntityType(value: string): value is ImportEntityType {
  return (IMPORT_ENTITY_TYPES as readonly string[]).includes(value);
}

export function formatImportFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
