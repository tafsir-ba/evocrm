"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  EntityCombobox,
  type EntityComboboxOption,
  type EntityComboboxSearchResult,
} from "@/components/domain/entity-combobox";
import { MemberSelector, type MemberSelectorMember } from "@/components/domain/member-selector";
import { CurrencySelect } from "@/components/domain/locale-selectors";
import { TagSelector, type TagSelectorTag } from "@/components/domain/tag-selector";
import {
  FocusedFormActions,
  FocusedFormLayout,
} from "@/components/layout/focused-form-layout";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { isTerminalLostBehavior } from "@/lib/dictionary-form-helpers";
import {
  buildOpportunityPeerEmptyMessage,
  buildSameProjectHint,
  createPeerEscapeHref,
  mapLeadApiRecord,
  mapPropertyApiRecord,
  toComboboxOption,
  validateOpportunitySameProject,
  type OpportunityLinkEntity,
} from "@/lib/opportunity-link-flow";
import { workspacePath } from "@/lib/workspace-paths";

type DictionaryItem = {
  id: string;
  label: string;
  color: string;
  key: string;
  behavior?: string;
  isDefault?: boolean;
};

export type OpportunityFormValues = {
  leadId: string;
  propertyId: string;
  statusId: string;
  assignedTo: string;
  value: string;
  currency: string;
  expectedCloseDate: string;
  lostReasonId: string;
  lostReasonText: string;
  notes: string;
  tagIds: string[];
};

type OpportunityFormPageProps = {
  workspaceSlug: string;
  defaultCurrency: string;
  mode: "create" | "edit";
  opportunityId?: string;
  initialValues?: Partial<OpportunityFormValues>;
  lockLead?: boolean;
  lockProperty?: boolean;
  cancelHref: string;
  back?: { href: string; label?: string };
};

const emptyForm = (defaultCurrency: string): OpportunityFormValues => ({
  leadId: "",
  propertyId: "",
  statusId: "",
  assignedTo: "",
  value: "",
  currency: defaultCurrency,
  expectedCloseDate: "",
  lostReasonId: "",
  lostReasonText: "",
  notes: "",
  tagIds: [],
});

