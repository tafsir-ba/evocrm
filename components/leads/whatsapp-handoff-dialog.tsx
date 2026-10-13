"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Input, Label, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { readLeadIntegrationAttributes } from "@/lib/lead-integration-attributes";
import {
  loadLeadWhatsAppDraft,
  type LoadedLeadWhatsAppDraft,
} from "@/lib/lead-whatsapp-welcome";
import { countryDisplayName } from "@/lib/project-location";
import {
  phoneCountryOptions,
  resolveWhatsAppDestination,
  whatsAppDraftUrl,
  type WhatsAppDestination,
} from "@/lib/whatsapp-destination";
import {
  chooseWhatsAppProject,
  type LeadProjectLinks,
} from "@/lib/whatsapp-project-context";

export type WhatsAppHandoffLead = LeadProjectLinks & {
  id: string;
  fullName: string;
  firstName?: string | null;
  lastName?: string | null;
  phone: string | null;
  attributes?: Record<string, unknown> | null;
  project?: { id: string; name: string } | null;
  projectMemberships?: Array<{
    projectId: string;
    isPrimary?: boolean;
    project?: { id: string; name: string } | null;
  }>;
  secondaryProjects?: Array<{ id: string; name: string }>;
};

type DraftState =
  | { key: string; status: "loading" }
  | { key: string; status: "loaded"; draft: LoadedLeadWhatsAppDraft }
  | { key: string; status: "error" };

function projectOptions(
  lead: WhatsAppHandoffLead,
): Array<{ id: string; name: string }> {
  const byId = new Map<string, string>();
  if (lead.project) {
    byId.set(lead.project.id, lead.project.name);
  }
  for (const membership of lead.projectMemberships ?? []) {
    if (!byId.has(membership.projectId)) {
      byId.set(membership.projectId, membership.project?.name ?? "Project");
    }
  }
  for (const project of lead.secondaryProjects ?? []) {
    if (!byId.has(project.id)) {
      byId.set(project.id, project.name);
    }
  }
  return [...byId.entries()].map(([id, name]) => ({ id, name }));
}

function countrySourceText(
  destination: Extract<WhatsAppDestination, { status: "ready" }>,
  projectName: string | null,
  projectCountry: string | null,
): string {
  if (destination.source === "explicit_prefix") {
    const differs =
      projectCountry &&
      destination.countryCode &&
      projectCountry !== destination.countryCode;
    return differs
      ? `Taken from the number's own +${destination.callingCode} prefix. It is kept even though ${projectName ?? "the project"} is in ${countryDisplayName(projectCountry) ?? projectCountry}.`
      : `Taken from the number's own +${destination.callingCode} prefix.`;
  }
  if (destination.source === "manual") {
    return "Country chosen by you for this handoff.";
  }
  return `Inferred from the project${projectName ? ` ${projectName}` : ""} location. Check it before opening WhatsApp.`;
}

/**
 * Confirms the destination and draft text before opening wa.me. Corrections here apply to this
 * handoff only; the lead's saved phone is never changed. WhatsApp opens a draft and nothing is sent.
 */
