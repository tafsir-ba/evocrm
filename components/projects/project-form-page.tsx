"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { CompanySelector, type CompanySelectorCompany } from "@/components/domain/company-selector";
import { LocationFields } from "@/components/domain/location-fields";
import { MemberSelector, type MemberSelectorMember } from "@/components/domain/member-selector";
import {
  FocusedFormActions,
  FocusedFormLayout,
} from "@/components/layout/focused-form-layout";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import {
  emptyProjectLocation,
  hasStructuredLocation,
  type ProjectLocation,
} from "@/lib/project-location";
import {
  PRIMARY_COMPANY_REQUIRED_MESSAGE,
  primaryDeveloperCompanyId,
  PROJECT_COMMERCIAL_STAGE_LABELS,
  PROJECT_COMMERCIAL_STAGES,
  PROJECT_COMPANY_ROLE_LABELS,
  PROJECT_COMPANY_ROLES,
  PROJECT_TYPE_LABELS,
  PROJECT_TYPES,
  type ProjectCompanyRole,
} from "@/lib/project-operating-record";
import { workspacePath } from "@/lib/workspace-paths";

type DictionaryItem = {
  id: string;
  label: string;
  isActive?: boolean;
};

type AdditionalCompany = {
  key: string;
  companyId: string;
  role: ProjectCompanyRole;
};

type ProjectFormState = {
  name: string;
  reference: string;
  commercialStage: string;
  projectType: string;
  propertyTypeId: string;
  ownerId: string;
  assignedTo: string;
  location: ProjectLocation;
  primaryDeveloperId: string;
  additionalCompanies: AdditionalCompany[];
  description: string;
  website: string;
};

function defaultCreateLocation(): ProjectLocation {
  return emptyProjectLocation({
    countryCode: "CH",
    countryName: "Switzerland",
  });
}

function emptyCreateForm(): ProjectFormState {
  return {
    name: "",
    reference: "",
    commercialStage: "",
    projectType: "",
    propertyTypeId: "",
    ownerId: "",
    assignedTo: "",
    location: defaultCreateLocation(),
    primaryDeveloperId: "",
    additionalCompanies: [],
    description: "",
    website: "",
  };
}

type LoadedProject = {
  name: string;
  reference: string | null;
  projectType: string | null;
  commercialStage: string | null;
  propertyTypeId: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  location: ProjectLocation | null;
  companies: Array<{
    companyId: string;
    role: ProjectCompanyRole;
    isPrimary: boolean;
    company?: { id: string; name: string } | null;
  }>;
  description: string | null;
  ownerId: string | null;
  assignedTo: string | null;
};

function formFromProject(project: LoadedProject): ProjectFormState {
  const location = hasStructuredLocation(project.location)
    ? { ...emptyProjectLocation(), ...project.location }
    : emptyProjectLocation({
        countryName: project.country,
        countryCode:
          project.country === "Switzerland" || project.country === "Suisse" ? "CH" : null,
        municipality: project.city,
        normalizedAddress: project.address,
      });

  const primaryDeveloperId = primaryDeveloperCompanyId(project.companies ?? []) ?? "";
  const additionalCompanies = (project.companies ?? [])
    .filter((link) => !(link.role === "developer" && link.companyId === primaryDeveloperId))
    .map((link, index) => ({
      key: `${link.companyId}-${link.role}-${index}`,
      companyId: link.companyId,
      role: link.role,
    }));

  return {
    name: project.name,
    reference: project.reference ?? "",
    commercialStage: project.commercialStage ?? "",
    projectType: project.projectType ?? "",
    propertyTypeId: project.propertyTypeId ?? "",
    ownerId: project.ownerId ?? "",
    assignedTo: project.assignedTo ?? "",
    location,
    primaryDeveloperId,
    additionalCompanies,
    description: project.description ?? "",
    website: project.website ?? "",
  };
}

function locationWritePayload(location: ProjectLocation): ProjectLocation | null {
  if (!hasStructuredLocation(location) && !location.countryCode && !location.countryName) {
    return null;
  }

  const sourceUrl = location.sourceUrl?.trim() || null;
  const hasEvidence = Boolean(sourceUrl);
  return {
    ...location,
    sourceUrl,
    latitude: hasEvidence ? location.latitude : null,
    longitude: hasEvidence ? location.longitude : null,
    precision: hasEvidence && location.precision === "unknown" ? "address" : location.precision,
    confidence: hasEvidence ? location.confidence : null,
  };
}

