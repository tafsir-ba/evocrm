"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  CompanySelector,
  type CompanySelectorCompany,
} from "@/components/domain/company-selector";
import { EnumChipSelector } from "@/components/domain/enum-chip-selector";
import { MemberSelector, type MemberSelectorMember } from "@/components/domain/member-selector";
import {
  ProjectSelector,
  type ProjectSelectorProject,
} from "@/components/domain/project-selector";
import { TagSelector, type TagSelectorTag } from "@/components/domain/tag-selector";
import {
  FocusedFormActions,
  FocusedFormLayout,
} from "@/components/layout/focused-form-layout";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import {
  PROPERTY_TYPE_INTERESTS,
  PROPERTY_TYPE_INTEREST_LABELS,
  TRANSACTION_INTENTS,
  TRANSACTION_INTENT_LABELS,
  USAGE_PURPOSES,
  USAGE_PURPOSE_LABELS,
  type PropertyTypeInterest,
  type TransactionIntent,
  type UsagePurpose,
} from "@/lib/lead-preferences";
import { useWorkspaceProjectFilter } from "@/lib/use-workspace-project-filter";
import { workspacePath } from "@/lib/workspace-paths";

type DictionaryItem = {
  id: string;
  label: string;
  color: string;
  key: string;
  isDefault?: boolean;
};

export type LeadFormInitialValues = {
  projectId?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  statusId: string;
  sourceId: string;
  language: string;
  preferredContactMethod: string;
  budgetMin: string;
  budgetMax: string;
  preferredAreas: string;
  propertyTypeInterests: PropertyTypeInterest[];
  transactionIntent: string;
  usagePurpose: string;
  notes: string;
  tagIds: string[];
  assignedTo: string;
  companyId: string;
  companyName?: string;
  industry: string;
  jobTitle: string;
  stateRegion: string;
};

type LeadFormPageProps = {
  workspaceSlug: string;
  mode: "create" | "edit";
  leadId?: string;
  initialValues?: LeadFormInitialValues;
  cancelHref: string;
  back?: { href: string; label?: string };
};

const emptyForm: LeadFormInitialValues = {
  projectId: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  statusId: "",
  sourceId: "",
  language: "",
  preferredContactMethod: "",
  budgetMin: "",
  budgetMax: "",
  preferredAreas: "",
  propertyTypeInterests: [],
  transactionIntent: "",
  usagePurpose: "",
  notes: "",
  tagIds: [],
  assignedTo: "",
  companyId: "",
  industry: "",
  jobTitle: "",
  stateRegion: "",
};

const propertyTypeOptions = PROPERTY_TYPE_INTERESTS.map((value) => ({
  value,
  label: PROPERTY_TYPE_INTEREST_LABELS[value],
}));