export function WhatsAppHandoffDialog({
  open,
  onClose,
  workspaceSlug,
  lead,
  activeProjectId,
  fetchImpl,
}: {
  open: boolean;
  onClose: () => void;
  workspaceSlug: string;
  lead: WhatsAppHandoffLead;
  activeProjectId?: string | null;
  fetchImpl?: typeof fetch;
}) {
  const fieldId = useId();
  const choices = useMemo(() => projectOptions(lead), [lead]);
  const choice = useMemo(
    () => chooseWhatsAppProject(lead, activeProjectId),
    [lead, activeProjectId],
  );
  const [projectId, setProjectId] = useState<string | null>(
    choice.status === "resolved" ? choice.projectId : null,
  );
  const [countryOverride, setCountryOverride] = useState("");
  const [numberOverride, setNumberOverride] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const requestRef = useRef(0);

  const resolvedProjectId =
    choice.status === "resolved" ? choice.projectId : null;
  const choiceKey = `${lead.id}:${choice.status}:${resolvedProjectId ?? ""}`;
  useEffect(() => {
    setProjectId(resolvedProjectId);
    setCountryOverride("");
    setNumberOverride(null);
    setCorrecting(false);
  }, [choiceKey, resolvedProjectId]);

  const propertyReference = readLeadIntegrationAttributes(
    lead.attributes,
  )?.propertyReference;
  const needsProjectChoice = choice.status === "ambiguous" && !projectId;
  const draftKey = `${lead.id}:${projectId ?? "none"}`;

  useEffect(() => {
    if (!open || needsProjectChoice) {
      return;
    }
    const request = ++requestRef.current;
    setDraftState({ key: draftKey, status: "loading" });
    loadLeadWhatsAppDraft({
      workspaceSlug,
      leadId: lead.id,
      fullName: lead.fullName,
      firstName: lead.firstName,
      lastName: lead.lastName,
      projectId,
      propertyReference,
      fetchImpl,
    })
      .then((draft) => {
        if (request === requestRef.current) {
          setDraftState({ key: draftKey, status: "loaded", draft });
        }
      })
      .catch(() => {
        if (request === requestRef.current) {
          setDraftState({ key: draftKey, status: "error" });
        }
      });
  }, [
    open,
    needsProjectChoice,
    draftKey,
    workspaceSlug,
    lead.id,
    lead.fullName,
    lead.firstName,
    lead.lastName,
    projectId,
    propertyReference,
    fetchImpl,
  ]);

  const current = draftState?.key === draftKey ? draftState : null;
  const draft = current?.status === "loaded" ? current.draft : null;
  const projectCountry = draft?.project?.countryCode ?? null;
  const projectName =
    draft?.project?.name ??
    choices.find((item) => item.id === projectId)?.name ??
    null;
  const countryCode =
    countryOverride || (current?.status === "loaded" ? projectCountry : null);
  const phone = numberOverride ?? lead.phone ?? "";
  const destination = resolveWhatsAppDestination(
    phone,
    countryCode
      ? { code: countryCode, source: countryOverride ? "manual" : "project" }
      : null,
  );
  const waitingForCountry =
    destination.status === "unresolved" &&
    destination.issue === "needs_country" &&
    !countryOverride &&
    (!current || current.status === "loading" || needsProjectChoice);
  const showCorrection =
    correcting || (destination.status === "unresolved" && !waitingForCountry);
  const href =
    destination.status === "ready" && draft?.message
      ? whatsAppDraftUrl(destination.waNumber, draft.message)
      : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`WhatsApp ${lead.fullName}`}
      className="max-w-lg"
    >
      <div className="space-y-4 text-[13px]">
        {choices.length > 1 || needsProjectChoice ? (
          <div>
            <Label htmlFor={`${fieldId}-project`}>
              Project for country and message
            </Label>
            <Select
              id={`${fieldId}-project`}
              value={projectId ?? ""}
              onChange={(event) => setProjectId(event.target.value || null)}
            >
              <option value="">
                {needsProjectChoice ? "Choose a project…" : "No project"}
              </option>
              {choices.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
            {needsProjectChoice ? (
              <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
                This lead belongs to several projects and none is primary.
                Choose the project to interpret a local number and pick its
                WhatsApp text.
              </p>
            ) : null}
          </div>
        ) : null}

        <section
          aria-label="WhatsApp destination"
          className="rounded-lg border border-[var(--color-line)] p-3"
        >
          <p className="text-[12px] text-[var(--color-ink-muted)]">
            Saved phone
          </p>
          <p className="tabular text-[var(--color-ink)]">{lead.phone || "—"}</p>
          {destination.status === "ready" ? (
            <div className="mt-2" data-testid="whatsapp-destination">
              <p className="text-[12px] text-[var(--color-ink-muted)]">
                Opens WhatsApp chat with
              </p>
              <p className="tabular text-[15px] font-semibold text-[var(--color-ink)]">
                {destination.display}
              </p>
              <p className="text-[12.5px] text-[var(--color-ink-soft)]">
                {destination.countryName ?? "Unknown country"}
                {destination.countryCode ? ` (${destination.countryCode})` : ""}
              </p>
              <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
                {countrySourceText(destination, projectName, projectCountry)}
              </p>
            </div>
          ) : waitingForCountry ? (
            <p className="mt-2 text-[var(--color-ink-muted)]">
              {needsProjectChoice
                ? "Choose a project to interpret this number."
                : "Loading project country…"}
            </p>
          ) : (
            <p
              role="alert"
              className="mt-2 text-[var(--color-danger-fg)]"
              data-testid="whatsapp-destination-issue"
            >
              {destination.message}
              {destination.issue === "needs_country" &&
              current?.status === "loaded" &&
              draft?.project &&
              !projectCountry
                ? ` ${projectName ?? "The project"} has no recognized country.`
                : ""}
            </p>
          )}
          {!showCorrection ? (
            <button
              type="button"
              className="mt-2 text-[12.5px] font-medium text-[var(--color-brand-700)] hover:underline"
              onClick={() => setCorrecting(true)}
            >
              Wrong number or country?
            </button>
          ) : null}
        </section>

        {showCorrection ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${fieldId}-country`}>
                Country for a local number
              </Label>
              <Select
                id={`${fieldId}-country`}
                value={countryOverride}
                onChange={(event) => setCountryOverride(event.target.value)}
              >
                <option value="">
                  {projectCountry
                    ? `Project country (${countryDisplayName(projectCountry) ?? projectCountry})`
                    : "Choose country…"}
                </option>
                {phoneCountryOptions().map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor={`${fieldId}-number`}>
                Number for this message
              </Label>
              <Input
                id={`${fieldId}-number`}
                inputMode="tel"
                autoComplete="off"
                value={phone}
                onChange={(event) => setNumberOverride(event.target.value)}
              />
            </div>
            <p className="text-[12px] text-[var(--color-ink-muted)] sm:col-span-2">
              Used for this WhatsApp only. The lead&apos;s saved phone is not
              changed; edit the lead to fix it permanently.
            </p>
          </div>
        ) : null}

        <section aria-label="WhatsApp draft">
          <p className="text-[12px] text-[var(--color-ink-muted)]">
            {draft?.source === "project_template"
              ? `Draft from ${projectName ?? "the project"}'s WhatsApp text`
              : draft?.source === "unavailable"
                ? "Draft"
                : "Draft (generated welcome)"}
          </p>
          {current?.status === "loading" ||
          (!current && !needsProjectChoice) ? (
            <p className="mt-1 text-[var(--color-ink-muted)]">Loading draft…</p>
          ) : current?.status === "error" ? (
            <p role="alert" className="mt-1 text-[var(--color-danger-fg)]">
              Could not load the draft. Close and try again.
            </p>
          ) : draft && draft.errors.length > 0 ? (
            <p role="alert" className="mt-1 text-[var(--color-danger-fg)]">
              {draft.errors.join(" ")}
            </p>
          ) : draft?.message ? (
            <pre
              data-testid="whatsapp-draft-preview"
              className="mt-1 max-h-48 overflow-auto rounded-md bg-[var(--color-canvas)] p-2 font-sans text-[12.5px] whitespace-pre-wrap text-[var(--color-ink)]"
            >
              {draft.message}
            </pre>
          ) : null}
          {draft?.unlinkedFileNames.length ? (
            <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
              Files without a public link must be attached in WhatsApp.
            </p>
          ) : null}
        </section>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-[var(--color-ink-muted)]">
            Opens an editable WhatsApp draft. Nothing is sent until you press
            send in WhatsApp.
          </p>
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand-600)] px-4 text-[13.5px] font-medium text-white hover:bg-[var(--color-brand-700)]"
            >
              Open WhatsApp draft
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-muted)] px-4 text-[13.5px] font-medium text-[var(--color-ink-muted)]"
            >
              Open WhatsApp draft
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
