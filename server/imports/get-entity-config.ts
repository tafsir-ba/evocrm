import "server-only";

import type { ImportEntityType } from "@/lib/imports";
import type { ImportEntityConfig } from "@/server/imports/import-entity-config";
import { leadImportConfig } from "@/server/imports/entities/lead-import-config";
import { propertyImportConfig } from "@/server/imports/entities/property-import-config";
import { AppError } from "@/server/errors";

const ENTITY_CONFIGS: Record<ImportEntityType, ImportEntityConfig> = {
  lead: leadImportConfig,
  property: propertyImportConfig,
};

export function getImportEntityConfig(
  entityType: ImportEntityType,
): ImportEntityConfig {
  const config = ENTITY_CONFIGS[entityType];

  if (!config) {
    throw new AppError("VALIDATION_ERROR", `Unsupported entity type: ${entityType}`);
  }

  return config;
}

export function toImportEntityConfigResponse(config: ImportEntityConfig) {
  return {
    entityType: config.entityType,
    label: config.label,
    fields: config.fields.map((field) => ({
      key: field.key,
      label: field.label,
      required: field.required ?? false,
      aliases: field.aliases,
      type: field.type,
      helpText: field.helpText,
      dictionaryType: field.dictionaryType,
      supportsDefault: field.supportsDefault ?? false,
    })),
  };
}
