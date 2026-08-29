import "server-only";

import { AppError } from "@/server/errors";

export type HubSpotContact = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  properties: Record<string, string | null>;
};

type HubSpotContactApiResponse = {
  id?: string;
  properties?: Record<string, string | null | undefined>;
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

export async function fetchHubSpotContact(input: {
  accessToken: string;
  contactId: string;
}): Promise<HubSpotContact> {
  const url = new URL(
    `https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(input.contactId)}`,
  );
  url.searchParams.set(
    "properties",
    [
      "firstname",
      "lastname",
      "email",
      "phone",
      "mobilephone",
      "hs_lead_status",
      "company",
      "jobtitle",
      "city",
      "country",
      "message",
      "notes_last_contacted",
    ].join(","),
  );

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      Accept: "application/json",
    },
  });

  if (response.status === 404) {
    throw new AppError("NOT_FOUND", "HubSpot contact not found.");
  }

  if (!response.ok) {
    throw new AppError(
      "INTERNAL_ERROR",
      `HubSpot contact fetch failed (${response.status}).`,
      { expose: false },
    );
  }

  const payload = (await response.json()) as HubSpotContactApiResponse;
  const properties = payload.properties ?? {};
  const firstName = readProperty(properties, "firstname") ?? "HubSpot";
  const lastName = readProperty(properties, "lastname") ?? "Contact";
  const email = readProperty(properties, "email");
  const phone =
    readProperty(properties, "phone") ?? readProperty(properties, "mobilephone");

  return {
    id: payload.id ?? input.contactId,
    firstName,
    lastName,
    email,
    phone,
    properties: Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [
        key,
        typeof value === "string" ? value : null,
      ]),
    ),
  };
}

export async function assertHubSpotAccessToken(accessToken: string): Promise<void> {
  const response = await fetch("https://api.hubapi.com/crm/v3/objects/contacts?limit=1", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw new AppError(
      "VALIDATION_ERROR",
      "HubSpot access token is invalid or missing contacts read permission.",
    );
  }

  if (!response.ok) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Unable to verify HubSpot access token (${response.status}).`,
    );
  }
}
