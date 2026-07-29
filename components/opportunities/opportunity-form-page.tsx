"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { MemberSelector, type MemberSelectorMember } from "@/components/domain/member-selector";
import { CurrencySelect } from "@/components/domain/locale-selectors";
import { TagSelector, type TagSelectorTag } from "@/components/domain/tag-selector";
import {
  FocusedFormActions,
  FocusedFormLayout,
} from "@/components/layout/focused-form-layout";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { isTerminalLostBehavior } from "@/lib/dictionary-form-helpers";
import { workspacePath } from "@/lib/workspace-paths";

type DictionaryItem = {
  id: string;
  label: string;
  color: string;
  key: string;
  behavior?: string;
  isDefault?: boolean;
};

type LeadOption = {
  id: string;
  fullName: string;
  email: string | null;
};

type PropertyOption = {
  id: string;
  title: string;
  reference: string | null;
  currency: string;
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
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [tags, setTags] = useState<TagSelectorTag[]>([]);
  const [members, setMembers] = useState<MemberSelectorMember[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hydratedInitialValues = useRef(Boolean(initialValues));

  const apiBase = `/api/workspaces/${workspaceSlug}`;
  const formId = mode === "create" ? "create-opportunity-form" : "edit-opportunity-form";
  const isEdit = mode === "edit";

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    try {
      const requests = [
        fetch(`${apiBase}/dictionary-items?type=opportunity_status`),
        fetch(`${apiBase}/tags?entityType=opportunity`),
        fetch(`${apiBase}/members`),
      ];

      if (!isEdit) {
        requests.push(
          fetch(`${apiBase}/dictionary-items?type=lost_reason`),
          fetch(`${apiBase}/leads?pageSize=100`),
          fetch(`${apiBase}/properties?pageSize=100`),
        );
      }

      const responses = await Promise.all(requests);
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

      if (!isEdit) {
        if (responses[3]?.ok) {
          setLostReasons(payloads[3].data.items as DictionaryItem[]);
        }
        if (responses[4]?.ok) {
          setLeads(payloads[4].data as LeadOption[]);
        }
        if (responses[5]?.ok) {
          setProperties(payloads[5].data as PropertyOption[]);
        }
      }
    } finally {
      setLoadingOptions(false);
    }
  }, [apiBase, isEdit]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    if (!initialValues || hydratedInitialValues.current) {
      return;
    }

    // Hydrate once from server props. Re-applying on every initialValues
    // identity change wipes expectedCloseDate entered before save.
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

  const selectedStatus = statuses.find((status) => status.id === form.statusId);
  const requiresLostReason = !isEdit && isTerminalLostBehavior(selectedStatus?.behavior);

  function handlePropertyChange(propertyId: string) {
    const property = properties.find((item) => item.id === propertyId);
    setForm((current) => ({
      ...current,
      propertyId,
      currency: property?.currency ?? current.currency,
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (isEdit) {
        const response = await fetch(`${apiBase}/opportunities/${opportunityId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            value: form.value ? Number(form.value) : null,
            currency: form.currency,
            expectedCloseDate: form.expectedCloseDate || null,
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
        if (form.expectedCloseDate) payload.expectedCloseDate = form.expectedCloseDate;
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

  return (
    <FocusedFormLayout
      title={isEdit ? "Edit opportunity" : "New opportunity"}
      description={
        isEdit
          ? "Update value, timeline, assignment, and tags."
          : "Link a lead to a property and set the initial stage."
      }
      back={back}
      maxWidth="3xl"
    >
      <form id={formId} className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        {!isEdit && (
          <>
            <div>
              <Label htmlFor="opp-lead" required>
                Lead
              </Label>
              <Select
                id="opp-lead"
                value={form.leadId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, leadId: event.target.value }))
                }
                required
                disabled={loadingOptions || lockLead}
              >
                <option value="">Select lead…</option>
                {leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.fullName}
                    {lead.email ? ` (${lead.email})` : ""}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="opp-property" required>
                Property
              </Label>
              <Select
                id="opp-property"
                value={form.propertyId}
                onChange={(event) => handlePropertyChange(event.target.value)}
                required
                disabled={loadingOptions || lockProperty}
              >
                <option value="">Select property…</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.title}
                    {property.reference ? ` · ${property.reference}` : ""}
                  </option>
                ))}
              </Select>
            </div>

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
                      setForm((current) => ({ ...current, lostReasonId: event.target.value }))
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
            type="date"
            value={form.expectedCloseDate}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                expectedCloseDate: event.target.value,
              }))
            }
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
            (!isEdit && (!form.leadId || !form.propertyId || !form.statusId))
          }
        />
      </form>
    </FocusedFormLayout>
  );
}
