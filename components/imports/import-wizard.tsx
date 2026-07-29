"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ImportDripCampaignOption } from "@/components/imports/import-drip-campaign-option";
import {
  buildImportExecutePayload,
  formatImportFileSize,
  isImportDripCampaignEvaluationRequested,
  shouldConfirmImportDripCampaignEvaluation,
  shouldShowImportDripCampaignOption,
  MAX_IMPORT_FILE_SIZE_BYTES,
  SUPPORTED_IMPORT_EXTENSIONS,
  type ImportEntityConfigResponse,
  type ImportEntityType,
  type ImportErrorRowDetail,
  type ImportMappingEntry,
  type ImportPreviewRow,
  type ImportRowIssue,
  type ImportRowOverrides,
  type ImportValidationSummary,
} from "@/lib/imports";
import {
  collectUnknownProjectNames,
  parseUnknownProjectName,
  suggestProjectNameFromImportValue,
  suggestProjectReferenceFromImportValue,
} from "@/lib/import-project-helpers";
import {
  sanitizeImportMappingPayload,
  sanitizeRowOverrides,
  validateImportMappingConfiguration,
} from "@/lib/import-mapping-validation";
import { IconUpload } from "@/lib/icons";

function pluralizeImportEntityLabel(label: string): string {
  const normalized = label.trim();
  if (!normalized) {
    return "items";
  }

  const lower = normalized.toLowerCase();
  if (lower.endsWith("y") && !/[aeiou]y$/i.test(normalized)) {
    return `${normalized.slice(0, -1)}ies`;
  }
  if (lower.endsWith("s")) {
    return normalized;
  }
  return `${normalized}s`;
}

type WizardStep = "upload" | "map" | "validate" | "results";

type ColumnPreview = {
  index: number;
  header: string;
  sampleValues: string[];
  suggestedField: string | null;
};

type DictionaryItem = {
  id: string;
  label: string;
};

type ProjectItem = {
  id: string;
  name: string;
};

type MemberItem = {
  userId: string;
  name: string | null;
  email: string;
};

type ParsePreviewResponse = {
  job: { id: string; sheetName?: string | null };
  columns: ColumnPreview[];
  previewRows: ImportPreviewRow[];
  rowCount: number;
  warnings?: string[];
};

type ImportWizardProps = {
  open: boolean;
  onClose: () => void;
  workspaceSlug: string;
  entityType: ImportEntityType;
  canCreateProject?: boolean;
  onComplete?: () => void;
};

const STEP_LABELS: Record<WizardStep, string> = {
  upload: "Upload",
  map: "Map columns",
  validate: "Validate",
  results: "Results",
};

