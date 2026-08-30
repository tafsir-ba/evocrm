"use client";

import { useState } from "react";

import { Input, Label, Select } from "@/components/ui/input";
import {
  COUNTRY_DISPLAY_NAMES,
  SWISS_CANTONS,
  type ProjectLocation,
} from "@/lib/project-location";

const OTHER_COUNTRY = "__other";

const COUNTRY_OPTIONS = [
  { code: "CH", name: COUNTRY_DISPLAY_NAMES.CH ?? "Switzerland" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "IT", name: "Italy" },
  { code: "AT", name: "Austria" },
  { code: "LI", name: "Liechtenstein" },
  { code: "JM", name: COUNTRY_DISPLAY_NAMES.JM ?? "Jamaica" },
] as const;

export type LocationFieldsProps = {
  idPrefix?: string;
  value: ProjectLocation;
  onChange: (next: ProjectLocation) => void;
  disabled?: boolean;
};

function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function LocationFields({
  idPrefix = "location",
  value,
  onChange,
  disabled = false,
}: LocationFieldsProps) {
  const knownCountry = COUNTRY_OPTIONS.some((option) => option.code === value.countryCode);
  const countrySelectValue =
    value.countryCode && knownCountry ? value.countryCode : value.countryName ? OTHER_COUNTRY : "";
  const isSwitzerland = value.countryCode === "CH";
  const [showCoordinates, setShowCoordinates] = useState(
    value.latitude != null && value.longitude != null && Boolean(value.sourceUrl),
  );

  function patch(partial: Partial<ProjectLocation>) {
    onChange({ ...value, ...partial });
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <Label htmlFor={`${idPrefix}-country`}>Country</Label>
        <Select
          id={`${idPrefix}-country`}
          value={countrySelectValue}
          disabled={disabled}
          onChange={(event) => {
            const next = event.target.value;
            if (next === "" || next === OTHER_COUNTRY) {
              patch({
                countryCode: null,
                countryName: next === OTHER_COUNTRY ? value.countryName : null,
                cantonCode: null,
                cantonName: null,
              });
              return;
            }
            const option = COUNTRY_OPTIONS.find((item) => item.code === next);
            patch({
              countryCode: option?.code ?? next,
              countryName: option?.name ?? next,
              cantonCode: option?.code === "CH" ? value.cantonCode : null,
              cantonName: option?.code === "CH" ? value.cantonName : null,
            });
          }}
        >
          <option value="">Select country…</option>
          {COUNTRY_OPTIONS.map((option) => (
            <option key={option.code} value={option.code}>
              {option.name}
            </option>
          ))}
          <option value={OTHER_COUNTRY}>Other</option>
        </Select>
      </div>
      {countrySelectValue === OTHER_COUNTRY ? (
        <div>
          <Label htmlFor={`${idPrefix}-countryName`}>Country name</Label>
          <Input
            id={`${idPrefix}-countryName`}
            value={value.countryName ?? ""}
            disabled={disabled}
            onChange={(event) => patch({ countryName: event.target.value, countryCode: null })}
          />
        </div>
      ) : null}
      <div>
        {isSwitzerland ? (
          <>
            <Label htmlFor={`${idPrefix}-canton`}>Canton</Label>
            <Select
              id={`${idPrefix}-canton`}
              value={value.cantonCode ?? ""}
              disabled={disabled}
              onChange={(event) => {
                const code = event.target.value || null;
                patch({
                  cantonCode: code,
                  cantonName: code ? SWISS_CANTONS[code as keyof typeof SWISS_CANTONS] ?? null : null,
                });
              }}
            >
              <option value="">Select canton…</option>
              {Object.entries(SWISS_CANTONS).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </Select>
          </>
        ) : (
          <>
            <Label htmlFor={`${idPrefix}-region`}>Region</Label>
            <Input
              id={`${idPrefix}-region`}
              value={value.cantonName ?? ""}
              disabled={disabled}
              onChange={(event) => patch({ cantonName: event.target.value, cantonCode: null })}
            />
          </>
        )}
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-postalCode`}>Postal code</Label>
        <Input
          id={`${idPrefix}-postalCode`}
          inputMode="text"
          autoComplete="postal-code"
          value={value.postalCode ?? ""}
          disabled={disabled}
          onChange={(event) => patch({ postalCode: event.target.value })}
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-municipality`}>Locality / municipality</Label>
        <Input
          id={`${idPrefix}-municipality`}
          autoComplete="address-level2"
          value={value.municipality ?? ""}
          disabled={disabled}
          onChange={(event) => patch({ municipality: event.target.value })}
        />
      </div>
      <div className="md:col-span-2">
        <Label htmlFor={`${idPrefix}-address`}>Address / project area</Label>
        <Input
          id={`${idPrefix}-address`}
          autoComplete="street-address"
          value={value.normalizedAddress ?? ""}
          disabled={disabled}
          onChange={(event) => patch({ normalizedAddress: event.target.value })}
        />
      </div>
      <div className="md:col-span-2">
        <button
          type="button"
          aria-expanded={showCoordinates}
          onClick={() => setShowCoordinates((open) => !open)}
          className="text-[12.5px] font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] focus-ring rounded"
        >
          {showCoordinates ? "Hide coordinates" : "Add coordinates (optional)"}
        </button>
        <p className="mt-1 text-[12px] text-[var(--color-ink-faint)]">
          Stored only with a source URL. Enrichment is optional and not required to create the
          project.
        </p>
        {showCoordinates ? (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor={`${idPrefix}-latitude`}>Latitude</Label>
              <Input
                id={`${idPrefix}-latitude`}
                inputMode="decimal"
                value={value.latitude ?? ""}
                disabled={disabled}
                onChange={(event) => patch({ latitude: parseOptionalNumber(event.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor={`${idPrefix}-longitude`}>Longitude</Label>
              <Input
                id={`${idPrefix}-longitude`}
                inputMode="decimal"
                value={value.longitude ?? ""}
                disabled={disabled}
                onChange={(event) => patch({ longitude: parseOptionalNumber(event.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor={`${idPrefix}-sourceUrl`}>Source URL</Label>
              <Input
                id={`${idPrefix}-sourceUrl`}
                inputMode="url"
                placeholder="https://"
                value={value.sourceUrl ?? ""}
                disabled={disabled}
                onChange={(event) => patch({ sourceUrl: event.target.value || null })}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
