import "server-only";

import { HUBSPOT_ONGOING_CONTACT_PROPERTIES } from "@/lib/hubspot-ongoing-sync";
import {
  HUBSPOT_EMAIL_PROPERTIES,
  HUBSPOT_NOTE_PROPERTIES,
  mapHubSpotEmailObjectToTimelineItem,
  mapHubSpotFormMessageToTimelineItem,
  mapHubSpotNoteObjectToTimelineItem,
  type HubSpotTimelineItem,
} from "@/lib/hubspot-notes-sync";
import { AppError } from "@/server/errors";

export type HubSpotContact = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  createdAt: string | null;
  lastModifiedAt: string | null;
  properties: Record<string, string | null>;
};

export type HubSpotProjectSummary = {
  id: string;
  name: string;
  properties: Record<string, string | null>;
};

export type HubSpotCapabilityCheck = {
  key:
    | "contacts_read"
    | "companies_read"
    | "projects_read"
    | "contact_createdate"
    | "contact_company_associations"
    | "contact_project_associations";
  ok: boolean;
  statusCode: number | null;
  detail: string;
  sample?: Record<string, unknown>;
};

export type HubSpotCapabilityProbeResult = {
  ok: boolean;
  checkedAt: string;
  checks: HubSpotCapabilityCheck[];
};

type HubSpotListResponse = {
  results?: Array<{
    id?: string;
    properties?: Record<string, string | null | undefined>;
    createdAt?: string;
  }>;
  paging?: { next?: { after?: string } };
};

type HubSpotAssociationsResponse = {
  results?: Array<{ toObjectId?: string | number; associationTypes?: unknown[] }>;
};

