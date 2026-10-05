"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  COOKIE_CONSENT_NOTICE,
  COOKIE_CONSENT_PRIVACY_PATH,
  createAcceptedAdvertisingConsent,
  createDeclinedAdvertisingConsent,
  createManagedCookieConsent,
  isAdvertisingMeasurementAllowed,
  readCookieConsentFromStorage,
  writeCookieConsentToStorage,
  type CookieConsentRecord,
} from "@/lib/cookie-consent";

type Mode = "banner" | "manage" | "hidden";

/**
 * Kids-friendly cookie consent for OPTIONAL advertising measurement (Meta).
 * Equally visible Accept / Decline / Manage — no pre-ticked dark patterns.
 */
export function CookieConsentBanner() {
  const [mode, setMode] = useState<Mode>("hidden");
  const [record, setRecord] = useState<CookieConsentRecord | null>(null);
  const [advertisingChoice, setAdvertisingChoice] = useState(false);

  useEffect(() => {
    const existing = readCookieConsentFromStorage(
      typeof window !== "undefined" ? window.localStorage : null,
    );
    if (existing) {
      setRecord(existing);
      setAdvertisingChoice(isAdvertisingMeasurementAllowed(existing));
      setMode("hidden");
    } else {
      setMode("banner");
    }
  }, []);

  function persist(next: CookieConsentRecord) {
    writeCookieConsentToStorage(
      typeof window !== "undefined" ? window.localStorage : null,
      next,
    );
    setRecord(next);
    setAdvertisingChoice(isAdvertisingMeasurementAllowed(next));
    setMode("hidden");
  }

  if (mode === "hidden") {
    return (
      <div className="fixed bottom-3 right-3 z-40">
        <button
          type="button"
          className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-[12.5px] text-[var(--color-ink-muted)] shadow-sm hover:text-[var(--color-ink)]"
          onClick={() => {
            setAdvertisingChoice(isAdvertisingMeasurementAllowed(record));
            setMode("manage");
          }}
        >
          Cookie choices
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--color-line)] bg-white p-4 shadow-[0_-8px_24px_rgba(0,0,0,0.08)]"
      role="dialog"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-desc"
    >
      <div className="mx-auto max-w-3xl space-y-3">
        <h2
          id="cookie-consent-title"
          className="text-[15px] font-semibold text-[var(--color-ink)]"
        >
          Optional cookies for ads measurement
        </h2>
        <p
          id="cookie-consent-desc"
          className="text-[13px] text-[var(--color-ink-muted)] leading-relaxed"
        >
          {COOKIE_CONSENT_NOTICE}{" "}
          <Link
            href={COOKIE_CONSENT_PRIVACY_PATH}
            className="underline text-[var(--color-ink)]"
          >
            Read the privacy & cookie page
          </Link>
          .
        </p>

        {mode === "manage" ? (
          <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] p-3 space-y-3">
            <label className="flex items-start gap-2 text-[13px] text-[var(--color-ink)]">
              <input type="checkbox" checked disabled className="mt-1" />
              <span>
                <strong>Necessary cookies</strong> — always on. Keep the site
                working. These are not advertising consent.
              </span>
            </label>
            <label className="flex items-start gap-2 text-[13px] text-[var(--color-ink)]">
              <input
                type="checkbox"
                className="mt-1"
                checked={advertisingChoice}
                onChange={(event) => setAdvertisingChoice(event.target.checked)}
              />
              <span>
                <strong>Optional advertising measurement</strong> — Meta
                measurement and conversion tracking. Off by default. You can
                change this anytime.
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg bg-[var(--color-ink)] px-3 py-2 text-[13px] font-medium text-white"
                onClick={() =>
                  persist(
                    createManagedCookieConsent({ advertising: advertisingChoice }),
                  )
                }
              >
                Save choices
              </button>
              <button
                type="button"
                className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-[13px]"
                onClick={() => setMode(record ? "hidden" : "banner")}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-[13px] font-medium text-[var(--color-ink)]"
              onClick={() => persist(createAcceptedAdvertisingConsent())}
            >
              Accept optional cookies
            </button>
            <button
              type="button"
              className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-[13px] font-medium text-[var(--color-ink)]"
              onClick={() => persist(createDeclinedAdvertisingConsent())}
            >
              Decline
            </button>
            <button
              type="button"
              className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-[13px] font-medium text-[var(--color-ink)]"
              onClick={() => {
                setAdvertisingChoice(false);
                setMode("manage");
              }}
            >
              Manage choices
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
