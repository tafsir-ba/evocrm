"use client";

import { useEffect, useState } from "react";

import type { ProjectSelectorProject } from "@/components/domain/project-selector";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import type {
  EnrollmentCondition,
  EnrollmentRules,
} from "@/server/repositories/campaigns";

export type EnrollmentRulesFormValue = {
  projectIds: string[];
  autoEnrollmentEnabled: boolean;
  enrollmentTrigger: "new_lead" | "lead_updated" | "manual_only";
  enrollmentRules: EnrollmentRules;
};

type DictionaryItem = {
  id: string;
  label: string;
};

type MemberOption = {
  userId: string;
  name: string | null;
  email: string;
};

type TagOption = {
  id: string;
  name: string;
};

type EnrollmentRulesBuilderProps = {
  workspaceSlug: string;
  audienceType: "leads" | "opportunities";
  value: EnrollmentRulesFormValue;
  onChange: (value: EnrollmentRulesFormValue) => void;
  disabled?: boolean;
};

const FIELD_OPTIONS: Array<{ value: EnrollmentCondition["field"]; label: string }> = [
  { value: "projectId", label: "Project" },
  { value: "tags", label: "Tags" },
  { value: "sourceId", label: "Lead source" },
  { value: "statusId", label: "Lead status" },
  { value: "assignedTo", label: "Assigned user" },
  { value: "customField", label: "Custom field" },
];

const OPERATOR_LABELS: Record<EnrollmentCondition["operator"], string> = {
  equals: "is",
  not_equals: "is not",
  contains: "contains",
  not_contains: "does not contain",
  is_empty: "is empty",
  is_not_empty: "is not empty",
};

function operatorsForField(
  field: EnrollmentCondition["field"],
): EnrollmentCondition["operator"][] {
  switch (field) {
    case "tags":
      return ["contains", "not_contains", "is_empty", "is_not_empty"];
    case "customField":
      return ["equals", "contains", "is_empty", "is_not_empty"];
    default:
      return ["equals", "not_equals", "is_empty", "is_not_empty"];
  }
}

function defaultCondition(): EnrollmentCondition {
  return {
    field: "projectId",
    operator: "equals",
    value: "",
  };
}