type ProjectFormPageProps = {
  workspaceSlug: string;
  mode: "create" | "edit";
  projectId?: string;
};

export function ProjectFormPage({ workspaceSlug, mode, projectId }: ProjectFormPageProps) {
  const router = useRouter();
  const [form, setForm] = useState<ProjectFormState>(emptyCreateForm);
  const [companies, setCompanies] = useState<CompanySelectorCompany[]>([]);
  const [members, setMembers] = useState<MemberSelectorMember[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<DictionaryItem[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiBase = `/api/workspaces/${workspaceSlug}`;
  const isEdit = mode === "edit" && Boolean(projectId);
  const cancelHref = isEdit
    ? workspacePath(workspaceSlug, "projects", projectId!)
    : workspacePath(workspaceSlug, "projects");

  const rememberCompanies = useCallback((incoming: CompanySelectorCompany[]) => {
    setCompanies((current) => {
      const byId = new Map(current.map((company) => [company.id, company]));
      for (const company of incoming) {
        byId.set(company.id, company);
      }
      return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name));
    });
  }, []);

  const loadOptions = useCallback(async () => {
    const [companiesRes, membersRes, typesRes] = await Promise.all([
      fetch(`${apiBase}/companies`),
      fetch(`${apiBase}/members`),
      fetch(`${apiBase}/dictionary-items?type=property_type`),
    ]);

    if (companiesRes.ok) {
      const payload = await companiesRes.json();
      rememberCompanies((payload.data?.companies as CompanySelectorCompany[] | undefined) ?? []);
    }
    if (membersRes.ok) {
      const payload = await membersRes.json();
      setMembers((payload.data?.members as MemberSelectorMember[] | undefined) ?? []);
    }
    if (typesRes.ok) {
      const payload = await typesRes.json();
      const items = (payload.data?.items as DictionaryItem[] | undefined) ?? [];
      setPropertyTypes(items.filter((item) => item.isActive !== false));
    }
  }, [apiBase, rememberCompanies]);

  const loadProject = useCallback(async () => {
    if (!isEdit) {
      return;
    }

    const response = await fetch(`${apiBase}/projects/${projectId}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error?.message ?? "Failed to load project.");
    }

    const project = payload.data.project as LoadedProject;
    setForm(formFromProject(project));
    rememberCompanies(
      (project.companies ?? [])
        .map((link) => link.company)
        .filter((company): company is { id: string; name: string } => Boolean(company)),
    );
  }, [apiBase, isEdit, projectId, rememberCompanies]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        await loadOptions();
        await loadProject();
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loadOptions, loadProject]);

  async function createCompany(name: string): Promise<CompanySelectorCompany | null> {
    setCreatingCompany(true);
    setError(null);
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
      rememberCompanies([company]);
      return company;
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create company.");
      return null;
    } finally {
      setCreatingCompany(false);
    }
  }

  function companiesPayload() {
    return [
      ...(form.primaryDeveloperId
        ? [{ companyId: form.primaryDeveloperId, role: "developer" as const, isPrimary: true }]
        : []),
      ...form.additionalCompanies
        .filter((item) => item.companyId)
        .map((item) => ({
          companyId: item.companyId,
          role: item.role,
          isPrimary: false,
        })),
    ];
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const companies = companiesPayload();
    if (!form.primaryDeveloperId) {
      setError(PRIMARY_COMPANY_REQUIRED_MESSAGE);
      setSaving(false);
      return;
    }

    const location = locationWritePayload(form.location);
    const createBody = {
      name: form.name.trim(),
      ...(form.reference.trim() ? { reference: form.reference.trim() } : {}),
      ...(form.projectType ? { projectType: form.projectType } : {}),
      ...(form.commercialStage ? { commercialStage: form.commercialStage } : {}),
      ...(form.propertyTypeId ? { propertyTypeId: form.propertyTypeId } : {}),
      ...(form.website.trim() ? { website: form.website.trim() } : {}),
      ...(location ? { location } : {}),
      companies,
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
      ...(form.ownerId ? { ownerId: form.ownerId } : {}),
      ...(form.assignedTo ? { assignedTo: form.assignedTo } : {}),
    };

    const editBody = {
      name: form.name.trim(),
      reference: form.reference.trim() || null,
      projectType: form.projectType || null,
      commercialStage: form.commercialStage || null,
      propertyTypeId: form.propertyTypeId || null,
      website: form.website.trim() || null,
      location,
      address: location?.normalizedAddress ?? null,
      city: location?.municipality ?? null,
      country: location?.countryName ?? null,
      companies,
      description: form.description.trim() || null,
      ownerId: form.ownerId || null,
      assignedTo: form.assignedTo || null,
    };

    const response = await fetch(
      isEdit ? `${apiBase}/projects/${projectId}` : `${apiBase}/projects`,
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? editBody : createBody),
      },
    );

    const payload = await response.json();
    setSaving(false);

    if (!response.ok) {
      setError(payload.error?.message ?? "Failed to save project.");
      return;
    }

    const savedId = isEdit && projectId ? projectId : (payload.data.project.id as string);
    router.push(workspacePath(workspaceSlug, "projects", savedId));
    router.refresh();
  }

  const formId = "project-form";

  return (
    <FocusedFormLayout
      title={isEdit ? "Edit project" : "New project"}
      description="Create an operating record for a company and its people. Inbound demand (Active / Stale) is calculated later from leads, not from this form."
      back={{ href: cancelHref, label: "Projects" }}
    >
      {loading ? (
        <p className="text-[13px] text-[var(--color-ink-muted)]">Loading…</p>
      ) : (
        <form id={formId} onSubmit={onSubmit} className="space-y-8 max-w-2xl">
          <section className="space-y-4" aria-labelledby="project-essentials-heading">
            <div>
              <h2 id="project-essentials-heading" className="text-[15px] font-semibold text-[var(--color-ink)]">
                Essentials
              </h2>
              <p className="mt-1 text-[12.5px] text-[var(--color-ink-muted)]">
                Name, the primary company this project is for, commercial stage, and who owns the
                record.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name" required>
                  Project / development name
                </Label>
                <Input
                  id="name"
                  required
                  autoComplete="off"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="reference" hint="Internal">
                  Internal reference
                </Label>
                <Input
                  id="reference"
                  autoComplete="off"
                  value={form.reference}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, reference: event.target.value }))
                  }
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="primaryDeveloper" required>
                  Primary company
                </Label>
                <CompanySelector
                  id="primaryDeveloper"
                  required
                  companies={companies}
                  selectedCompanyId={form.primaryDeveloperId || null}
                  onChange={(companyId) =>
                    setForm((current) => ({ ...current, primaryDeveloperId: companyId ?? "" }))
                  }
                  onCreate={createCompany}
                  creating={creatingCompany}
                  placeholder="Select developer / client…"
                  createLabel="Create company"
                />
                <p className="mt-1.5 text-[12px] text-[var(--color-ink-faint)]">
                  Required. Search or create the CRM company this development is for. That
                  company&apos;s people stay on the company record — do not type names here.
                  Additional owners or sales partners can be added below.
                </p>
              </div>
              <div>
                <Label htmlFor="commercialStage">Commercial stage</Label>
                <Select
                  id="commercialStage"
                  value={form.commercialStage}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, commercialStage: event.target.value }))
                  }
                >
                  <option value="">Select stage…</option>
                  {PROJECT_COMMERCIAL_STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {PROJECT_COMMERCIAL_STAGE_LABELS[stage]}
                    </option>
                  ))}
                </Select>
                <p className="mt-1.5 text-[12px] text-[var(--color-ink-faint)]">
                  Lifecycle of the development. Separate from the automatically calculated inbound
                  demand signal.
                </p>
              </div>
              <div>
                <Label htmlFor="projectType">Project type</Label>
                <Select
                  id="projectType"
                  value={form.projectType}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, projectType: event.target.value }))
                  }
                >
                  <option value="">Select type…</option>
                  {PROJECT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {PROJECT_TYPE_LABELS[type]}
                    </option>
                  ))}
                </Select>
              </div>
              {propertyTypes.length > 0 ? (
                <div>
                  <Label htmlFor="propertyTypeId">Property type</Label>
                  <Select
                    id="propertyTypeId"
                    value={form.propertyTypeId}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, propertyTypeId: event.target.value }))
                    }
                  >
                    <option value="">Select property type…</option>
                    {propertyTypes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
              <div>
                <Label htmlFor="ownerId">Project owner</Label>
                <MemberSelector
                  id="ownerId"
                  members={members}
                  selectedUserId={form.ownerId || null}
                  onChange={(userId) =>
                    setForm((current) => ({ ...current, ownerId: userId ?? "" }))
                  }
                  placeholder="Unassigned"
                  emptyLabel="No workspace members available"
                />
                <p className="mt-1.5 text-[12px] text-[var(--color-ink-faint)]">
                  Portfolio manager responsible for this development.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-4" aria-labelledby="project-location-heading">
            <div>
              <h2 id="project-location-heading" className="text-[15px] font-semibold text-[var(--color-ink)]">
                Location
              </h2>
              <p className="mt-1 text-[12.5px] text-[var(--color-ink-muted)]">
                Structured address for the project area. Defaults to Switzerland; change if needed.
              </p>
            </div>
            <LocationFields
              value={form.location}
              onChange={(location) => setForm((current) => ({ ...current, location }))}
            />
          </section>

          <section className="space-y-4" aria-labelledby="project-advanced-heading">
            <button
              type="button"
              aria-expanded={showAdvanced}
              aria-controls="project-advanced-fields"
              id="project-advanced-heading"
              onClick={() => setShowAdvanced((open) => !open)}
              className="flex w-full items-center justify-between rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-3 py-2.5 text-left focus-ring"
            >
              <span>
                <span className="block text-[13.5px] font-semibold text-[var(--color-ink)]">
                  More details
                </span>
                <span className="block text-[12px] text-[var(--color-ink-muted)]">
                  Description, website, additional companies, assignment
                </span>
              </span>
              <span className="text-[12.5px] font-medium text-[var(--color-ink-soft)]">
                {showAdvanced ? "Hide" : "Show"}
              </span>
            </button>
            {showAdvanced ? (
              <div id="project-advanced-fields" className="space-y-4">
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    rows={4}
                    value={form.description}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, description: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    inputMode="url"
                    placeholder="https://"
                    value={form.website}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, website: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-[13px] font-medium text-[var(--color-ink-soft)]">
                      Additional companies
                    </p>
                    <p className="mt-1 text-[12px] text-[var(--color-ink-faint)]">
                      Owner, marketing, or a second developer. The primary company stays above.
                    </p>
                  </div>
                  {form.additionalCompanies.map((item) => (
                    <div
                      key={item.key}
                      className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3 items-end"
                    >
                      <CompanySelector
                        companies={companies}
                        selectedCompanyId={item.companyId || null}
                        onChange={(companyId) =>
                          setForm((current) => ({
                            ...current,
                            additionalCompanies: current.additionalCompanies.map((entry) =>
                              entry.key === item.key
                                ? { ...entry, companyId: companyId ?? "" }
                                : entry,
                            ),
                          }))
                        }
                        onCreate={createCompany}
                        creating={creatingCompany}
                        placeholder="Select company…"
                      />
                      <Select
                        aria-label="Company role"
                        value={item.role}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            additionalCompanies: current.additionalCompanies.map((entry) =>
                              entry.key === item.key
                                ? { ...entry, role: event.target.value as ProjectCompanyRole }
                                : entry,
                            ),
                          }))
                        }
                      >
                        {PROJECT_COMPANY_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {PROJECT_COMPANY_ROLE_LABELS[role]}
                          </option>
                        ))}
                      </Select>
                      <button
                        type="button"
                        className="h-10 text-[12.5px] font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-danger-fg)]"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            additionalCompanies: current.additionalCompanies.filter(
                              (entry) => entry.key !== item.key,
                            ),
                          }))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-[12.5px] font-medium text-[var(--color-brand-700)] hover:underline focus-ring rounded"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        additionalCompanies: [
                          ...current.additionalCompanies,
                          {
                            key: `extra-${current.additionalCompanies.length}-${Date.now()}`,
                            companyId: "",
                            role: "owner",
                          },
                        ],
                      }))
                    }
                  >
                    Add another company
                  </button>
                </div>
                <div>
                  <Label htmlFor="assignedTo">Assigned to</Label>
                  <MemberSelector
                    id="assignedTo"
                    members={members}
                    selectedUserId={form.assignedTo || null}
                    onChange={(userId) =>
                      setForm((current) => ({ ...current, assignedTo: userId ?? "" }))
                    }
                    placeholder="Unassigned"
                  />
                </div>
              </div>
            ) : null}
          </section>

          <FocusedFormActions
            cancelHref={cancelHref}
            formId={formId}
            submitLabel={isEdit ? "Save project" : "Create project"}
            submitting={saving}
          />
        </form>
      )}
      {error ? (
        <p className="mt-3 text-[13px] text-[var(--color-danger-fg)]">{error}</p>
      ) : null}
    </FocusedFormLayout>
  );
}