export function OpportunityFormPage({
  workspaceSlug,
  defaultCurrency,
  mode,
  opportunityId,
  initialValues,
  lockLead = false,
  lockProperty = false,
  cancelHref,
  back,
}: OpportunityFormPageProps) {
  const router = useRouter();
  const [form, setForm] = useState<OpportunityFormValues>({
    ...emptyForm(defaultCurrency),
    ...initialValues,
    currency: initialValues?.currency ?? defaultCurrency,
  });
  const [statuses, setStatuses] = useState<DictionaryItem[]>([]);
  const [lostReasons, setLostReasons] = useState<DictionaryItem[]>([]);
  const [tags, setTags] = useState<TagSelectorTag[]>([]);
  const [members, setMembers] = useState<MemberSelectorMember[]>([]);
  const [selectedLead, setSelectedLead] = useState<OpportunityLinkEntity | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<OpportunityLinkEntity | null>(
    null,
  );
  const [peerTotal, setPeerTotal] = useState<number | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [hydratingLinks, setHydratingLinks] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hydratedInitialValues = useRef(Boolean(initialValues));

  const apiBase = `/api/workspaces/${workspaceSlug}`;
  const formId = mode === "create" ? "create-opportunity-form" : "edit-opportunity-form";
  const isEdit = mode === "edit";

  const activeProjectId =
    selectedLead?.projectId ?? selectedProperty?.projectId ?? null;
  const activeProjectName =
    selectedLead?.projectName ?? selectedProperty?.projectName ?? null;
  const lockedSide: "lead" | "property" | null = selectedLead
    ? "lead"
    : selectedProperty
      ? "property"
      : null;

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    try {
      const responses = await Promise.all([
        fetch(`${apiBase}/dictionary-items?type=opportunity_status`),
        fetch(`${apiBase}/tags?entityType=opportunity`),
        fetch(`${apiBase}/members`),
        fetch(`${apiBase}/dictionary-items?type=lost_reason`),
      ]);
      const payloads = await Promise.all(responses.map((response) => response.json()));

      if (responses[0].ok) {
        setStatuses(payloads[0].data.items as DictionaryItem[]);
      }
      if (responses[1].ok) {
        setTags(payloads[1].data.tags as TagSelectorTag[]);
      }
      if (responses[2].ok) {
        setMembers(payloads[2].data.members as MemberSelectorMember[]);
      }
      if (responses[3].ok) {
        setLostReasons(payloads[3].data.items as DictionaryItem[]);
      }
    } finally {
      setLoadingOptions(false);
    }
  }, [apiBase]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    if (!initialValues || hydratedInitialValues.current) {
      return;
    }

    hydratedInitialValues.current = true;
    setForm({
      ...emptyForm(defaultCurrency),
      ...initialValues,
      currency: initialValues.currency ?? defaultCurrency,
    });
  }, [defaultCurrency, initialValues]);

  useEffect(() => {
    if (isEdit || form.statusId || statuses.length === 0) {
      return;
    }

    const defaultStatus = statuses.find((status) => status.isDefault) ?? statuses[0];
    if (defaultStatus) {
      setForm((current) => ({ ...current, statusId: defaultStatus.id }));
    }
  }, [form.statusId, isEdit, statuses]);

  useEffect(() => {
    const leadId = form.leadId;
    const propertyId = form.propertyId;
    if (!leadId && !propertyId) {
      return;
    }

    let cancelled = false;

    async function hydrateLinkedEntities() {
      setHydratingLinks(true);
      try {
        const [leadResponse, propertyResponse] = await Promise.all([
          leadId ? fetch(`${apiBase}/leads/${leadId}`) : Promise.resolve(null),
          propertyId
            ? fetch(`${apiBase}/properties/${propertyId}`)
            : Promise.resolve(null),
        ]);

        if (cancelled) {
          return;
        }

        if (leadResponse?.ok) {
          const body = (await leadResponse.json()) as {
            data: { lead: Parameters<typeof mapLeadApiRecord>[0] };
          };
          setSelectedLead(mapLeadApiRecord(body.data.lead));
        }

        if (propertyResponse?.ok) {
          const body = (await propertyResponse.json()) as {
            data: { property: Parameters<typeof mapPropertyApiRecord>[0] };
          };
          setSelectedProperty(mapPropertyApiRecord(body.data.property));
        }
      } finally {
        if (!cancelled) {
          setHydratingLinks(false);
        }
      }
    }

    void hydrateLinkedEntities();

    return () => {
      cancelled = true;
    };
  }, [apiBase, form.leadId, form.propertyId]);

  const searchLeads = useCallback(
    async (query: string): Promise<EntityComboboxSearchResult> => {
      const params = new URLSearchParams({ pageSize: "50" });
      const trimmed = query.trim();
      if (trimmed) params.set("search", trimmed);
      if (selectedProperty?.projectId) {
        params.set("projectId", selectedProperty.projectId);
      }

      const response = await fetch(`${apiBase}/leads?${params.toString()}`);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Failed to search leads.");
      }

      const body = (await response.json()) as {
        data: Array<Parameters<typeof mapLeadApiRecord>[0]>;
        pagination?: { total?: number };
      };
      const mapped = body.data.map(mapLeadApiRecord);
      const total = body.pagination?.total ?? mapped.length;
      setPeerTotal(selectedProperty?.projectId ? total : null);
      return {
        options: mapped.map(toComboboxOption),
        total,
      };
    },
    [apiBase, selectedProperty?.projectId],
  );

  const searchProperties = useCallback(
    async (query: string): Promise<EntityComboboxSearchResult> => {
      const params = new URLSearchParams({ pageSize: "50" });
      const trimmed = query.trim();
      if (trimmed) params.set("search", trimmed);
      if (selectedLead?.projectId) {
        params.set("projectId", selectedLead.projectId);
      }

      const response = await fetch(`${apiBase}/properties?${params.toString()}`);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Failed to search properties.");
      }

      const body = (await response.json()) as {
        data: Array<Parameters<typeof mapPropertyApiRecord>[0]>;
        pagination?: { total?: number };
      };
      const mapped = body.data.map(mapPropertyApiRecord);
      const total = body.pagination?.total ?? mapped.length;
      setPeerTotal(selectedLead?.projectId ? total : null);
      return {
        options: mapped.map(toComboboxOption),
        total,
      };
    },
    [apiBase, selectedLead?.projectId],
  );

  function handleLeadChange(option: EntityComboboxOption | null) {
    if (!option) {
      setSelectedLead(null);
      setForm((current) => ({ ...current, leadId: "" }));
      if (!selectedProperty) {
        setPeerTotal(null);
      }
      return;
    }

    const entity = mapLeadApiRecord({
      id: option.id,
      fullName: option.label,
      email: option.meta?.split(" · ")[0] ?? null,
      projectId: option.projectId,
      project: option.projectId
        ? { id: option.projectId, name: option.projectName ?? "Project" }
        : null,
    });
    setSelectedLead({
      ...entity,
      projectName: option.projectName ?? entity.projectName,
      meta: option.meta,
    });
    setForm((current) => ({ ...current, leadId: option.id }));

    if (
      selectedProperty &&
      option.projectId &&
      selectedProperty.projectId &&
      option.projectId !== selectedProperty.projectId
    ) {
      setSelectedProperty(null);
      setForm((current) => ({ ...current, propertyId: "" }));
      setPeerTotal(null);
    }
  }

  function handlePropertyChange(option: EntityComboboxOption | null) {
    if (!option) {
      setSelectedProperty(null);
      setForm((current) => ({ ...current, propertyId: "" }));
      if (!selectedLead) {
        setPeerTotal(null);
      }
      return;
    }

    const currency =
      typeof option.data?.currency === "string" ? option.data.currency : undefined;
    const entity = mapPropertyApiRecord({
      id: option.id,
      title: option.label,
      reference: option.meta?.split(" · ")[0] ?? null,
      currency,
      projectId: option.projectId,
      project: option.projectId
        ? { id: option.projectId, name: option.projectName ?? "Project" }
        : null,
    });
    setSelectedProperty({
      ...entity,
      projectName: option.projectName ?? entity.projectName,
      meta: option.meta,
      currency,
    });
    setForm((current) => ({
      ...current,
      propertyId: option.id,
      currency: currency ?? current.currency,
    }));

    if (
      selectedLead &&
      option.projectId &&
      selectedLead.projectId &&
      option.projectId !== selectedLead.projectId
    ) {
      setSelectedLead(null);
      setForm((current) => ({ ...current, leadId: "" }));
      setPeerTotal(null);
    }
  }

  const selectedStatus = statuses.find((status) => status.id === form.statusId);
  const requiresLostReason =
    (!isEdit || Boolean(form.lostReasonId)) &&
    isTerminalLostBehavior(selectedStatus?.behavior);

  const projectHint = buildSameProjectHint({
    lockedSide,
    projectName: activeProjectName,
    peerTotal,
  });

  const leadEmptyMessage = selectedProperty?.projectId
    ? buildOpportunityPeerEmptyMessage({
        side: "lead",
        projectName: selectedProperty.projectName,
        total: peerTotal,
      })
    : "No matching leads.";
  const propertyEmptyMessage = selectedLead?.projectId
    ? buildOpportunityPeerEmptyMessage({
        side: "property",
        projectName: selectedLead.projectName,
        total: peerTotal,
      })
    : "No matching properties.";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const sameProjectError = validateOpportunitySameProject(
        selectedLead?.projectId,
        selectedProperty?.projectId,
      );
      if (sameProjectError) {
        throw new Error(sameProjectError);
      }

      const formData = new FormData(event.currentTarget);
      const expectedCloseDate =
        String(formData.get("expectedCloseDate") ?? "").trim() || null;

      if (isEdit) {
        const response = await fetch(`${apiBase}/opportunities/${opportunityId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId: form.leadId,
            propertyId: form.propertyId,
            value: form.value ? Number(form.value) : null,
            currency: form.currency,
            expectedCloseDate,
            notes: form.notes || null,
            assignedTo: form.assignedTo || null,
            tags: form.tagIds,
          }),
        });

        if (!response.ok) {
          const body = (await response.json()) as { error?: { message?: string } };
          throw new Error(body.error?.message ?? "Failed to update opportunity.");
        }

        router.push(workspacePath(workspaceSlug, "opportunities", opportunityId!));
      } else {
        const payload: Record<string, unknown> = {
          leadId: form.leadId,
          propertyId: form.propertyId,
          statusId: form.statusId,
          notes: form.notes || undefined,
          tags: form.tagIds,
        };

        if (form.assignedTo) payload.assignedTo = form.assignedTo;
        if (form.value) payload.value = Number(form.value);
        if (form.currency) payload.currency = form.currency;
        if (expectedCloseDate) payload.expectedCloseDate = expectedCloseDate;
        if (requiresLostReason) {
          payload.lostReasonId = form.lostReasonId;
          if (form.lostReasonText) payload.lostReasonText = form.lostReasonText;
        }

        const response = await fetch(`${apiBase}/opportunities`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const body = (await response.json()) as {
          data?: { opportunity?: { id: string } };
          error?: { message?: string };
        };

        if (!response.ok) {
          throw new Error(body.error?.message ?? "Failed to create opportunity.");
        }

        const newId = body.data?.opportunity?.id;
        router.push(
          newId
            ? workspacePath(workspaceSlug, "opportunities", newId)
            : workspacePath(workspaceSlug, "pipeline"),
        );
      }

      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Failed to save opportunity.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const leadDisabled = loadingOptions || hydratingLinks || lockLead;
  const propertyDisabled = loadingOptions || hydratingLinks || lockProperty;

  return (
    <FocusedFormLayout
      title={isEdit ? "Edit opportunity" : "New opportunity"}
      description={
        isEdit
          ? "Update the linked lead/property, value, timeline, assignment, and tags."
          : "Link a lead to a property in the same project and set the initial stage."
      }
      back={back}
      maxWidth="3xl"
    >
      <form id={formId} className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <div>
          <Label htmlFor="opp-lead" required>
            Lead
          </Label>
          <EntityCombobox
            id="opp-lead"
            aria-label="Lead"
            value={form.leadId}
            selectedOption={selectedLead ? toComboboxOption(selectedLead) : null}
            onChange={handleLeadChange}
            onSearch={searchLeads}
            disabled={leadDisabled}
            placeholder="Search leads by name or email…"
            emptyMessage={leadEmptyMessage}
            hint={
              selectedProperty?.projectId ? (
                <>
                  {projectHint}
                  {peerTotal === 0 && activeProjectId ? (
                    <>
                      {" "}
                      <Link
                        href={createPeerEscapeHref({
                          workspaceSlug,
                          side: "lead",
                          projectId: activeProjectId,
                          lockedPropertyId:
                            form.propertyId || selectedProperty?.id || undefined,
                        })}
                        className="font-medium text-[var(--color-brand-700)] hover:underline"
                      >
                        Create new lead
                      </Link>
                    </>
                  ) : null}
                </>
              ) : (
                "Search across the workspace. Selecting a lead scopes properties to its project."
              )
            }
          />
        </div>

        <div>
          <Label htmlFor="opp-property" required>
            Property
          </Label>
          <EntityCombobox
            id="opp-property"
            aria-label="Property"
            value={form.propertyId}
            selectedOption={
              selectedProperty ? toComboboxOption(selectedProperty) : null
            }
            onChange={handlePropertyChange}
            onSearch={searchProperties}
            disabled={propertyDisabled}
            placeholder="Search properties by title or reference…"
            emptyMessage={propertyEmptyMessage}
            hint={
              selectedLead?.projectId ? (
                <>
                  {projectHint}
                  {peerTotal === 0 && activeProjectId ? (
                    <>
                      {" "}
                      <Link
                        href={createPeerEscapeHref({
                          workspaceSlug,
                          side: "property",
                          projectId: activeProjectId,
                          lockedLeadId: form.leadId || selectedLead?.id || undefined,
                        })}
                        className="font-medium text-[var(--color-brand-700)] hover:underline"
                      >
                        Create new property
                      </Link>
                    </>
                  ) : null}
                </>
              ) : (
                "Search across the workspace. Selecting a property scopes leads to its project."
              )
            }
          />
        </div>

        {!isEdit && (
          <>
            <div>
              <Label htmlFor="opp-status" required>
                Stage
              </Label>
              <Select
                id="opp-status"
                value={form.statusId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, statusId: event.target.value }))
                }
                required
                disabled={loadingOptions}
              >
                <option value="">Select stage…</option>
                {statuses.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.label}
                  </option>
                ))}
              </Select>
            </div>

            {requiresLostReason && (
              <>
                <div>
                  <Label htmlFor="opp-lost-reason" required>
                    Lost reason
                  </Label>
                  <Select
                    id="opp-lost-reason"
                    value={form.lostReasonId}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        lostReasonId: event.target.value,
                      }))
                    }
                    required
                  >
                    <option value="">Select reason…</option>
                    {lostReasons.map((reason) => (
                      <option key={reason.id} value={reason.id}>
                        {reason.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="opp-lost-reason-text">Lost reason details</Label>
                  <Textarea
                    id="opp-lost-reason-text"
                    value={form.lostReasonText}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        lostReasonText: event.target.value,
                      }))
                    }
                    rows={2}
                  />
                </div>
              </>
            )}
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="opp-value">Value</Label>
            <Input
              id="opp-value"
              type="number"
              min={0}
              value={form.value}
              onChange={(event) =>
                setForm((current) => ({ ...current, value: event.target.value }))
              }
            />
          </div>
          <div>
            <Label htmlFor="opp-currency">Currency</Label>
            <CurrencySelect
              id="opp-currency"
              value={form.currency}
              onChange={(currency) => setForm((current) => ({ ...current, currency }))}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="opp-expected-close">Expected close date</Label>
          <Input
            id="opp-expected-close"
            key={`close-${opportunityId ?? "new"}-${form.expectedCloseDate || "empty"}`}
            name="expectedCloseDate"
            type="date"
            defaultValue={form.expectedCloseDate}
          />
        </div>

        <div>
          <Label>Assigned to</Label>
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

        <div>
          <Label>Tags</Label>
          <TagSelector
            tags={tags}
            entityType="opportunity"
            selectedTagIds={form.tagIds}
            onToggle={(tagId) =>
              setForm((current) => ({
                ...current,
                tagIds: current.tagIds.includes(tagId)
                  ? current.tagIds.filter((id) => id !== tagId)
                  : [...current.tagIds, tagId],
              }))
            }
          />
        </div>

        <div>
          <Label htmlFor="opp-notes">Notes</Label>
          <Textarea
            id="opp-notes"
            value={form.notes}
            onChange={(event) =>
              setForm((current) => ({ ...current, notes: event.target.value }))
            }
            rows={3}
          />
        </div>

        {error && <p className="text-[12.5px] text-[var(--color-danger-fg)]">{error}</p>}

        <FocusedFormActions
          cancelHref={cancelHref}
          formId={formId}
          submitLabel={isEdit ? "Save changes" : "Create opportunity"}
          submitting={submitting}
          submitDisabled={
            loadingOptions ||
            hydratingLinks ||
            !form.leadId ||
            !form.propertyId ||
            (!isEdit && !form.statusId)
          }
        />
      </form>
    </FocusedFormLayout>
  );
}
