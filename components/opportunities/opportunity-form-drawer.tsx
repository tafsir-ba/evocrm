"use client";

import { useCallback, useEffect, useState } from "react";

import { MemberSelector, type MemberSelectorMember } from "@/components/domain/member-selector";
import { TagSelector, type TagSelectorTag } from "@/components/domain/tag-selector";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { isTerminalLostBehavior } from "@/lib/dictionary-form-helpers";

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

type OpportunityFormDrawerProps = {
  open: boolean;
  onClose: () => void;
  workspaceSlug: string;
  defaultCurrency: string;
  initialValues?: Partial<OpportunityFormValues>;
  onCreated: () => void;
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

export function OpportunityFormDrawer({
  open,
  onClose,
  workspaceSlug,
  defaultCurrency,
  initialValues,
  onCreated,
}: OpportunityFormDrawerProps) {
  const [form, setForm] = useState<OpportunityFormValues>(emptyForm(defaultCurrency));
  const [statuses, setStatuses] = useState<DictionaryItem[]>([]);
  const [lostReasons, setLostReasons] = useState<DictionaryItem[]>([]);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [tags, setTags] = useState<TagSelectorTag[]>([]);
  const [members, setMembers] = useState<MemberSelectorMember[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    try {
      const [
        statusesResponse,
        lostReasonsResponse,
        leadsResponse,
        propertiesResponse,
        tagsResponse,
        membersResponse,
      ] = await Promise.all([
        fetch(`/api/workspaces/${workspaceSlug}/dictionary-items?type=opportunity_status`),
        fetch(`/api/workspaces/${workspaceSlug}/dictionary-items?type=lost_reason`),
        fetch(`/api/workspaces/${workspaceSlug}/leads?pageSize=100`),
        fetch(`/api/workspaces/${workspaceSlug}/properties?pageSize=100`),
        fetch(`/api/workspaces/${workspaceSlug}/tags?entityType=opportunity`),
        fetch(`/api/workspaces/${workspaceSlug}/members`),
      ]);

      if (statusesResponse.ok) {
        const payload = (await statusesResponse.json()) as { data: { items: DictionaryItem[] } };
        setStatuses(payload.data.items);
      }
      if (lostReasonsResponse.ok) {
        const payload = (await lostReasonsResponse.json()) as { data: { items: DictionaryItem[] } };
        setLostReasons(payload.data.items);
      }
      if (leadsResponse.ok) {
        const payload = (await leadsResponse.json()) as {
          data: Array<{ id: string; fullName: string; email: string | null }>;
        };
        setLeads(payload.data);
      }
      if (propertiesResponse.ok) {
        const payload = (await propertiesResponse.json()) as {
          data: Array<{
            id: string;
            title: string;
            reference: string | null;
            currency: string;
          }>;
        };
        setProperties(payload.data);
      }
      if (tagsResponse.ok) {
        const payload = (await tagsResponse.json()) as { data: { tags: TagSelectorTag[] } };
        setTags(payload.data.tags);
      }
      if (membersResponse.ok) {
        const payload = (await membersResponse.json()) as { data: { members: MemberSelectorMember[] } };
        setMembers(payload.data.members);
      }
    } finally {
      setLoadingOptions(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    if (!open) {
      return;
    }

    void loadOptions();
    const base = emptyForm(defaultCurrency);
    const resolvedInitialValues = {
      ...base,
      ...initialValues,
      currency: initialValues?.currency ?? defaultCurrency,
    };
    setForm(resolvedInitialValues);
    setError(null);
  }, [open, defaultCurrency, initialValues, loadOptions]);

  useEffect(() => {
    if (!open || form.statusId || statuses.length === 0) {
      return;
    }

    const defaultStatus = statuses.find((status) => status.isDefault) ?? statuses[0];
    if (defaultStatus) {
      setForm((current) => ({ ...current, statusId: defaultStatus.id }));
    }
  }, [open, form.statusId, statuses]);

  const selectedStatus = statuses.find((status) => status.id === form.statusId);
  const requiresLostReason = isTerminalLostBehavior(selectedStatus?.behavior);

  const handlePropertyChange = (propertyId: string) => {
    const property = properties.find((item) => item.id === propertyId);
    setForm((current) => ({
      ...current,
      propertyId,
      currency: property?.currency ?? current.currency,
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
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

      const response = await fetch(`/api/workspaces/${workspaceSlug}/opportunities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Failed to create opportunity.");
      }

      onCreated();
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Failed to create opportunity.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="New opportunity"
      className="w-[min(100%,480px)]"
    >
      <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
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
            disabled={loadingOptions || Boolean(initialValues?.leadId)}
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
            disabled={loadingOptions || Boolean(initialValues?.propertyId)}
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
            <Input
              id="opp-currency"
              value={form.currency}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  currency: event.target.value.toUpperCase(),
                }))
              }
              maxLength={3}
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

        {error && (
          <p className="text-[12.5px] text-[var(--color-danger-fg)]">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || loadingOptions}>
            {submitting ? "Creating…" : "Create opportunity"}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