export function ImportWizard({
  open,
  onClose,
  workspaceSlug,
  entityType,
  canCreateProject = false,
  onComplete,
}: ImportWizardProps) {
  const apiBase = `/api/workspaces/${workspaceSlug}/imports`;
  const workspaceApiBase = `/api/workspaces/${workspaceSlug}`;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<WizardStep>("upload");
  const [loading, setLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadWarnings, setLoadWarnings] = useState<string[]>([]);

  const [config, setConfig] = useState<ImportEntityConfigResponse | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState(0);
  const [sheetName, setSheetName] = useState<string | null>(null);
  const [columns, setColumns] = useState<ColumnPreview[]>([]);
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [mappings, setMappings] = useState<ImportMappingEntry[]>([]);
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [hasHeaderRow, setHasHeaderRow] = useState(true);

  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [dictionaries, setDictionaries] = useState<Record<string, DictionaryItem[]>>({});
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);

  const [validationSummary, setValidationSummary] = useState<ImportValidationSummary | null>(null);
  const [validationIssues, setValidationIssues] = useState<ImportRowIssue[]>([]);
  const [errorRowDetails, setErrorRowDetails] = useState<ImportErrorRowDetail[]>([]);
  const [warningRowDetails, setWarningRowDetails] = useState<ImportErrorRowDetail[]>([]);
  const [rowOverrides, setRowOverrides] = useState<ImportRowOverrides>({});
  const [importResult, setImportResult] = useState<{
    createdCount: number;
    skippedCount: number;
    failedCount: number;
    status: string;
    dripCampaignEvaluationEnabled?: boolean;
  } | null>(null);
  const [triggerAutomationForImportedLeads, setTriggerAutomationForImportedLeads] =
    useState(false);
  const [confirmDripDialogOpen, setConfirmDripDialogOpen] = useState(false);
  const [pendingExecuteMode, setPendingExecuteMode] = useState<
    "valid_rows_only" | "strict" | null
  >(null);

  const entityLabel = config?.label ?? entityType;
  const entityLabelPlural = pluralizeImportEntityLabel(entityLabel);

  const applyParsePreview = useCallback(
    (data: ParsePreviewResponse, options?: { preserveMappings?: boolean }) => {
      setImportId(data.job.id);
      setColumns(data.columns);
      setPreviewRows(data.previewRows);
      setRowCount(data.rowCount);
      setParseWarnings(data.warnings ?? []);
      if (data.job.sheetName !== undefined) {
        setSheetName(data.job.sheetName ?? null);
      }
      if (!options?.preserveMappings) {
        setMappings(
          data.columns.map((column) => ({
            sourceColumnIndex: column.index,
            targetField: column.suggestedField,
          })),
        );
      }
    },
    [],
  );

  const requiredFields = useMemo(
    () => config?.fields.filter((field) => field.required) ?? [],
    [config],
  );

  const mappedOrDefaultedFields = useMemo(() => {
    const mapped = new Set(
      mappings.map((mapping) => mapping.targetField).filter(Boolean) as string[],
    );
    const defaulted = new Set(Object.keys(defaults).filter((key) => defaults[key]));

    return new Set([...mapped, ...defaulted]);
  }, [mappings, defaults]);

  const isRequiredFieldSatisfied = useCallback(
    (fieldKey: string) => {
      if (mappedOrDefaultedFields.has(fieldKey)) {
        return true;
      }

      if (
        (fieldKey === "firstName" || fieldKey === "lastName") &&
        mappedOrDefaultedFields.has("fullName")
      ) {
        return true;
      }

      return false;
    },
    [mappedOrDefaultedFields],
  );

  const unsatisfiedRequiredFields = useMemo(
    () => requiredFields.filter((field) => !isRequiredFieldSatisfied(field.key)),
    [isRequiredFieldSatisfied, requiredFields],
  );

  const allRequiredFieldsSatisfied = unsatisfiedRequiredFields.length === 0;

  const mappingConfigurationIssues = useMemo(() => {
    if (!config) return [];

    const { mappings: sanitizedMappings, defaults: sanitizedDefaults } =
      sanitizeImportMappingPayload({ mappings, defaults });

    return validateImportMappingConfiguration(
      config.fields,
      sanitizedMappings,
      sanitizedDefaults,
    );
  }, [config, defaults, mappings]);

  const canValidateMapping =
    allRequiredFieldsSatisfied && mappingConfigurationIssues.length === 0;

  function formatMappingIssues(issues: ImportRowIssue[]): string {
    return issues.map((issue) => issue.message).join(" ");
  }

  function formatImportApiError(
    payload: { error?: { message?: string; details?: { issues?: ImportRowIssue[] } } },
    fallback: string,
  ): string {
    const issues = payload.error?.details?.issues;

    if (issues?.length) {
      return issues.map((issue) => issue.message).join(" ");
    }

    return payload.error?.message ?? fallback;
  }

  const resetWizard = useCallback(() => {
    setStep("upload");
    setLoading(false);
    setConfigLoading(false);
    setError(null);
    setLoadWarnings([]);
    setImportId(null);
    setFileName(null);
    setRowCount(0);
    setSheetName(null);
    setColumns([]);
    setPreviewRows([]);
    setMappings([]);
    setDefaults({});
    setHasHeaderRow(true);
    setValidationSummary(null);
    setValidationIssues([]);
    setErrorRowDetails([]);
    setWarningRowDetails([]);
    setRowOverrides({});
    setImportResult(null);
    setTriggerAutomationForImportedLeads(false);
    setConfirmDripDialogOpen(false);
    setPendingExecuteMode(null);
  }, []);

  useEffect(() => {
    if (!open) {
      resetWizard();
      return;
    }

    async function loadConfig() {
      setConfigLoading(true);
      setError(null);
      try {
        const [configRes, projectsRes, membersRes] = await Promise.all([
          fetch(`${apiBase}/config?entityType=${entityType}`),
          fetch(`/api/workspaces/${workspaceSlug}/projects`),
          fetch(`/api/workspaces/${workspaceSlug}/members`),
        ]);

        const configPayload = await configRes.json();
        const projectsPayload = await projectsRes.json();
        const membersPayload = await membersRes.json();

        if (!configRes.ok) {
          throw new Error(configPayload.error?.message ?? "Failed to load import config.");
        }

        setConfig(configPayload.data as ImportEntityConfigResponse);

        const loadErrors: string[] = [];

        if (projectsRes.ok) {
          const projectList =
            (projectsPayload.data as { projects?: ProjectItem[] } | undefined)
              ?.projects ?? [];
          setProjects(
            projectList.map((project) => ({
              id: project.id,
              name: project.name,
            })),
          );
        } else {
          loadErrors.push("Failed to load projects.");
        }

        if (membersRes.ok) {
          setMembers(membersPayload.data.members as MemberItem[]);
        } else {
          loadErrors.push("Failed to load workspace members.");
        }

        const dictionaryTypes = new Set(
          (configPayload.data as ImportEntityConfigResponse).fields
            .map((field) => field.dictionaryType)
            .filter(Boolean),
        );

        const dictionaryEntries = await Promise.all(
          Array.from(dictionaryTypes).map(async (type) => {
            const response = await fetch(
              `/api/workspaces/${workspaceSlug}/dictionary-items?type=${type}`,
            );
            const payload = await response.json();

            if (!response.ok) {
              loadErrors.push(`Failed to load ${type} dictionary items.`);
            }

            return [
              type!,
              response.ok ? (payload.data.items as DictionaryItem[]) : [],
            ] as const;
          }),
        );

        setDictionaries(Object.fromEntries(dictionaryEntries));

        setLoadWarnings(loadErrors);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load config.");
      } finally {
        setConfigLoading(false);
      }
    }

    void loadConfig();
  }, [apiBase, entityType, open, resetWizard, workspaceSlug]);

  async function handleUpload(file: File) {
    setError(null);
    setLoading(true);

    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!SUPPORTED_IMPORT_EXTENSIONS.includes(extension as (typeof SUPPORTED_IMPORT_EXTENSIONS)[number])) {
      setError("Upload a CSV or Excel file. Other document formats will be supported later.");
      setLoading(false);
      return;
    }

    if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
      setError(`File is too large. Maximum size is ${formatImportFileSize(MAX_IMPORT_FILE_SIZE_BYTES)}.`);
      setLoading(false);
      return;
    }

    try {
      const formData = new FormData();
      formData.append("entityType", entityType);
      formData.append("file", file);

      const response = await fetch(apiBase, {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Upload failed.");
      }

      const data = payload.data as ParsePreviewResponse;

      setFileName(file.name);
      setDefaults({});
      applyParsePreview(data);
      setStep("map");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleHeaderRowChange(nextHasHeaderRow: boolean) {
    if (!importId) {
      setHasHeaderRow(nextHasHeaderRow);
      return;
    }

    setHasHeaderRow(nextHasHeaderRow);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiBase}/${importId}/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hasHeaderRow: nextHasHeaderRow,
          headerRowIndex: 0,
          preserveMappings: true,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to re-parse file.");
      }

      applyParsePreview(payload.data as ParsePreviewResponse, { preserveMappings: true });
    } catch (reparseError) {
      setError(reparseError instanceof Error ? reparseError.message : "Failed to re-parse file.");
    } finally {
      setLoading(false);
    }
  }

  function applyValidationResponse(data: {
    summary: ImportValidationSummary;
    issues: ImportRowIssue[];
    errorRows?: ImportErrorRowDetail[];
    warningRows?: ImportErrorRowDetail[];
    rowOverrides?: ImportRowOverrides;
  }) {
    setValidationSummary(data.summary);
    setValidationIssues(data.issues);
    setErrorRowDetails(data.errorRows ?? []);
    setWarningRowDetails(data.warningRows ?? []);
    if (data.rowOverrides) {
      setRowOverrides(data.rowOverrides);
    }
    setStep("validate");
  }

  async function handleSaveMappingAndValidate() {
    if (!importId || !config) return;

    const payload = sanitizeImportMappingPayload({ mappings, defaults });
    const clientIssues = validateImportMappingConfiguration(
      config.fields,
      payload.mappings,
      payload.defaults,
    );

    if (clientIssues.length > 0) {
      setError(formatMappingIssues(clientIssues));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const mappingResponse = await fetch(`${apiBase}/${importId}/mapping`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, hasHeaderRow }),
      });
      const mappingPayload = await mappingResponse.json();

      if (!mappingResponse.ok) {
        throw new Error(
          formatImportApiError(mappingPayload, "Failed to save mapping."),
        );
      }

      applyParsePreview(mappingPayload.data as ParsePreviewResponse, { preserveMappings: true });

      const validateResponse = await fetch(`${apiBase}/${importId}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const validatePayload = await validateResponse.json();

      if (!validateResponse.ok) {
        throw new Error(
          formatImportApiError(validatePayload, "Validation failed."),
        );
      }

      applyValidationResponse(validatePayload.data);
    } catch (validateError) {
      setError(validateError instanceof Error ? validateError.message : "Validation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function reloadProjects(): Promise<ProjectItem[]> {
    const response = await fetch(`${workspaceApiBase}/projects`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error?.message ?? "Failed to load projects.");
    }

    const projectList =
      (payload.data as { projects?: ProjectItem[] } | undefined)?.projects ?? [];
    const nextProjects = projectList.map((project) => ({
      id: project.id,
      name: project.name,
    }));
    setProjects(nextProjects);
    return nextProjects;
  }

  async function revalidateImport(overrides: ImportRowOverrides = rowOverrides) {
    if (!importId || !config) return;

    const sanitizedOverrides = sanitizeRowOverrides(config.fields, overrides);

    const validateResponse = await fetch(`${apiBase}/${importId}/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowOverrides: sanitizedOverrides }),
    });
    const validatePayload = await validateResponse.json();

    if (!validateResponse.ok) {
      throw new Error(formatImportApiError(validatePayload, "Validation failed."));
    }

    applyValidationResponse(validatePayload.data);
  }

  async function handleRevalidateWithFixes() {
    if (!importId) return;

    setLoading(true);
    setError(null);

    try {
      await revalidateImport(rowOverrides);
    } catch (revalidateError) {
      setError(
        revalidateError instanceof Error ? revalidateError.message : "Validation failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateProjectFromImport(input: {
    importValue: string;
    name: string;
    reference: string;
  }) {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${workspaceApiBase}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: input.name.trim(),
          reference:
            input.reference.trim() ||
            suggestProjectReferenceFromImportValue(input.importValue),
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to create project.");
      }

      const createdProject = payload.data.project as ProjectItem;
      setProjects((current) => [
        ...current,
        { id: createdProject.id, name: createdProject.name },
      ]);

      if (importId && step === "validate") {
        await revalidateImport(rowOverrides);
      }
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create project.");
    } finally {
      setLoading(false);
    }
  }

  function updateRowOverride(rowNumber: number, fieldKey: string, value: string) {
    const rowKey = String(rowNumber);

    setRowOverrides((current) => {
      const nextRow = { ...(current[rowKey] ?? {}), [fieldKey]: value };
      return { ...current, [rowKey]: nextRow };
    });
  }

  async function handleExecute(mode: "valid_rows_only" | "strict") {
    if (!importId) return;

    setLoading(true);
    setError(null);

    const includeDripEvaluation = isImportDripCampaignEvaluationRequested({
      entityType,
      mode,
      triggerAutomationForImportedLeads,
    });

    try {
      const response = await fetch(`${apiBase}/${importId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildImportExecutePayload(mode, {
            triggerAutomationForImportedLeads: includeDripEvaluation,
          }),
        ),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(formatImportApiError(payload, "Import failed."));
      }

      setImportResult({
        createdCount: payload.data.createdCount,
        skippedCount: payload.data.skippedCount,
        failedCount: payload.data.failedCount,
        status: payload.data.job.status,
        dripCampaignEvaluationEnabled: Boolean(
          payload.data.dripCampaignEvaluationEnabled,
        ),
      });
      setStep("results");
    } catch (executeError) {
      setError(executeError instanceof Error ? executeError.message : "Import failed.");
    } finally {
      setLoading(false);
      setConfirmDripDialogOpen(false);
      setPendingExecuteMode(null);
    }
  }

  function requestExecute(mode: "valid_rows_only" | "strict") {
    if (
      shouldConfirmImportDripCampaignEvaluation({
        entityType,
        mode,
        triggerAutomationForImportedLeads,
      })
    ) {
      setPendingExecuteMode(mode);
      setConfirmDripDialogOpen(true);
      return;
    }

    void handleExecute(mode);
  }

  function updateMapping(columnIndex: number, targetField: string | null) {
    setMappings((current) => {
      const next = [...current];
      const existingIndex = next.findIndex(
        (mapping) => mapping.sourceColumnIndex === columnIndex,
      );

      if (existingIndex >= 0) {
        next[existingIndex] = { sourceColumnIndex: columnIndex, targetField };
      } else {
        next.push({ sourceColumnIndex: columnIndex, targetField });
      }

      return next;
    });
  }

  function getMappingForColumn(columnIndex: number): string | null {
    return mappings.find((mapping) => mapping.sourceColumnIndex === columnIndex)?.targetField ?? null;
  }

  const footer = (
    <div className="flex items-center justify-between gap-3">
      <div className="text-[12px] text-[var(--color-ink-muted)]">
        {fileName ? `${fileName} · ${rowCount.toLocaleString()} rows` : null}
      </div>
      <div className="flex items-center gap-2">
        {step !== "upload" && step !== "results" && (
          <Button
            variant="ghost"
            onClick={() => {
              if (step === "map") setStep("upload");
              if (step === "validate") setStep("map");
            }}
            disabled={loading}
          >
            Back
          </Button>
        )}
        {step === "map" && (
          <Button
            onClick={() => void handleSaveMappingAndValidate()}
            loading={loading}
            disabled={!canValidateMapping}
          >
            Validate import
          </Button>
        )}
        {step === "validate" && (
          <>
            {validationSummary && validationSummary.errorRows > 0 && (
              <Button
                variant="secondary"
                onClick={() => void handleRevalidateWithFixes()}
                loading={loading}
                disabled={Object.keys(rowOverrides).length === 0}
              >
                Apply fixes
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => requestExecute("strict")}
              loading={loading}
              disabled={!validationSummary || validationSummary.errorRows > 0}
            >
              {shouldShowImportDripCampaignOption(entityType) &&
              triggerAutomationForImportedLeads
                ? "Strict import and evaluate drip campaigns"
                : "Strict import"}
            </Button>
            <Button onClick={() => requestExecute("valid_rows_only")} loading={loading}>
              {shouldShowImportDripCampaignOption(entityType) &&
              triggerAutomationForImportedLeads
                ? "Import and evaluate drip campaigns"
                : "Import valid rows"}
            </Button>
          </>
        )}
        {step === "results" && (
          <Button
            onClick={() => {
              onComplete?.();
              onClose();
            }}
          >
            Done
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!loading) {
          onClose();
        }
      }}
      title={`Import ${entityLabelPlural}`}
      className="max-w-5xl"
      footer={footer}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(STEP_LABELS) as WizardStep[]).map((stepKey) => (
            <Badge
              key={stepKey}
              tone={step === stepKey ? "info" : "muted"}
              size="sm"
            >
              {STEP_LABELS[stepKey]}
            </Badge>
          ))}
        </div>

        {error && (
          <div className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[13px] text-[#b91c1c]">
            {error}
          </div>
        )}

        {loadWarnings.length > 0 && (
          <div className="rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-[13px] text-[#92400e]">
            {loadWarnings.join(" ")} Some import helpers may be unavailable until you refresh.
          </div>
        )}

        {step === "upload" && (
          <UploadStep
            loading={loading}
            configLoading={configLoading}
            configError={Boolean(error)}
            fileInputRef={fileInputRef}
            onSelectFile={(file) => void handleUpload(file)}
          />
        )}

        {step === "map" && config && (
          <MapStep
            config={config}
            columns={columns}
            previewRows={previewRows}
            defaults={defaults}
            projects={projects}
            members={members}
            dictionaries={dictionaries}
            requiredFields={requiredFields}
            isRequiredFieldSatisfied={isRequiredFieldSatisfied}
            unsatisfiedRequiredFields={unsatisfiedRequiredFields}
            mappingConfigurationIssues={mappingConfigurationIssues}
            hasHeaderRow={hasHeaderRow}
            sheetName={sheetName}
            rowCount={rowCount}
            parseWarnings={parseWarnings}
            loading={loading}
            getMappingForColumn={getMappingForColumn}
            onMappingChange={updateMapping}
            onDefaultChange={(fieldKey, value) =>
              setDefaults((current) => ({ ...current, [fieldKey]: value }))
            }
            onHasHeaderRowChange={(value) => void handleHeaderRowChange(value)}
          />
        )}

        {step === "validate" && validationSummary && config && (
          <ValidateStep
            summary={validationSummary}
            issues={validationIssues}
            errorRows={errorRowDetails}
            warningRows={warningRowDetails}
            config={config}
            entityType={entityType}
            rowOverrides={rowOverrides}
            projects={projects}
            members={members}
            dictionaries={dictionaries}
            canCreateProject={canCreateProject}
            loading={loading}
            triggerAutomationForImportedLeads={triggerAutomationForImportedLeads}
            onTriggerAutomationChange={setTriggerAutomationForImportedLeads}
            onFieldChange={updateRowOverride}
            onCreateProject={(input) => void handleCreateProjectFromImport(input)}
          />
        )}

        {step === "results" && importResult && importId && (
          <ResultsStep
            result={importResult}
            rowCount={rowCount}
            errorsUrl={`${apiBase}/${importId}/errors`}
            entityType={entityType}
            entityLabel={entityLabel}
            workspaceSlug={workspaceSlug}
          />
        )}
      </div>

      <Modal
        open={confirmDripDialogOpen}
        onClose={() => {
          if (!loading) {
            setConfirmDripDialogOpen(false);
            setPendingExecuteMode(null);
          }
        }}
        title="Confirm drip campaign evaluation"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              disabled={loading}
              onClick={() => {
                setConfirmDripDialogOpen(false);
                setPendingExecuteMode(null);
              }}
            >
              Cancel
            </Button>
            <Button
              loading={loading}
              onClick={() => {
                if (pendingExecuteMode) {
                  void handleExecute(pendingExecuteMode);
                }
              }}
            >
              Continue import
            </Button>
          </div>
        }
      >
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You are about to import{" "}
          <span className="font-medium text-[var(--color-ink)]">
            {validationSummary?.validRows.toLocaleString() ?? 0}
          </span>{" "}
          leads and evaluate them against active drip campaigns for their project.
        </p>
        <p className="mt-3 text-[13px] text-[var(--color-ink-muted)]">
          Matching leads may be enrolled and may receive campaign emails.
        </p>
      </Modal>
    </Modal>
  );
}

function UploadStep({
  loading,
  configLoading,
  configError,
  fileInputRef,
  onSelectFile,
}: {
  loading: boolean;
  configLoading: boolean;
  configError: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onSelectFile: (file: File) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const uploadDisabled = loading || configLoading || configError;

  function handleFile(file: File) {
    if (uploadDisabled) {
      return;
    }
    onSelectFile(file);
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-[var(--color-ink-muted)]">
        Upload a CSV or Excel file. Other document formats will be supported later.
      </p>
      {configLoading && (
        <p className="text-[12px] text-[var(--color-ink-muted)]">Loading import settings…</p>
      )}
      <div
        role="button"
        tabIndex={0}
        onClick={() => !uploadDisabled && fileInputRef.current?.click()}
        onKeyDown={(event) => {
          if (uploadDisabled) return;
          if (event.key === "Enter" || event.key === " ") {
            fileInputRef.current?.click();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!uploadDisabled) {
            setDragOver(true);
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!uploadDisabled) {
            setDragOver(true);
          }
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);

          if (uploadDisabled) {
            return;
          }

          const file = event.dataTransfer.files[0];
          if (file) {
            handleFile(file);
          }
        }}
        className={[
          "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors cursor-pointer",
          dragOver
            ? "border-[var(--color-brand-600)] bg-[color-mix(in_srgb,var(--color-brand-600)_5%,white)]"
            : "border-[var(--color-line)] bg-[var(--color-canvas)] hover:border-[var(--color-brand-600)]",
          loading || configLoading || configError ? "opacity-60 cursor-not-allowed" : "",
        ].join(" ")}
      >
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-[var(--color-brand-600)] shadow-sm">
          <IconUpload size={18} />
        </span>
        <p className="text-[13.5px] font-medium text-[var(--color-ink)]">
          {loading ? "Uploading…" : configLoading ? "Preparing import…" : "Drop a file here or click to browse"}
        </p>
        <p className="text-[12px] text-[var(--color-ink-muted)]">
          CSV or Excel · max {formatImportFileSize(MAX_IMPORT_FILE_SIZE_BYTES)}
        </p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) handleFile(file);
        }}
      />
    </div>
  );
}

function MapStep({
  config,
  columns,
  previewRows,
  defaults,
  projects,
  members,
  dictionaries,
  requiredFields,
  isRequiredFieldSatisfied,
  unsatisfiedRequiredFields,
  mappingConfigurationIssues,
  hasHeaderRow,
  sheetName,
  rowCount,
  parseWarnings,
  loading,
  getMappingForColumn,
  onMappingChange,
  onDefaultChange,
  onHasHeaderRowChange,
}: {
  config: ImportEntityConfigResponse;
  columns: ColumnPreview[];
  previewRows: ImportPreviewRow[];
  defaults: Record<string, string>;
  projects: ProjectItem[];
  members: MemberItem[];
  dictionaries: Record<string, DictionaryItem[]>;
  requiredFields: ImportEntityConfigResponse["fields"];
  isRequiredFieldSatisfied: (fieldKey: string) => boolean;
  unsatisfiedRequiredFields: ImportEntityConfigResponse["fields"];
  mappingConfigurationIssues: ImportRowIssue[];
  hasHeaderRow: boolean;
  sheetName: string | null;
  rowCount: number;
  parseWarnings: string[];
  loading: boolean;
  getMappingForColumn: (index: number) => string | null;
  onMappingChange: (index: number, field: string | null) => void;
  onDefaultChange: (fieldKey: string, value: string) => void;
  onHasHeaderRowChange: (value: boolean) => void;
}) {
  const defaultableFields = config.fields.filter((field) => field.supportsDefault);

  return (
    <div className="space-y-4">
      {parseWarnings.length > 0 && (
        <div className="rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-[12px] text-[#92400e]">
          {parseWarnings.join(" ")}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-[12px] text-[var(--color-ink-muted)]">
        <span>{rowCount.toLocaleString()} rows</span>
        {sheetName && <span>Sheet: {sheetName}</span>}
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={hasHeaderRow}
            disabled={loading}
            onChange={(event) => onHasHeaderRowChange(event.target.checked)}
          />
          First row contains headers
        </label>
      </div>

      {defaultableFields.length > 0 && (
        <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] p-3">
          <p className="mb-2 text-[12px] font-medium text-[var(--color-ink)]">Default values</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {defaultableFields.map((field) => (
              <label key={field.key} className="space-y-1">
                <span className="text-[11px] text-[var(--color-ink-muted)]">{field.label}</span>
                <Select
                  fieldSize="sm"
                  value={defaults[field.key] ?? ""}
                  disabled={loading}
                  onChange={(event) => onDefaultChange(field.key, event.target.value)}
                >
                  <option value="">No default</option>
                  {field.type === "project" &&
                    projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  {field.dictionaryType &&
                    (dictionaries[field.dictionaryType] ?? []).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  {field.type === "member" &&
                    members.map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.name ?? member.email}
                      </option>
                    ))}
                </Select>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-[var(--color-line)] p-3">
        <p className="mb-2 text-[12px] font-medium text-[var(--color-ink)]">Required fields</p>
        <div className="flex flex-wrap gap-2">
          {requiredFields.map((field) => (
            <Badge
              key={field.key}
              tone={isRequiredFieldSatisfied(field.key) ? "success" : "warn"}
              size="sm"
            >
              {field.label}
            </Badge>
          ))}
        </div>
        {unsatisfiedRequiredFields.length > 0 && (
          <p className="mt-2 text-[12px] text-[#92400e]">
            Map a column or set a default for:{" "}
            {unsatisfiedRequiredFields.map((field) => field.label).join(", ")}.
          </p>
        )}
        {mappingConfigurationIssues.length > 0 && (
          <div className="mt-2 space-y-1 text-[12px] text-[#92400e]">
            {mappingConfigurationIssues.map((issue, index) => (
              <p key={`${issue.field ?? "mapping"}-${index}`}>{issue.message}</p>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--color-line)]">
        <table className="min-w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-[var(--color-line)] bg-[var(--color-canvas)]">
              {columns.map((column) => {
                const mappedField = getMappingForColumn(column.index);
                const isIgnored = !mappedField;

                return (
                  <th key={column.index} className="min-w-[160px] px-2 py-2 text-left align-top">
                    <div className="space-y-1">
                      <div className="font-medium text-[var(--color-ink)]">{column.header}</div>
                      <Select
                        fieldSize="sm"
                        value={mappedField ?? ""}
                        disabled={loading}
                        onChange={(event) =>
                          onMappingChange(
                            column.index,
                            event.target.value ? event.target.value : null,
                          )
                        }
                        className={isIgnored ? "opacity-60" : ""}
                      >
                        <option value="">Ignore column</option>
                        {config.fields.map((field) => (
                          <option key={field.key} value={field.key}>
                            {field.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row) => (
              <tr key={row.rowNumber} className="border-b border-[var(--color-line)] last:border-0">
                {row.values.map((value, index) => (
                  <td key={`${row.rowNumber}-${index}`} className="px-2 py-1.5 text-[var(--color-ink-soft)]">
                    {value || "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ValidateStep({
  summary,
  issues,
  errorRows,
  warningRows,
  config,
  entityType,
  rowOverrides,
  projects,
  members,
  dictionaries,
  canCreateProject,
  loading,
  triggerAutomationForImportedLeads,
  onTriggerAutomationChange,
  onFieldChange,
  onCreateProject,
}: {
  summary: ImportValidationSummary;
  issues: ImportRowIssue[];
  errorRows: ImportErrorRowDetail[];
  warningRows: ImportErrorRowDetail[];
  config: ImportEntityConfigResponse;
  entityType: ImportEntityType;
  rowOverrides: ImportRowOverrides;
  projects: ProjectItem[];
  members: MemberItem[];
  dictionaries: Record<string, DictionaryItem[]>;
  canCreateProject: boolean;
  loading: boolean;
  triggerAutomationForImportedLeads: boolean;
  onTriggerAutomationChange: (checked: boolean) => void;
  onFieldChange: (rowNumber: number, fieldKey: string, value: string) => void;
  onCreateProject: (input: {
    importValue: string;
    name: string;
    reference: string;
  }) => void;
}) {
  const fieldMap = useMemo(
    () => new Map(config.fields.map((field) => [field.key, field])),
    [config.fields],
  );

  const unknownProjectNames = useMemo(
    () => collectUnknownProjectNames(issues, errorRows),
    [errorRows, issues],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Total rows" value={summary.totalRows} />
        <StatCard label="Ready" value={summary.validRows} tone="success" />
        <StatCard label="Warnings" value={summary.warningRows} tone="warning" />
        <StatCard label="Errors" value={summary.errorRows} tone="danger" />
      </div>

      {shouldShowImportDripCampaignOption(entityType) && (
        <ImportDripCampaignOption
          checked={triggerAutomationForImportedLeads}
          disabled={loading}
          onChange={onTriggerAutomationChange}
        />
      )}

      {unknownProjectNames.length > 0 && (
        <ImportMissingProjectsPanel
          unknownProjectNames={unknownProjectNames}
          issues={issues}
          errorRows={errorRows}
          canCreateProject={canCreateProject}
          loading={loading}
          onCreateProject={onCreateProject}
        />
      )}

      {summary.errorRows > 0 && errorRows.length === 0 && issues.length > 0 && (
        <p className="text-[12px] text-[#92400e]">
          {summary.errorRows.toLocaleString()} rows have errors, but detailed row editors are
          unavailable. Re-run validation or download the error report after import.
        </p>
      )}

      {errorRows.length > 0 ? (
        <div className="space-y-3">
          <p className="text-[13px] text-[var(--color-ink-muted)]">
            Fix the rows below, then click <span className="font-medium text-[var(--color-ink)]">Apply fixes</span> to re-validate.
          </p>
          {summary.errorRows > errorRows.length && (
            <p className="text-[12px] text-[#92400e]">
              Showing the first {errorRows.length} of {summary.errorRows} error rows. Remaining errors will still be skipped during import.
            </p>
          )}
          <div className="space-y-3">
            {errorRows.map((errorRow) => (
              <ImportErrorRowEditor
                key={errorRow.rowNumber}
                errorRow={errorRow}
                fieldMap={fieldMap}
                rowOverrides={rowOverrides}
                projects={projects}
                members={members}
                dictionaries={dictionaries}
                canCreateProject={canCreateProject}
                loading={loading}
                onFieldChange={onFieldChange}
                onCreateProject={onCreateProject}
              />
            ))}
          </div>
        </div>
      ) : issues.length > 0 ? (
        <div className="rounded-lg border border-[var(--color-line)]">
          <table className="min-w-full text-[12px]">
            <thead className="bg-[var(--color-canvas)]">
              <tr>
                <th className="px-3 py-2 text-left">Row</th>
                <th className="px-3 py-2 text-left">Field</th>
                <th className="px-3 py-2 text-left">Severity</th>
                <th className="px-3 py-2 text-left">Message</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue, index) => (
                <tr key={`${issue.rowNumber}-${index}`} className="border-t border-[var(--color-line)]">
                  <td className="px-3 py-2">{issue.rowNumber}</td>
                  <td className="px-3 py-2">{issue.field ?? "—"}</td>
                  <td className="px-3 py-2 capitalize">{issue.severity}</td>
                  <td className="px-3 py-2 text-[var(--color-ink-soft)]">{issue.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {warningRows.length > 0 && (
        <div className="space-y-3">
          <p className="text-[12px] font-medium text-[var(--color-ink)]">Warning rows</p>
          {summary.warningRows > warningRows.length && (
            <p className="text-[12px] text-[#92400e]">
              Showing the first {warningRows.length} of {summary.warningRows} warning rows.
            </p>
          )}
          <div className="space-y-2 rounded-lg border border-[#fde68a] bg-[#fffbeb] p-3">
            {warningRows.map((warningRow) => (
              <div key={warningRow.rowNumber} className="space-y-1">
                <p className="text-[12px] font-medium text-[var(--color-ink)]">
                  Row {warningRow.rowNumber}
                </p>
                <div className="flex flex-wrap gap-1">
                  {warningRow.issues.map((issue, index) => (
                    <Badge key={`${issue.field ?? "row"}-${index}`} tone="warn" size="sm">
                      {issue.message}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {errorRows.length === 0 && issues.length === 0 && warningRows.length === 0 ? (
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          All rows are ready to import.
        </p>
      ) : null}
    </div>
  );
}

function ImportMissingProjectsPanel({
  unknownProjectNames,
  issues,
  errorRows,
  canCreateProject,
  loading,
  onCreateProject,
}: {
  unknownProjectNames: string[];
  issues: ImportRowIssue[];
  errorRows: ImportErrorRowDetail[];
  canCreateProject: boolean;
  loading: boolean;
  onCreateProject: (input: {
    importValue: string;
    name: string;
    reference: string;
  }) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, { name: string; reference: string }>>({});

  function getDraft(importValue: string) {
    return (
      drafts[importValue] ?? {
        name: suggestProjectNameFromImportValue(importValue),
        reference: suggestProjectReferenceFromImportValue(importValue),
      }
    );
  }

  function countAffectedRows(importValue: string): number {
    const rowNumbers = new Set<number>();

    for (const issue of issues) {
      if (issue.field !== "projectId") continue;
      if (parseUnknownProjectName(issue.message) === importValue && issue.rowNumber > 0) {
        rowNumbers.add(issue.rowNumber);
      }
    }

    for (const errorRow of errorRows) {
      const matches = errorRow.issues.some(
        (issue) =>
          issue.field === "projectId" &&
          parseUnknownProjectName(issue.message) === importValue,
      );
      if (matches) {
        rowNumbers.add(errorRow.rowNumber);
      }
    }

    return rowNumbers.size;
  }

  return (
    <div className="space-y-3 rounded-lg border border-[#bfdbfe] bg-[#eff6ff] p-3">
      <p className="text-[12px] font-medium text-[var(--color-ink)]">Missing projects</p>
      <p className="text-[12px] text-[var(--color-ink-muted)]">
        Create the project in your workspace, then validation will run again automatically.
      </p>

      {unknownProjectNames.map((importValue) => {
        const draft = getDraft(importValue);
        const affectedRows = countAffectedRows(importValue);

        return (
          <div
            key={importValue}
            className="rounded-lg border border-[var(--color-line)] bg-white p-3 space-y-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] text-[var(--color-ink)]">
                Unknown project{" "}
                <span className="font-medium">{importValue}</span>
                {affectedRows > 0 ? ` · ${affectedRows.toLocaleString()} rows` : null}
              </p>
            </div>

            {canCreateProject ? (
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <label className="space-y-1">
                  <span className="text-[11px] text-[var(--color-ink-muted)]">Project name</span>
                  <Input
                    fieldSize="sm"
                    value={draft.name}
                    disabled={loading}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [importValue]: {
                          ...getDraft(importValue),
                          name: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] text-[var(--color-ink-muted)]">Reference</span>
                  <Input
                    fieldSize="sm"
                    value={draft.reference}
                    disabled={loading}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [importValue]: {
                          ...getDraft(importValue),
                          reference: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <Button
                  size="sm"
                  loading={loading}
                  disabled={loading || !draft.name.trim()}
                  onClick={() =>
                    onCreateProject({
                      importValue,
                      name: draft.name,
                      reference: draft.reference,
                    })
                  }
                >
                  Create & re-validate
                </Button>
              </div>
            ) : (
              <p className="text-[12px] text-[#92400e]">
                You need project create permission to add a project from this screen.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ImportErrorRowEditor({
  errorRow,
  fieldMap,
  rowOverrides,
  projects,
  members,
  dictionaries,
  canCreateProject,
  loading,
  onFieldChange,
  onCreateProject,
}: {
  errorRow: ImportErrorRowDetail;
  fieldMap: Map<string, ImportEntityConfigResponse["fields"][number]>;
  rowOverrides: ImportRowOverrides;
  projects: ProjectItem[];
  members: MemberItem[];
  dictionaries: Record<string, DictionaryItem[]>;
  canCreateProject: boolean;
  loading: boolean;
  onFieldChange: (rowNumber: number, fieldKey: string, value: string) => void;
  onCreateProject: (input: {
    importValue: string;
    name: string;
    reference: string;
  }) => void;
}) {
  const editableFieldKeys = Array.from(
    new Set(
      errorRow.issues
        .map((issue) => issue.field)
        .filter((field): field is string => Boolean(field)),
    ),
  );

  function getRowFieldValue(fieldKey: string): string {
    return (
      rowOverrides[String(errorRow.rowNumber)]?.[fieldKey] ??
      errorRow.values[fieldKey] ??
      ""
    );
  }

  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-medium text-[var(--color-ink)]">
          Row {errorRow.rowNumber}
        </p>
        <div className="flex flex-wrap gap-1">
          {errorRow.issues.map((issue, index) => (
            <Badge key={`${issue.field ?? "row"}-${index}`} tone="warn" size="sm">
              {issue.message}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {editableFieldKeys.map((fieldKey) => {
          const field = fieldMap.get(fieldKey);
          const currentValue = getRowFieldValue(fieldKey);
          const sourceValue = errorRow.values[fieldKey] ?? "";

          return (
            <label key={fieldKey} className="space-y-1">
              <span className="text-[11px] text-[var(--color-ink-muted)]">
                {field?.label ?? fieldKey}
              </span>
              {field?.helpText && (
                <span className="block text-[10px] text-[var(--color-ink-faint)]">
                  {field.helpText}
                </span>
              )}
              <ImportFieldEditor
                field={field}
                value={currentValue}
                sourceValue={sourceValue}
                projects={projects}
                members={members}
                dictionaries={dictionaries}
                canCreateProject={canCreateProject}
                loading={loading}
                onChange={(value) => onFieldChange(errorRow.rowNumber, fieldKey, value)}
                onCreateProject={onCreateProject}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}

function isObjectIdValue(value: string): boolean {
  return /^[a-fA-F0-9]{24}$/.test(value);
}

function ImportFieldEditor({
  field,
  value,
  sourceValue,
  projects,
  members,
  dictionaries,
  canCreateProject,
  loading,
  onChange,
  onCreateProject,
}: {
  field: ImportEntityConfigResponse["fields"][number] | undefined;
  value: string;
  sourceValue?: string;
  projects: ProjectItem[];
  members: MemberItem[];
  dictionaries: Record<string, DictionaryItem[]>;
  canCreateProject: boolean;
  loading: boolean;
  onChange: (value: string) => void;
  onCreateProject?: (input: {
    importValue: string;
    name: string;
    reference: string;
  }) => void;
}) {
  const unresolvedSource =
    sourceValue && !isObjectIdValue(sourceValue) && value === sourceValue
      ? sourceValue
      : null;

  if (field?.type === "project") {
    const hasMatch = projects.some((project) => project.id === value);
    const unresolved = sourceValue && !isObjectIdValue(sourceValue) && !hasMatch
      ? sourceValue
      : unresolvedSource;

    return (
      <div className="space-y-1">
        {unresolved && (
          <p className="text-[10px] text-[#92400e]">From file: {unresolved}</p>
        )}
        <Select fieldSize="sm" value={hasMatch ? value : ""} disabled={loading} onChange={(event) => onChange(event.target.value)}>
          <option value="">Select project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
        {unresolved && canCreateProject && onCreateProject && (
          <Button
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={() =>
              onCreateProject({
                importValue: unresolved,
                name: suggestProjectNameFromImportValue(unresolved),
                reference: suggestProjectReferenceFromImportValue(unresolved),
              })
            }
          >
            {`Create ${suggestProjectNameFromImportValue(unresolved)}`}
          </Button>
        )}
      </div>
    );
  }

  if (field?.type === "member") {
    const hasMatch = members.some((member) => member.userId === value);

    return (
      <div className="space-y-1">
        {unresolvedSource && !hasMatch && (
          <p className="text-[10px] text-[#92400e]">From file: {unresolvedSource}</p>
        )}
        <Select fieldSize="sm" value={hasMatch ? value : ""} disabled={loading} onChange={(event) => onChange(event.target.value)}>
          <option value="">Select member</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.name ?? member.email}
            </option>
          ))}
        </Select>
      </div>
    );
  }

  if (field?.dictionaryType) {
    const items = dictionaries[field.dictionaryType] ?? [];
    const hasMatch = items.some((item) => item.id === value);

    return (
      <div className="space-y-1">
        {unresolvedSource && !hasMatch && (
          <p className="text-[10px] text-[#92400e]">From file: {unresolvedSource}</p>
        )}
        <Select fieldSize="sm" value={hasMatch ? value : ""} disabled={loading} onChange={(event) => onChange(event.target.value)}>
          <option value="">Select {field.label.toLowerCase()}</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </Select>
      </div>
    );
  }

  return (
    <Input
      fieldSize="sm"
      type={field?.type === "email" ? "email" : field?.type === "phone" ? "tel" : "text"}
      value={value}
      disabled={loading}
      onChange={(event) => onChange(event.target.value)}
      placeholder={field?.label ?? "Value"}
    />
  );
}

function ResultsStep({
  result,
  rowCount,
  errorsUrl,
  entityType,
  entityLabel,
  workspaceSlug,
}: {
  result: {
    createdCount: number;
    skippedCount: number;
    failedCount: number;
    status: string;
    dripCampaignEvaluationEnabled?: boolean;
  };
  rowCount: number;
  errorsUrl: string;
  entityType: ImportEntityType;
  entityLabel: string;
  workspaceSlug: string;
}) {
  const listPath =
    entityType === "lead"
      ? `/w/${workspaceSlug}/leads`
      : `/w/${workspaceSlug}/properties`;

  const listLabel = pluralizeImportEntityLabel(entityLabel).toLowerCase();

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Total rows" value={rowCount} />
        <StatCard label="Created" value={result.createdCount} tone="success" />
        <StatCard label="Skipped" value={result.skippedCount} tone="warning" />
        <StatCard label="Failed" value={result.failedCount} tone="danger" />
      </div>

      <p className="text-[13px] text-[var(--color-ink-muted)]">
        Import status: <span className="font-medium text-[var(--color-ink)]">{result.status}</span>
      </p>

      {shouldShowImportDripCampaignOption(entityType) && (
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          Drip campaign evaluation:{" "}
          <span className="font-medium text-[var(--color-ink)]">
            {result.dripCampaignEvaluationEnabled ? "Enabled" : "Disabled"}
          </span>
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <a
          href={listPath}
          className="inline-flex h-9 items-center rounded-md bg-[var(--color-brand-600)] px-3.5 text-[13.5px] text-white hover:bg-[var(--color-brand-700)]"
        >
          View {listLabel}
        </a>
        {(result.skippedCount > 0 || result.failedCount > 0) && (
          <a
            href={errorsUrl}
            className="inline-flex h-9 items-center rounded-md border border-[var(--color-line)] bg-white px-3.5 text-[13.5px] text-[var(--color-ink)] hover:bg-[var(--color-canvas)]"
          >
            Download error CSV
          </a>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: number;
  tone?: "muted" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-[#15803d]"
      : tone === "warning"
        ? "text-[#b45309]"
        : tone === "danger"
          ? "text-[#b91c1c]"
          : "text-[var(--color-ink)]";

  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-white p-3">
      <p className="text-[11px] text-[var(--color-ink-muted)]">{label}</p>
      <p className={`mt-1 text-[20px] font-semibold ${toneClass}`}>{value.toLocaleString()}</p>
    </div>
  );
}