export function LeadFormPage({
  workspaceSlug,
  mode,
  leadId,
  initialValues,
  cancelHref,
  back,
}: LeadFormPageProps) {
  const router = useRouter();
  const scopedProjectId = useWorkspaceProjectFilter();
  const [form, setForm] = useState<LeadFormInitialValues>(initialValues ?? emptyForm);
  const [statuses, setStatuses] = useState<DictionaryItem[]>([]);
  const [sources, setSources] = useState<DictionaryItem[]>([]);
  const [tags, setTags] = useState<TagSelectorTag[]>([]);
  const [members, setMembers] = useState<MemberSelectorMember[]>([]);
  const [projects, setProjects] = useState<ProjectSelectorProject[]>([]);
  const [companies, setCompanies] = useState<CompanySelectorCompany[]>([]);
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [formWarning, setFormWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const apiBase = `/api/workspaces/${workspaceSlug}`;
  const formId = mode === "create" ? "create-lead-form" : "edit-lead-form";
  const isEdit = mode === "edit";

  const defaultStatusId = useMemo(
    () => statuses.find((item) => item.isDefault)?.id ?? statuses[0]?.id ?? "",
    [statuses],
  );

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    try {
      const loadJson = async <T,>(url: string): Promise<{ ok: boolean; data: T | null }> => {
        try {
          const response = await fetch(url);
          if (!response.ok) {
            return { ok: false, data: null };
          }
          const payload = await response.json();
          return { ok: true, data: payload?.data ?? null };
        } catch {
          return { ok: false, data: null };
        }
      };

      // Populate projects as soon as that response arrives so the selector is not
      // stuck on "No projects available" while dictionaries/members are still loading.
      const projectsPromise = loadJson<{ projects: ProjectSelectorProject[] }>(
        `${apiBase}/projects`,
      ).then((result) => {
        if (result.ok) {
          setProjects(result.data?.projects ?? []);
        }
      });

      const [statusResult, sourceResult, tagsResult, membersResult, companiesResult] =
        await Promise.all([
          loadJson<{ items: DictionaryItem[] }>(`${apiBase}/dictionary-items?type=lead_status`),
          loadJson<{ items: DictionaryItem[] }>(`${apiBase}/dictionary-items?type=lead_source`),
          loadJson<{ tags: TagSelectorTag[] }>(`${apiBase}/tags?entityType=lead`),
          loadJson<{ members: MemberSelectorMember[] }>(`${apiBase}/members`),
          loadJson<{ companies: CompanySelectorCompany[] }>(`${apiBase}/companies`),
        ]);

      await projectsPromise;

      if (statusResult.ok) {
        setStatuses(statusResult.data?.items ?? []);
      }
      if (sourceResult.ok) {
        setSources(sourceResult.data?.items ?? []);
      }
      if (tagsResult.ok) {
        setTags(tagsResult.data?.tags ?? []);
      }
      if (membersResult.ok) {
        setMembers(membersResult.data?.members ?? []);
      }
      if (companiesResult.ok) {
        const loaded = companiesResult.data?.companies ?? [];
        const selectedId = initialValues?.companyId;
        const selectedName = initialValues?.companyName;
        setCompanies(
          selectedId && selectedName && !loaded.some((company) => company.id === selectedId)
            ? [...loaded, { id: selectedId, name: selectedName }]
            : loaded,
        );
      } else if (initialValues?.companyId && initialValues.companyName) {
        setCompanies([{ id: initialValues.companyId, name: initialValues.companyName }]);
      }
    } finally {
      setLoadingOptions(false);
    }
  }, [apiBase, initialValues?.companyId, initialValues?.companyName]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    if (initialValues) {
      setForm(initialValues);
    }
  }, [initialValues]);

  useEffect(() => {
    if (!isEdit && !form.statusId && defaultStatusId) {
      setForm((current) => ({ ...current, statusId: defaultStatusId }));
    }
  }, [defaultStatusId, form.statusId, isEdit]);

  useEffect(() => {
    if (isEdit || form.projectId || projects.length === 0) {
      return;
    }

    const preferredProjectId =
      scopedProjectId && projects.some((project) => project.id === scopedProjectId)
        ? scopedProjectId
        : projects.length === 1
          ? projects[0].id
          : "";

    if (preferredProjectId) {
      setForm((current) => ({ ...current, projectId: preferredProjectId }));
    }
  }, [form.projectId, isEdit, projects, scopedProjectId]);

  async function createCompany(name: string): Promise<CompanySelectorCompany | null> {
    setCreatingCompany(true);
    setFormError(null);
    try {
      const response = await fetch(`${apiBase}/companies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to create company.");
      }
      const company = payload.data.company as CompanySelectorCompany;
      setCompanies((current) => {
        if (current.some((item) => item.id === company.id)) {
          return current;
        }
        return [...current, company].sort((left, right) => left.name.localeCompare(right.name));
      });
      return company;
    } catch (createError) {
      setFormError(createError instanceof Error ? createError.message : "Failed to create company.");
      return null;
    } finally {
      setCreatingCompany(false);
    }
  }

  function toggleTag(tagId: string) {
    setForm((current) => ({
      ...current,
      tagIds: current.tagIds.includes(tagId)
        ? current.tagIds.filter((id) => id !== tagId)
        : [...current.tagIds, tagId],
    }));
  }

  function togglePropertyTypeInterest(value: PropertyTypeInterest) {
    setForm((current) => ({
      ...current,
      propertyTypeInterests: current.propertyTypeInterests.includes(value)
        ? current.propertyTypeInterests.filter((item) => item !== value)
        : [...current.propertyTypeInterests, value],
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFormWarning(null);

    const preferredAreas = form.preferredAreas
      ? form.preferredAreas.split(",").map((area) => area.trim()).filter(Boolean)
      : isEdit
        ? []
        : undefined;

    const basePayload = {
      firstName: form.firstName,
      lastName: form.lastName,
      statusId: form.statusId,
      ...(isEdit ? {} : { projectId: form.projectId }),
      email: form.email.trim() || (isEdit ? null : undefined),
      phone: form.phone.trim() || (isEdit ? null : undefined),
      sourceId: form.sourceId || (isEdit ? null : undefined),
      language: form.language.trim() || (isEdit ? null : undefined),
      preferredContactMethod: form.preferredContactMethod || (isEdit ? null : undefined),
      budgetMin: form.budgetMin ? Number(form.budgetMin) : isEdit ? null : undefined,
      budgetMax: form.budgetMax ? Number(form.budgetMax) : isEdit ? null : undefined,
      preferredAreas: isEdit ? preferredAreas : preferredAreas?.length ? preferredAreas : undefined,
      propertyTypeInterests:
        form.propertyTypeInterests.length > 0 ? form.propertyTypeInterests : isEdit ? [] : undefined,
      transactionIntent: (form.transactionIntent || (isEdit ? null : undefined)) as
        | TransactionIntent
        | null
        | undefined,
      usagePurpose: (form.usagePurpose || (isEdit ? null : undefined)) as
        | UsagePurpose
        | null
        | undefined,
      notes: form.notes.trim() || (isEdit ? null : undefined),
      tags: form.tagIds,
      assignedTo: form.assignedTo || (isEdit ? null : undefined),
      companyId: form.companyId || (isEdit ? null : undefined),
      industry: form.industry.trim() || (isEdit ? null : undefined),
      jobTitle: form.jobTitle.trim() || (isEdit ? null : undefined),
      stateRegion: form.stateRegion.trim() || (isEdit ? null : undefined),
    };

    try {
      const response = await fetch(
        isEdit ? `${apiBase}/leads/${leadId}` : `${apiBase}/leads`,
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(basePayload),
        },
      );
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error?.message ?? `Failed to ${isEdit ? "update" : "create"} lead.`);
      }

      if (body.data.warnings?.includes("duplicate_phone")) {
        setFormWarning("A lead with this phone number already exists in this workspace.");
        return;
      }

      const savedLeadId = isEdit ? leadId : body.data.lead?.id;
      if (savedLeadId) {
        router.push(workspacePath(workspaceSlug, "leads", savedLeadId));
        router.refresh();
      } else {
        router.push(workspacePath(workspaceSlug, "leads"));
        router.refresh();
      }
    } catch (submitError) {
      setFormError(submitError instanceof Error ? submitError.message : "Failed to save.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FocusedFormLayout
      title={isEdit ? "Edit lead" : "New lead"}
      description={
        isEdit
          ? "Update contact details, preferences, and assignment."
          : "Capture a new contact entering your workspace."
      }
      back={back}
    >
      <form id={formId} className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        {!isEdit && projects.length === 0 ? (
          <p className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-muted)] px-3 py-2 text-[13px] text-[var(--color-ink-muted)]">
            Create an active project before adding leads.
          </p>
        ) : null}

        {!isEdit ? (
          <div>
            <Label htmlFor="projectId" required>
              Project
            </Label>
            <ProjectSelector
              projects={projects}
              selectedProjectId={form.projectId || null}
              onChange={(projectId) =>
                setForm((current) => ({ ...current, projectId: projectId ?? "" }))
              }
              disabled={loadingOptions || projects.length === 0}
              loading={loadingOptions}
              emptyLabel="No active projects available"
            />
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="firstName" required>
              First name
            </Label>
            <Input
              id="firstName"
              value={form.firstName}
              onChange={(event) =>
                setForm((current) => ({ ...current, firstName: event.target.value }))
              }
              required
              disabled={loadingOptions}
            />
          </div>
          <div>
            <Label htmlFor="lastName" required>
              Last name
            </Label>
            <Input
              id="lastName"
              value={form.lastName}
              onChange={(event) =>
                setForm((current) => ({ ...current, lastName: event.target.value }))
              }
              required
              disabled={loadingOptions}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(event) =>
              setForm((current) => ({ ...current, email: event.target.value }))
            }
          />
        </div>

        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            value={form.phone}
            onChange={(event) =>
              setForm((current) => ({ ...current, phone: event.target.value }))
            }
          />
        </div>

        <div>
          <Label htmlFor="companyId">Associated company</Label>
          <CompanySelector
            id="companyId"
            companies={companies}
            selectedCompanyId={form.companyId || null}
            onChange={(companyId) =>
              setForm((current) => ({ ...current, companyId: companyId ?? "" }))
            }
            onCreate={createCompany}
            creating={creatingCompany}
            disabled={loadingOptions}
            placeholder="Select or create a company"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="jobTitle">Job title</Label>
            <Input
              id="jobTitle"
              value={form.jobTitle}
              onChange={(event) =>
                setForm((current) => ({ ...current, jobTitle: event.target.value }))
              }
            />
          </div>
          <div>
            <Label htmlFor="industry">Industry</Label>
            <Input
              id="industry"
              value={form.industry}
              onChange={(event) =>
                setForm((current) => ({ ...current, industry: event.target.value }))
              }
            />
          </div>
        </div>

        <div>
          <Label htmlFor="stateRegion">State / region</Label>
          <Input
            id="stateRegion"
            value={form.stateRegion}
            onChange={(event) =>
              setForm((current) => ({ ...current, stateRegion: event.target.value }))
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="statusId" required>
              Status
            </Label>
            <Select
              id="statusId"
              value={form.statusId}
              onChange={(event) =>
                setForm((current) => ({ ...current, statusId: event.target.value }))
              }
              required
              disabled={loadingOptions}
            >
              <option value="">Select status</option>
              {statuses.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="sourceId">Source</Label>
            <Select
              id="sourceId"
              value={form.sourceId}
              onChange={(event) =>
                setForm((current) => ({ ...current, sourceId: event.target.value }))
              }
              disabled={loadingOptions}
            >
              <option value="">{isEdit ? "No source" : "Select source"}</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="assignedTo">Assigned to</Label>
          <MemberSelector
            members={members}
            selectedUserId={form.assignedTo || null}
            onChange={(userId) =>
              setForm((current) => ({
                ...current,
                assignedTo: userId ?? "",
              }))
            }
            placeholder="Unassigned"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="language">Language</Label>
            <Input
              id="language"
              value={form.language}
              onChange={(event) =>
                setForm((current) => ({ ...current, language: event.target.value }))
              }
            />
          </div>
          <div>
            <Label htmlFor="preferredContactMethod">Preferred contact</Label>
            <Select
              id="preferredContactMethod"
              value={form.preferredContactMethod}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  preferredContactMethod: event.target.value,
                }))
              }
            >
              <option value="">Not set</option>
              <option value="email">Email</option>
              <option value="phone">Phone</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="sms">SMS</option>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="budgetMin">Budget min</Label>
            <Input
              id="budgetMin"
              type="number"
              min={0}
              value={form.budgetMin}
              onChange={(event) =>
                setForm((current) => ({ ...current, budgetMin: event.target.value }))
              }
            />
          </div>
          <div>
            <Label htmlFor="budgetMax">Budget max</Label>
            <Input
              id="budgetMax"
              type="number"
              min={0}
              value={form.budgetMax}
              onChange={(event) =>
                setForm((current) => ({ ...current, budgetMax: event.target.value }))
              }
            />
          </div>
        </div>

        <div>
          <Label htmlFor="preferredAreas">Preferred areas</Label>
          <Input
            id="preferredAreas"
            placeholder="Geneva, Nyon"
            value={form.preferredAreas}
            onChange={(event) =>
              setForm((current) => ({ ...current, preferredAreas: event.target.value }))
            }
          />
        </div>

        <div>
          <Label>Property type interests</Label>
          <EnumChipSelector
            options={propertyTypeOptions}
            selectedValues={form.propertyTypeInterests}
            onToggle={togglePropertyTypeInterest}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="transactionIntent">Transaction intent</Label>
            <Select
              id="transactionIntent"
              value={form.transactionIntent}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  transactionIntent: event.target.value,
                }))
              }
            >
              <option value="">Not set</option>
              {TRANSACTION_INTENTS.map((value) => (
                <option key={value} value={value}>
                  {TRANSACTION_INTENT_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="usagePurpose">Usage purpose</Label>
            <Select
              id="usagePurpose"
              value={form.usagePurpose}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  usagePurpose: event.target.value,
                }))
              }
            >
              <option value="">Not set</option>
              {USAGE_PURPOSES.map((value) => (
                <option key={value} value={value}>
                  {USAGE_PURPOSE_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <Label>Tags</Label>
          <TagSelector
            tags={tags}
            entityType="lead"
            selectedTagIds={form.tagIds}
            onToggle={toggleTag}
          />
        </div>

        <div>
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            value={form.notes}
            onChange={(event) =>
              setForm((current) => ({ ...current, notes: event.target.value }))
            }
            rows={4}
          />
        </div>

        {formError && (
          <p className="text-[13px] text-[var(--color-danger-fg)]">{formError}</p>
        )}
        {formWarning && (
          <p className="text-[13px] text-[var(--color-warning-fg,#b45309)]">{formWarning}</p>
        )}

        <FocusedFormActions
          cancelHref={cancelHref}
          formId={formId}
          submitLabel={isEdit ? "Save changes" : "Create lead"}
          submitting={submitting}
          submitDisabled={loadingOptions || !form.statusId}
        />
      </form>
    </FocusedFormLayout>
  );
}