export function EnrollmentRulesBuilder({
  workspaceSlug,
  audienceType,
  value,
  onChange,
  disabled = false,
}: EnrollmentRulesBuilderProps) {
  const [projects, setProjects] = useState<ProjectSelectorProject[]>([]);
  const [sources, setSources] = useState<DictionaryItem[]>([]);
  const [statuses, setStatuses] = useState<DictionaryItem[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);

  const apiBase = `/api/workspaces/${workspaceSlug}`;
  const showLeadRules = audienceType === "leads";

  useEffect(() => {
    if (!showLeadRules) {
      return;
    }

    let cancelled = false;

    async function loadOptions(): Promise<void> {
      const [projectsRes, sourcesRes, statusesRes, tagsRes, membersRes] = await Promise.all([
        fetch(`${apiBase}/projects`),
        fetch(`${apiBase}/dictionary-items?type=lead_source`),
        fetch(`${apiBase}/dictionary-items?type=lead_status`),
        fetch(`${apiBase}/tags?entityType=lead`),
        fetch(`${apiBase}/members`),
      ]);

      if (cancelled) {
        return;
      }

      const [projectsPayload, sourcesPayload, statusesPayload, tagsPayload, membersPayload] =
        await Promise.all([
          projectsRes.json(),
          sourcesRes.json(),
          statusesRes.json(),
          tagsRes.json(),
          membersRes.json(),
        ]);

      if (projectsRes.ok) {
        setProjects(projectsPayload.data?.projects ?? []);
      }
      if (sourcesRes.ok) {
        setSources(sourcesPayload.data?.items ?? []);
      }
      if (statusesRes.ok) {
        setStatuses(statusesPayload.data?.items ?? []);
      }
      if (tagsRes.ok) {
        setTags(tagsPayload.data?.tags ?? []);
      }
      if (membersRes.ok) {
        setMembers(membersPayload.data?.members ?? []);
      }
    }

    void loadOptions();

    return () => {
      cancelled = true;
    };
  }, [apiBase, showLeadRules]);

  function updateCondition(index: number, patch: Partial<EnrollmentCondition>): void {
    const conditions = value.enrollmentRules.conditions.map((condition, conditionIndex) => {
      if (conditionIndex !== index) {
        return condition;
      }

      const next = { ...condition, ...patch };

      if (patch.field && patch.field !== condition.field) {
        const operators = operatorsForField(patch.field);
        next.operator = operators[0];
        next.value = "";
      }

      return next;
    });

    onChange({
      ...value,
      enrollmentRules: {
        ...value.enrollmentRules,
        conditions,
      },
    });
  }

  function addCondition(): void {
    onChange({
      ...value,
      enrollmentRules: {
        ...value.enrollmentRules,
        conditions: [...value.enrollmentRules.conditions, defaultCondition()],
      },
    });
  }

  function removeCondition(index: number): void {
    onChange({
      ...value,
      enrollmentRules: {
        ...value.enrollmentRules,
        conditions: value.enrollmentRules.conditions.filter(
          (_, conditionIndex) => conditionIndex !== index,
        ),
      },
    });
  }

  if (!showLeadRules) {
    return null;
  }

  return (
    <section className="space-y-4 rounded-lg border border-[var(--color-line)] p-4">
      <div>
        <h3 className="text-[14px] font-medium text-[var(--color-ink)]">Enrollment rules</h3>
        <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
          Automatically enroll new leads when they match your conditions.
        </p>
      </div>

      <label className="flex items-center gap-2 text-[13px] text-[var(--color-ink-soft)]">
        <input
          type="checkbox"
          checked={value.autoEnrollmentEnabled}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...value, autoEnrollmentEnabled: event.target.checked })
          }
        />
        Enable automatic enrollment
      </label>

      {value.autoEnrollmentEnabled ? (
        <>
          <div>
            <Label htmlFor="enrollment-trigger">Trigger</Label>
            <Select
              id="enrollment-trigger"
              value={value.enrollmentTrigger}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...value,
                  enrollmentTrigger: event.target.value as EnrollmentRulesFormValue["enrollmentTrigger"],
                })
              }
            >
              <option value="new_lead">New lead created</option>
              <option value="lead_updated">Lead updated</option>
              <option value="manual_only">Manual only</option>
            </Select>
          </div>

          {value.enrollmentTrigger !== "manual_only" ? (
            <>
              <div>
                <Label htmlFor="enrollment-logic">Logic</Label>
                <Select
                  id="enrollment-logic"
                  value={value.enrollmentRules.logic}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      enrollmentRules: {
                        ...value.enrollmentRules,
                        logic: event.target.value as EnrollmentRules["logic"],
                      },
                    })
                  }
                >
                  <option value="AND">Match all conditions</option>
                  <option value="OR">Match any condition</option>
                </Select>
              </div>

              <div className="space-y-3">
                <Label>Conditions</Label>
                {value.enrollmentRules.conditions.length === 0 ? (
                  <p className="text-[12px] text-[var(--color-ink-muted)]">
                    No conditions — all new leads in the workspace will be enrolled.
                  </p>
                ) : null}

                {value.enrollmentRules.conditions.map((condition, index) => {
                  const operators = operatorsForField(condition.field);
                  const showValue =
                    condition.operator !== "is_empty" &&
                    condition.operator !== "is_not_empty";

                  return (
                    <div
                      key={`condition-${index}`}
                      className="grid gap-2 rounded-md border border-[var(--color-line)] p-3 md:grid-cols-[1fr_1fr_1fr_auto]"
                    >
                      <Select
                        value={condition.field}
                        disabled={disabled}
                        onChange={(event) =>
                          updateCondition(index, {
                            field: event.target.value as EnrollmentCondition["field"],
                          })
                        }
                      >
                        {FIELD_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>

                      <Select
                        value={condition.operator}
                        disabled={disabled}
                        onChange={(event) =>
                          updateCondition(index, {
                            operator: event.target.value as EnrollmentCondition["operator"],
                          })
                        }
                      >
                        {operators.map((operator) => (
                          <option key={operator} value={operator}>
                            {OPERATOR_LABELS[operator]}
                          </option>
                        ))}
                      </Select>

                      {showValue ? (
                        <ConditionValueInput
                          condition={condition}
                          disabled={disabled}
                          projects={projects}
                          sources={sources}
                          statuses={statuses}
                          tags={tags}
                          members={members}
                          onChange={(nextValue) =>
                            updateCondition(index, { value: nextValue })
                          }
                        />
                      ) : (
                        <div />
                      )}

                      <Button
                        type="button"
                        variant="secondary"
                        disabled={disabled}
                        onClick={() => removeCondition(index)}
                      >
                        Remove
                      </Button>
                    </div>
                  );
                })}

                <Button type="button" variant="secondary" disabled={disabled} onClick={addCondition}>
                  + Add condition
                </Button>
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function ConditionValueInput({
  condition,
  disabled,
  projects,
  sources,
  statuses,
  tags,
  members,
  onChange,
}: {
  condition: EnrollmentCondition;
  disabled: boolean;
  projects: ProjectSelectorProject[];
  sources: DictionaryItem[];
  statuses: DictionaryItem[];
  tags: TagOption[];
  members: MemberOption[];
  onChange: (value: EnrollmentCondition["value"]) => void;
}) {
  switch (condition.field) {
    case "projectId":
      return (
        <Select
          value={String(condition.value ?? "")}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Select project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
      );
    case "sourceId":
      return (
        <Select
          value={String(condition.value ?? "")}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Select source</option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.label}
            </option>
          ))}
        </Select>
      );
    case "statusId":
      return (
        <Select
          value={String(condition.value ?? "")}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Select status</option>
          {statuses.map((status) => (
            <option key={status.id} value={status.id}>
              {status.label}
            </option>
          ))}
        </Select>
      );
    case "assignedTo":
      return (
        <Select
          value={String(condition.value ?? "")}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Select user</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.name ?? member.email}
            </option>
          ))}
        </Select>
      );
    case "tags":
      return (
        <Select
          value={String(condition.value ?? "")}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Select tag</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </Select>
      );
    case "customField":
      return (
        <Input
          value={String(condition.value ?? "")}
          disabled={disabled}
          placeholder="field_key or field_key:expected"
          onChange={(event) => onChange(event.target.value)}
        />
      );
    default:
      return (
        <Input
          value={String(condition.value ?? "")}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}