function readProperty(
  properties: Record<string, string | null | undefined> | undefined,
  key: string,
): string | null {
  const value = properties?.[key];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function hubspotGetJson(input: {
  accessToken: string;
  path: string;
  searchParams?: Record<string, string>;
}): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = new URL(`https://api.hubapi.com${input.path}`);
  for (const [key, value] of Object.entries(input.searchParams ?? {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      Accept: "application/json",
    },
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return { ok: response.ok, status: response.status, body };
}

async function hubspotPostJson(input: {
  accessToken: string;
  path: string;
  body: unknown;
}): Promise<{ ok: boolean; status: number; body: unknown }> {
  const response = await fetch(`https://api.hubapi.com${input.path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input.body),
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return { ok: response.ok, status: response.status, body };
}

export type HubSpotContactRaw = {
  id: string;
  properties: Record<string, string | null>;
};

export async function fetchHubSpotContactsByIds(input: {
  accessToken: string;
  contactIds: string[];
  properties: string[];
}): Promise<HubSpotContactRaw[]> {
  if (input.contactIds.length === 0) {
    return [];
  }

  const results: HubSpotContactRaw[] = [];
  const chunkSize = 100;
  for (let offset = 0; offset < input.contactIds.length; offset += chunkSize) {
    const chunk = input.contactIds.slice(offset, offset + chunkSize);
    const { ok, status, body } = await hubspotPostJson({
      accessToken: input.accessToken,
      path: "/crm/v3/objects/contacts/batch/read",
      body: {
        properties: input.properties,
        inputs: chunk.map((id) => ({ id })),
      },
    });

    if (!ok) {
      throw new AppError(
        "INTERNAL_ERROR",
        `HubSpot contact batch read failed (${status}).`,
        { expose: false },
      );
    }

    const payload = body as {
      results?: Array<{
        id?: string;
        properties?: Record<string, string | null | undefined>;
      }>;
    };

    for (const result of payload.results ?? []) {
      results.push({
        id: String(result.id ?? ""),
        properties: Object.fromEntries(
          Object.entries(result.properties ?? {}).map(([key, value]) => [
            key,
            typeof value === "string" ? value : null,
          ]),
        ),
      });
    }
  }

  return results;
}

export async function fetchHubSpotContact(input: {
  accessToken: string;
  contactId: string;
}): Promise<HubSpotContact> {
  const { ok, status, body } = await hubspotGetJson({
    accessToken: input.accessToken,
    path: `/crm/v3/objects/contacts/${encodeURIComponent(input.contactId)}`,
    searchParams: {
      properties: [...HUBSPOT_ONGOING_CONTACT_PROPERTIES].join(","),
    },
  });

  if (status === 404) {
    throw new AppError("NOT_FOUND", "HubSpot contact not found.");
  }

  if (!ok) {
    throw new AppError(
      "INTERNAL_ERROR",
      `HubSpot contact fetch failed (${status}).`,
      { expose: false },
    );
  }

  const payload = body as {
    id?: string;
    properties?: Record<string, string | null | undefined>;
    createdAt?: string;
    updatedAt?: string;
  };
  return mapHubSpotContactFromPayload(payload, input.contactId);
}

export function mapHubSpotContactFromPayload(
  payload: {
    id?: string;
    properties?: Record<string, string | null | undefined>;
    createdAt?: string;
    updatedAt?: string;
  },
  fallbackId?: string,
): HubSpotContact {
  const properties = payload.properties ?? {};
  const firstName = readProperty(properties, "firstname") ?? "HubSpot";
  const lastName = readProperty(properties, "lastname") ?? "Contact";
  const email = readProperty(properties, "email");
  const phone =
    readProperty(properties, "phone") ?? readProperty(properties, "mobilephone");
  const createdAt =
    readProperty(properties, "createdate") ??
    (typeof payload.createdAt === "string" ? payload.createdAt : null);
  const lastModifiedAt =
    readProperty(properties, "hs_lastmodifieddate") ??
    readProperty(properties, "lastmodifieddate") ??
    (typeof payload.updatedAt === "string" ? payload.updatedAt : null);

  return {
    id: payload.id ?? fallbackId ?? "",
    firstName,
    lastName,
    email,
    phone,
    createdAt,
    lastModifiedAt,
    properties: Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [
        key,
        typeof value === "string" ? value : null,
      ]),
    ),
  };
}

export function mapHubSpotSearchHitToContact(raw: HubSpotContactRaw): HubSpotContact {
  return mapHubSpotContactFromPayload({ id: raw.id, properties: raw.properties }, raw.id);
}

async function searchHubSpotContacts(input: {
  accessToken: string;
  filterGroups: Array<{ filters: Array<Record<string, string>> }>;
  sortProperty: string;
  after?: string | null;
  limit?: number;
}): Promise<{ contacts: HubSpotContact[]; nextAfter: string | null }> {
  const { ok, status, body } = await hubspotPostJson({
    accessToken: input.accessToken,
    path: "/crm/v3/objects/contacts/search",
    body: {
      filterGroups: input.filterGroups,
      sorts: [
        { propertyName: input.sortProperty, direction: "ASCENDING" },
        { propertyName: "hs_object_id", direction: "ASCENDING" },
      ],
      properties: [...HUBSPOT_ONGOING_CONTACT_PROPERTIES],
      limit: Math.min(Math.max(input.limit ?? 50, 1), 100),
      ...(input.after ? { after: input.after } : {}),
    },
  });

  if (!ok) {
    throw new AppError(
      "INTERNAL_ERROR",
      `HubSpot contact search failed (${status}).`,
      { expose: false },
    );
  }

  const payload = body as {
    results?: Array<{
      id?: string;
      properties?: Record<string, string | null | undefined>;
      createdAt?: string;
      updatedAt?: string;
    }>;
    paging?: { next?: { after?: string } };
  };

  return {
    contacts: (payload.results ?? []).map((result) => mapHubSpotContactFromPayload(result, result.id)),
    nextAfter: payload.paging?.next?.after ?? null,
  };
}

export async function searchHubSpotContactsByEmail(input: {
  accessToken: string;
  email: string;
}): Promise<HubSpotContact[]> {
  const email = input.email.trim();
  if (!email) {
    return [];
  }
  const page = await searchHubSpotContacts({
    accessToken: input.accessToken,
    filterGroups: [
      {
        filters: [
          {
            propertyName: "email",
            operator: "EQ",
            value: email,
          },
        ],
      },
    ],
    sortProperty: "createdate",
    limit: 2,
  });
  return page.contacts;
}

export async function searchHubSpotContactsModifiedSince(input: {
  accessToken: string;
  modifiedAfterIso: string;
  after?: string | null;
  limit?: number;
  operator?: "GT" | "GTE";
}): Promise<{ contacts: HubSpotContact[]; nextAfter: string | null }> {
  const modifiedMs = Date.parse(input.modifiedAfterIso);
  if (!Number.isFinite(modifiedMs)) {
    throw new AppError("VALIDATION_ERROR", "Invalid HubSpot reconcile watermark.");
  }

  return searchHubSpotContacts({
    accessToken: input.accessToken,
    filterGroups: [
      {
        filters: [
          {
            propertyName: "lastmodifieddate",
            operator: input.operator ?? "GTE",
            value: String(modifiedMs),
          },
        ],
      },
    ],
    sortProperty: "lastmodifieddate",
    after: input.after,
    limit: input.limit,
  });
}

export async function searchHubSpotContactsCreatedOrModifiedSince(input: {
  accessToken: string;
  sinceIso: string;
  after?: string | null;
  limit?: number;
}): Promise<{ contacts: HubSpotContact[]; nextAfter: string | null }> {
  const sinceMs = Date.parse(input.sinceIso);
  if (!Number.isFinite(sinceMs)) {
    throw new AppError("VALIDATION_ERROR", "Invalid HubSpot cutover watermark.");
  }

  return searchHubSpotContacts({
    accessToken: input.accessToken,
    filterGroups: [
      {
        filters: [
          {
            propertyName: "createdate",
            operator: "GT",
            value: String(sinceMs),
          },
        ],
      },
      {
        filters: [
          {
            propertyName: "lastmodifieddate",
            operator: "GTE",
            value: String(sinceMs),
          },
        ],
      },
    ],
    sortProperty: "lastmodifieddate",
    after: input.after,
    limit: input.limit,
  });
}

export async function fetchHubSpotContactProjectAssociationIds(input: {
  accessToken: string;
  contactId: string;
}): Promise<string[]> {
  const { ok, body } = await hubspotGetJson({
    accessToken: input.accessToken,
    path: `/crm/v4/objects/contacts/${encodeURIComponent(input.contactId)}/associations/projects`,
  });
  if (!ok) {
    return [];
  }
  const payload = body as HubSpotAssociationsResponse;
  return (payload.results ?? [])
    .map((row) => (row.toObjectId == null ? "" : String(row.toObjectId)))
    .filter(Boolean);
}

async function fetchHubSpotAssociationIds(input: {
  accessToken: string;
  contactId: string;
  toObjectType: "notes" | "emails";
}): Promise<string[]> {
  const { ok, body } = await hubspotGetJson({
    accessToken: input.accessToken,
    path: `/crm/v4/objects/contacts/${encodeURIComponent(input.contactId)}/associations/${input.toObjectType}`,
  });
  if (!ok) {
    return [];
  }
  const payload = body as HubSpotAssociationsResponse;
  return (payload.results ?? [])
    .map((row) => (row.toObjectId == null ? "" : String(row.toObjectId)))
    .filter(Boolean);
}

async function batchReadHubSpotObjects(input: {
  accessToken: string;
  objectType: "notes" | "emails";
  ids: string[];
  properties: readonly string[];
}): Promise<Array<{ id: string; properties: Record<string, string | null> }>> {
  if (input.ids.length === 0) {
    return [];
  }
  const results: Array<{ id: string; properties: Record<string, string | null> }> = [];
  const chunkSize = 100;
  for (let offset = 0; offset < input.ids.length; offset += chunkSize) {
    const chunk = input.ids.slice(offset, offset + chunkSize);
    const { ok, body } = await hubspotPostJson({
      accessToken: input.accessToken,
      path: `/crm/v3/objects/${input.objectType}/batch/read`,
      body: {
        properties: [...input.properties],
        inputs: chunk.map((id) => ({ id })),
      },
    });
    if (!ok) {
      continue;
    }
    const payload = body as {
      results?: Array<{ id?: string; properties?: Record<string, string | null | undefined> }>;
    };
    for (const row of payload.results ?? []) {
      if (!row.id) {
        continue;
      }
      results.push({
        id: String(row.id),
        properties: Object.fromEntries(
          Object.entries(row.properties ?? {}).map(([key, value]) => [
            key,
            typeof value === "string" ? value : null,
          ]),
        ),
      });
    }
  }
  return results;
}

export async function listHubSpotContactTimelineItems(input: {
  accessToken: string;
  contactId: string;
  formMessage?: string | null;
  formLabel?: string | null;
  formOccurredAt?: string | null;
}): Promise<HubSpotTimelineItem[]> {
  const [noteIds, emailIds] = await Promise.all([
    fetchHubSpotAssociationIds({
      accessToken: input.accessToken,
      contactId: input.contactId,
      toObjectType: "notes",
    }),
    fetchHubSpotAssociationIds({
      accessToken: input.accessToken,
      contactId: input.contactId,
      toObjectType: "emails",
    }),
  ]);

  const [notes, emails] = await Promise.all([
    batchReadHubSpotObjects({
      accessToken: input.accessToken,
      objectType: "notes",
      ids: noteIds,
      properties: HUBSPOT_NOTE_PROPERTIES,
    }),
    batchReadHubSpotObjects({
      accessToken: input.accessToken,
      objectType: "emails",
      ids: emailIds,
      properties: HUBSPOT_EMAIL_PROPERTIES,
    }),
  ]);

  const items: HubSpotTimelineItem[] = [
    ...notes.map((note) =>
      mapHubSpotNoteObjectToTimelineItem({
        id: note.id,
        contactId: input.contactId,
        properties: note.properties,
      }),
    ),
    ...emails.map((email) =>
      mapHubSpotEmailObjectToTimelineItem({
        id: email.id,
        contactId: input.contactId,
        properties: email.properties,
      }),
    ),
  ];

  const formItem = mapHubSpotFormMessageToTimelineItem({
    contactId: input.contactId,
    message: input.formMessage,
    formLabel: input.formLabel,
    occurredAt: input.formOccurredAt,
  });
  if (formItem) {
    items.push(formItem);
  }

  return items;
}

export async function searchHubSpotNoteObjectsModifiedSince(input: {
  accessToken: string;
  modifiedAfterIso: string;
  after?: string | null;
  limit?: number;
}): Promise<{ ids: string[]; nextAfter: string | null }> {
  const modifiedMs = Date.parse(input.modifiedAfterIso);
  if (!Number.isFinite(modifiedMs)) {
    throw new AppError("VALIDATION_ERROR", "Invalid HubSpot notes watermark.");
  }
  const { ok, body } = await hubspotPostJson({
    accessToken: input.accessToken,
    path: "/crm/v3/objects/notes/search",
    body: {
      filterGroups: [
        {
          filters: [
            {
              propertyName: "hs_lastmodifieddate",
              operator: "GTE",
              value: String(modifiedMs),
            },
          ],
        },
      ],
      sorts: [{ propertyName: "hs_lastmodifieddate", direction: "ASCENDING" }],
      properties: ["hs_lastmodifieddate"],
      limit: Math.min(Math.max(input.limit ?? 50, 1), 100),
      ...(input.after ? { after: input.after } : {}),
    },
  });
  if (!ok) {
    return { ids: [], nextAfter: null };
  }
  const payload = body as {
    results?: Array<{ id?: string }>;
    paging?: { next?: { after?: string } };
  };
  return {
    ids: (payload.results ?? []).map((row) => String(row.id ?? "")).filter(Boolean),
    nextAfter: payload.paging?.next?.after ?? null,
  };
}

export async function fetchHubSpotNoteContactIds(input: {
  accessToken: string;
  noteId: string;
}): Promise<string[]> {
  const { ok, body } = await hubspotGetJson({
    accessToken: input.accessToken,
    path: `/crm/v4/objects/notes/${encodeURIComponent(input.noteId)}/associations/contacts`,
  });
  if (!ok) {
    return [];
  }
  const payload = body as HubSpotAssociationsResponse;
  return (payload.results ?? [])
    .map((row) => (row.toObjectId == null ? "" : String(row.toObjectId)))
    .filter(Boolean);
}

export async function assertHubSpotAccessToken(accessToken: string): Promise<void> {
  const { ok, status } = await hubspotGetJson({
    accessToken,
    path: "/crm/v3/objects/contacts",
    searchParams: { limit: "1" },
  });

  if (status === 401 || status === 403) {
    throw new AppError(
      "VALIDATION_ERROR",
      "HubSpot access token is invalid or missing contacts read permission.",
    );
  }

  if (!ok) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Unable to verify HubSpot access token (${status}).`,
    );
  }
}

function projectDisplayName(
  properties: Record<string, string | null | undefined> | undefined,
  id: string,
): string {
  return (
    readProperty(properties, "hs_name") ??
    readProperty(properties, "hs_project_name") ??
    readProperty(properties, "name") ??
    `HubSpot project ${id}`
  );
}

/**
 * List HubSpot CRM Projects (requires crm.objects.projects.read).
 * Paginates until exhausted or maxPages is reached.
 */
export async function listHubSpotProjects(input: {
  accessToken: string;
  maxPages?: number;
  pageSize?: number;
}): Promise<HubSpotProjectSummary[]> {
  const maxPages = input.maxPages ?? 50;
  const pageSize = input.pageSize ?? 100;
  const projects: HubSpotProjectSummary[] = [];
  let after: string | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    const searchParams: Record<string, string> = {
      limit: String(pageSize),
      properties: ["hs_name", "hs_project_name", "name", "hs_pipeline", "hs_status"].join(","),
    };
    if (after) {
      searchParams.after = after;
    }

    const { ok, status, body } = await hubspotGetJson({
      accessToken: input.accessToken,
      path: "/crm/v3/objects/projects",
      searchParams,
    });

    if (!ok) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Unable to list HubSpot projects (${status}). Ensure crm.objects.projects.read is granted.`,
      );
    }

    const payload = body as HubSpotListResponse;
    for (const row of payload.results ?? []) {
      if (!row.id) {
        continue;
      }
      projects.push({
        id: row.id,
        name: projectDisplayName(row.properties, row.id),
        properties: Object.fromEntries(
          Object.entries(row.properties ?? {}).map(([key, value]) => [
            key,
            typeof value === "string" ? value : null,
          ]),
        ),
      });
    }

    after = payload.paging?.next?.after;
    if (!after) {
      break;
    }
  }

  return projects;
}

async function checkListObject(input: {
  accessToken: string;
  key: HubSpotCapabilityCheck["key"];
  path: string;
  detailOk: string;
  detailFail: string;
}): Promise<HubSpotCapabilityCheck> {
  const { ok, status, body } = await hubspotGetJson({
    accessToken: input.accessToken,
    path: input.path,
    searchParams: { limit: "1" },
  });

  if (!ok) {
    return {
      key: input.key,
      ok: false,
      statusCode: status,
      detail: `${input.detailFail} (HTTP ${status}).`,
    };
  }

  const results = (body as HubSpotListResponse).results ?? [];
  return {
    key: input.key,
    ok: true,
    statusCode: status,
    detail: input.detailOk,
    sample: results[0]
      ? {
          id: results[0].id ?? null,
          propertyKeys: Object.keys(results[0].properties ?? {}),
        }
      : { empty: true },
  };
}

/**
 * Phase 0 probe: verify read access for migration-relevant HubSpot objects
 * without writing data or requiring a client secret.
 */
export async function probeHubSpotCapabilities(
  accessToken: string,
): Promise<HubSpotCapabilityProbeResult> {
  const checks: HubSpotCapabilityCheck[] = [];

  const contacts = await checkListObject({
    accessToken,
    key: "contacts_read",
    path: "/crm/v3/objects/contacts",
    detailOk: "Can list contacts.",
    detailFail: "Cannot list contacts",
  });
  checks.push(contacts);

  checks.push(
    await checkListObject({
      accessToken,
      key: "companies_read",
      path: "/crm/v3/objects/companies",
      detailOk: "Can list companies.",
      detailFail: "Cannot list companies",
    }),
  );

  checks.push(
    await checkListObject({
      accessToken,
      key: "projects_read",
      path: "/crm/v3/objects/projects",
      detailOk: "Can list HubSpot projects.",
      detailFail: "Cannot list HubSpot projects",
    }),
  );

  // Sample contact for createdate + associations
  let sampleContactId: string | null = null;
  if (contacts.ok) {
    const listed = await hubspotGetJson({
      accessToken,
      path: "/crm/v3/objects/contacts",
      searchParams: {
        limit: "1",
        properties: "email,firstname,lastname,createdate,company",
      },
    });
    const first = (listed.body as HubSpotListResponse).results?.[0];
    sampleContactId = first?.id ?? null;

    if (sampleContactId) {
      const detail = await fetchHubSpotContact({
        accessToken,
        contactId: sampleContactId,
      }).catch((error) => {
        checks.push({
          key: "contact_createdate",
          ok: false,
          statusCode: null,
          detail: error instanceof Error ? error.message : "Contact detail fetch failed.",
        });
        return null;
      });

      if (detail) {
        checks.push({
          key: "contact_createdate",
          ok: Boolean(detail.createdAt),
          statusCode: 200,
          detail: detail.createdAt
            ? "Contact createdate is readable."
            : "Contact fetched but createdate was empty.",
          sample: {
            contactId: detail.id,
            createdAt: detail.createdAt,
            email: detail.email,
            companyProperty: detail.properties.company ?? null,
          },
        });

        const companyAssoc = await hubspotGetJson({
          accessToken,
          path: `/crm/v4/objects/contacts/${encodeURIComponent(sampleContactId)}/associations/companies`,
        });
        checks.push({
          key: "contact_company_associations",
          ok: companyAssoc.ok,
          statusCode: companyAssoc.status,
          detail: companyAssoc.ok
            ? `Company associations readable (${(companyAssoc.body as HubSpotAssociationsResponse).results?.length ?? 0} on sample).`
            : `Cannot read contact→company associations (HTTP ${companyAssoc.status}).`,
          sample: companyAssoc.ok
            ? {
                count: (companyAssoc.body as HubSpotAssociationsResponse).results?.length ?? 0,
              }
            : undefined,
        });

        const projectAssoc = await hubspotGetJson({
          accessToken,
          path: `/crm/v4/objects/contacts/${encodeURIComponent(sampleContactId)}/associations/projects`,
        });
        checks.push({
          key: "contact_project_associations",
          ok: projectAssoc.ok,
          statusCode: projectAssoc.status,
          detail: projectAssoc.ok
            ? `Project associations readable (${(projectAssoc.body as HubSpotAssociationsResponse).results?.length ?? 0} on sample).`
            : `Cannot read contact→project associations (HTTP ${projectAssoc.status}).`,
          sample: projectAssoc.ok
            ? {
                count: (projectAssoc.body as HubSpotAssociationsResponse).results?.length ?? 0,
              }
            : undefined,
        });
      }
    } else {
      checks.push({
        key: "contact_createdate",
        ok: false,
        statusCode: 200,
        detail: "No contacts available to sample createdate/associations.",
      });
      checks.push({
        key: "contact_company_associations",
        ok: false,
        statusCode: null,
        detail: "Skipped — no sample contact.",
      });
      checks.push({
        key: "contact_project_associations",
        ok: false,
        statusCode: null,
        detail: "Skipped — no sample contact.",
      });
    }
  } else {
    for (const key of [
      "contact_createdate",
      "contact_company_associations",
      "contact_project_associations",
    ] as const) {
      checks.push({
        key,
        ok: false,
        statusCode: contacts.statusCode,
        detail: "Skipped — contacts read failed.",
      });
    }
  }

  return {
    ok: checks.every((check) => check.ok),
    checkedAt: new Date().toISOString(),
    checks,
  };
}
