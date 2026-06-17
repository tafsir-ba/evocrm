"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/input";
import {
  formatImportFileSize,
  MAX_IMPORT_FILE_SIZE_BYTES,
  SUPPORTED_IMPORT_EXTENSIONS,
  type ImportEntityConfigResponse,
  type ImportEntityType,
  type ImportMappingEntry,
  type ImportPreviewRow,
  type ImportRowIssue,
  type ImportValidationSummary,
} from "@/lib/imports";
import { IconUpload } from "@/lib/icons";

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
  onComplete,
}: ImportWizardProps) {
  const apiBase = `/api/workspaces/${workspaceSlug}/imports`;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<WizardStep>("upload");
  const [loading, setLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const [importResult, setImportResult] = useState<{
    createdCount: number;
    skippedCount: number;
    failedCount: number;
    status: string;
  } | null>(null);

  const entityLabel = config?.label ?? entityType;

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

  const resetWizard = useCallback(() => {
    setStep("upload");
    setLoading(false);
    setConfigLoading(false);
    setError(null);
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
    setImportResult(null);
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
        }

        if (membersRes.ok) {
          setMembers(membersPayload.data.members as MemberItem[]);
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
            return [
              type!,
              response.ok ? (payload.data.items as DictionaryItem[]) : [],
            ] as const;
          }),
        );

        setDictionaries(Object.fromEntries(dictionaryEntries));
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

  async function handleSaveMappingAndValidate() {
    if (!importId) return;

    setLoading(true);
    setError(null);

    try {
      const mappingResponse = await fetch(`${apiBase}/${importId}/mapping`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings, defaults, hasHeaderRow }),
      });
      const mappingPayload = await mappingResponse.json();

      if (!mappingResponse.ok) {
        throw new Error(mappingPayload.error?.message ?? "Failed to save mapping.");
      }

      applyParsePreview(mappingPayload.data as ParsePreviewResponse, { preserveMappings: true });

      const validateResponse = await fetch(`${apiBase}/${importId}/validate`, {
        method: "POST",
      });
      const validatePayload = await validateResponse.json();

      if (!validateResponse.ok) {
        throw new Error(validatePayload.error?.message ?? "Validation failed.");
      }

      setValidationSummary(validatePayload.data.summary as ImportValidationSummary);
      setValidationIssues(validatePayload.data.issues as ImportRowIssue[]);
      setStep("validate");
    } catch (validateError) {
      setError(validateError instanceof Error ? validateError.message : "Validation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleExecute(mode: "valid_rows_only" | "strict") {
    if (!importId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiBase}/${importId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Import failed.");
      }

      setImportResult({
        createdCount: payload.data.createdCount,
        skippedCount: payload.data.skippedCount,
        failedCount: payload.data.failedCount,
        status: payload.data.job.status,
      });
      setStep("results");
    } catch (executeError) {
      setError(executeError instanceof Error ? executeError.message : "Import failed.");
    } finally {
      setLoading(false);
    }
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
          <Button onClick={() => void handleSaveMappingAndValidate()} loading={loading}>
            Validate import
          </Button>
        )}
        {step === "validate" && (
          <>
            <Button
              variant="secondary"
              onClick={() => void handleExecute("strict")}
              loading={loading}
              disabled={!validationSummary || validationSummary.errorRows > 0}
            >
              Strict import
            </Button>
            <Button onClick={() => void handleExecute("valid_rows_only")} loading={loading}>
              Import valid rows
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
      onClose={onClose}
      title={`Import ${entityLabel}s`}
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
            hasHeaderRow={hasHeaderRow}
            sheetName={sheetName}
            rowCount={rowCount}
            parseWarnings={parseWarnings}
            getMappingForColumn={getMappingForColumn}
            onMappingChange={updateMapping}
            onDefaultChange={(fieldKey, value) =>
              setDefaults((current) => ({ ...current, [fieldKey]: value }))
            }
            onHasHeaderRowChange={(value) => void handleHeaderRowChange(value)}
          />
        )}

        {step === "validate" && validationSummary && (
          <ValidateStep summary={validationSummary} issues={validationIssues} />
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
  hasHeaderRow,
  sheetName,
  rowCount,
  parseWarnings,
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
  hasHeaderRow: boolean;
  sheetName: string | null;
  rowCount: number;
  parseWarnings: string[];
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
}: {
  summary: ImportValidationSummary;
  issues: ImportRowIssue[];
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Total rows" value={summary.totalRows} />
        <StatCard label="Ready" value={summary.validRows} tone="success" />
        <StatCard label="Warnings" value={summary.warningRows} tone="warning" />
        <StatCard label="Errors" value={summary.errorRows} tone="danger" />
      </div>

      {issues.length > 0 ? (
        <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--color-line)]">
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
      ) : (
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          All rows are ready to import.
        </p>
      )}
    </div>
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

  const listLabel = `${entityLabel.toLowerCase()}s`;

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
