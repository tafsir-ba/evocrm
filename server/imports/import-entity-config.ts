import "server-only";

import type { ImportEntityType } from "@/lib/imports";
import type { CreateLeadInput } from "@/server/validation/leads";
import type { CreatePropertyInput } from "@/server/validation/properties";

export type ImportFieldType =
  | "string"
  | "number"
  | "currency"
  | "email"
  | "phone"
  | "date"
  | "dictionary"
  | "tags"
  | "member"
  | "project"
  | "array"
  | "fullName";

export type ImportFieldConfig = {
  key: string;
  label: string;
  required?: boolean;
  aliases: string[];
  type: ImportFieldType;
  helpText?: string;
  dictionaryType?: string;
  supportsDefault?: boolean;
};

export type NormalizedImportRow = Record<string, unknown>;

export type ImportContext = {
  workspaceId: string;
  actorId: string;
  defaultCurrency: string;
  triggerAutomationForImportedLeads?: boolean;
  dictionaryLookup: Map<string, Map<string, string>>;
  projectLookup: Map<string, string>;
  memberLookup: Map<string, string>;
  tagLookup: Map<string, string>;
};

export type ImportCreateResult = {
  entityId: string;
  warnings: string[];
};

export type ImportEntityConfig = {
  entityType: ImportEntityType;
  label: string;
  requiredPermission: "lead:create" | "property:create";
  fields: ImportFieldConfig[];
  buildCreateInput(
    row: NormalizedImportRow,
    context: ImportContext,
  ): Promise<unknown>;
  createRecord(
    input: unknown,
    context: ImportContext,
  ): Promise<ImportCreateResult>;
};

export type LeadImportInput = CreateLeadInput;
export type PropertyImportInput = CreatePropertyInput;
