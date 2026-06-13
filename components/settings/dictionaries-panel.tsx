"use client";

import { useCallback, useEffect, useState } from "react";

import { StatusBadge } from "@/components/domain/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Skeleton } from "@/components/ui/skeleton";
import { DICTIONARY_TYPE_LABELS } from "@/lib/dictionary-constants";
import type { DictionaryType } from "@/lib/dictionary-constants";
import {
  ACTIVITY_STATUS_BEHAVIORS,
  OPPORTUNITY_STATUS_BEHAVIORS,
  dictionaryTypeRequiresBehavior,
  slugifyDictionaryKey,
  type ActivityStatusBehavior,
  type OpportunityStatusBehavior,
} from "@/lib/dictionary-form-helpers";

type DictionarySummary = {
  id: string;
  type: DictionaryType;
  name: string;
  itemCount: number;
};

type DictionaryItem = {
  id: string;
  dictionaryId: string;
  type: DictionaryType;
  label: string;
  key: string;
  color: string;
  order: number;
  isDefault: boolean;
  isActive: boolean;
  isSystem: boolean;
  behavior?: string;
  defaultProbability?: number;
};

type DictionariesPanelProps = {
  workspaceSlug: string;
  canUpdate: boolean;
};

export function DictionariesPanel({
  workspaceSlug,
  canUpdate,
}: DictionariesPanelProps) {
  const [dictionaries, setDictionaries] = useState<DictionarySummary[]>([]);
  const [selectedType, setSelectedType] = useState<DictionaryType | null>(null);
  const [items, setItems] = useState<DictionaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editColor, setEditColor] = useState("");

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newColor, setNewColor] = useState("#3B82F6");
  const [newBehavior, setNewBehavior] = useState("");
  const [newDefaultProbability, setNewDefaultProbability] = useState("");
  const [keyManuallyEdited, setKeyManuallyEdited] = useState(false);

  const apiBase = `/api/workspaces/${workspaceSlug}`;
  const selectedDictionary = dictionaries.find((d) => d.type === selectedType);
  const requiresBehavior = selectedType
    ? dictionaryTypeRequiresBehavior(selectedType)
    : false;

  const loadDictionaries = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);

    try {
      const response = await fetch(`${apiBase}/dictionaries`);
      const payload = await response.json();

      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to load dictionaries.");
      }

      const list = payload.data.dictionaries as DictionarySummary[];
      setDictionaries(list);
      setSelectedType((current) => current ?? list[0]?.type ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  const loadItems = useCallback(async () => {
    if (!selectedType) return;

    setItemsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        type: selectedType,
        includeInactive: includeInactive ? "true" : "false",
      });
      const response = await fetch(`${apiBase}/dictionary-items?${params}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to load items.");
      }

      setItems(payload.data.items as DictionaryItem[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load.");
    } finally {
      setItemsLoading(false);
    }
  }, [apiBase, selectedType, includeInactive]);

  useEffect(() => {
    void loadDictionaries();
  }, [loadDictionaries]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(() => {
    if (!keyManuallyEdited && newLabel) {
      setNewKey(slugifyDictionaryKey(newLabel));
    }
  }, [newLabel, keyManuallyEdited]);

  useEffect(() => {
    setNewBehavior("");
    setNewDefaultProbability("");
    setKeyManuallyEdited(false);
  }, [selectedType]);

  function resetCreateForm() {
    setShowCreateForm(false);
    setNewLabel("");
    setNewKey("");
    setNewColor("#3B82F6");
    setNewBehavior("");
    setNewDefaultProbability("");
    setKeyManuallyEdited(false);
  }

  async function saveItem(itemId: string) {
    const response = await fetch(`${apiBase}/dictionary-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: editLabel, color: editColor }),
    });

    if (!response.ok) {
      const payload = await response.json();
      setError(payload.error?.message ?? "Update failed.");
      return;
    }

    setEditingId(null);
    await loadItems();
  }

  async function toggleActive(item: DictionaryItem) {
    const response = await fetch(`${apiBase}/dictionary-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !item.isActive }),
    });

    if (!response.ok) {
      const payload = await response.json();
      setError(payload.error?.message ?? "Update failed.");
      return;
    }

    await loadItems();
  }

  async function createItem() {
    if (!selectedDictionary || !selectedType) return;

    const payload: Record<string, unknown> = {
      dictionaryId: selectedDictionary.id,
      type: selectedType,
      label: newLabel,
      key: newKey,
      color: newColor,
    };

    if (selectedType === "opportunity_status") {
      payload.behavior = newBehavior;
      if (newDefaultProbability.trim()) {
        payload.defaultProbability = Number(newDefaultProbability);
      }
    }

    if (selectedType === "activity_status") {
      payload.behavior = newBehavior;
    }

    const response = await fetch(`${apiBase}/dictionary-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body = await response.json();
    if (!response.ok) {
      setError(body.error?.message ?? "Failed to create item.");
      return;
    }

    resetCreateForm();
    await loadDictionaries();
    await loadItems();
  }

  const canSubmitCreate =
    Boolean(newLabel && newKey && newColor) &&
    (!requiresBehavior || Boolean(newBehavior));

  if (forbidden) {
    return <PermissionDenied title="Dictionaries unavailable" />;
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error && dictionaries.length === 0) {
    return <ErrorState title="Could not load dictionaries" description={error} />;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
      <Card className="!p-2">
        <ul className="divide-y divide-[var(--color-line)]">
          {dictionaries.map((dictionary) => (
            <li key={dictionary.id}>
              <button
                type="button"
                onClick={() => setSelectedType(dictionary.type)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-[13px] transition-colors ${
                  selectedType === dictionary.type
                    ? "bg-[var(--color-brand-50)] text-[var(--color-brand-700)] font-medium"
                    : "text-[var(--color-ink-soft)] hover:bg-[var(--color-canvas)]"
                }`}
              >
                {DICTIONARY_TYPE_LABELS[dictionary.type] ?? dictionary.name}
                <span className="block text-[11px] text-[var(--color-ink-muted)] tabular mt-0.5">
                  {dictionary.itemCount} entries
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card padded={false}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[var(--color-line)]">
          <p className="text-[13.5px] font-medium text-[var(--color-ink)]">
            {selectedType ? DICTIONARY_TYPE_LABELS[selectedType] : "Items"}
          </p>
          <div className="flex items-center gap-3">
            {canUpdate && selectedDictionary && (
              <Button
                size="sm"
                onClick={() => {
                  if (showCreateForm) {
                    resetCreateForm();
                  } else {
                    setShowCreateForm(true);
                  }
                }}
              >
                {showCreateForm ? "Cancel" : "+ Add item"}
              </Button>
            )}
            <label className="flex items-center gap-2 text-[12px] text-[var(--color-ink-muted)]">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(event) => setIncludeInactive(event.target.checked)}
              />
              Show inactive
            </label>
          </div>
        </div>

        {canUpdate && showCreateForm && selectedDictionary && selectedType && (
          <div className="px-5 py-4 border-b border-[var(--color-line)] space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input
                placeholder="Label"
                value={newLabel}
                onChange={(event) => setNewLabel(event.target.value)}
              />
              <Input
                placeholder="key (auto-generated)"
                value={newKey}
                onChange={(event) => {
                  setKeyManuallyEdited(true);
                  setNewKey(event.target.value);
                }}
                className="font-mono"
              />
              <Input
                placeholder="#3B82F6"
                value={newColor}
                onChange={(event) => setNewColor(event.target.value)}
                className="font-mono"
              />
            </div>

            {selectedType === "opportunity_status" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-[12px] text-[var(--color-ink-muted)]">
                  Behavior (required)
                  <select
                    className="mt-1 w-full rounded-md border border-[var(--color-line)] px-3 py-2 text-[13px] bg-white"
                    value={newBehavior}
                    onChange={(event) =>
                      setNewBehavior(event.target.value as OpportunityStatusBehavior)
                    }
                  >
                    <option value="">Select behavior…</option>
                    {OPPORTUNITY_STATUS_BEHAVIORS.map((behavior) => (
                      <option key={behavior} value={behavior}>
                        {behavior}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[12px] text-[var(--color-ink-muted)]">
                  Default probability (0–100)
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={newDefaultProbability}
                    onChange={(event) => setNewDefaultProbability(event.target.value)}
                    className="mt-1"
                  />
                </label>
              </div>
            )}

            {selectedType === "activity_status" && (
              <label className="text-[12px] text-[var(--color-ink-muted)] block max-w-sm">
                Behavior (required)
                <select
                  className="mt-1 w-full rounded-md border border-[var(--color-line)] px-3 py-2 text-[13px] bg-white"
                  value={newBehavior}
                  onChange={(event) =>
                    setNewBehavior(event.target.value as ActivityStatusBehavior)
                  }
                >
                  <option value="">Select behavior…</option>
                  {ACTIVITY_STATUS_BEHAVIORS.map((behavior) => (
                    <option key={behavior} value={behavior}>
                      {behavior}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <Button size="sm" onClick={() => void createItem()} disabled={!canSubmitCreate}>
              Create item
            </Button>
          </div>
        )}

        {itemsLoading ? (
          <div className="p-5 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="No dictionary items" description="Items will appear once seeded." />
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <StatusBadge label={item.label} color={item.color} size="sm" />
                  <div className="min-w-0">
                    <p className="text-[12px] text-[var(--color-ink-muted)] font-mono">
                      {item.key}
                    </p>
                    {item.behavior && (
                      <p className="text-[11px] text-[var(--color-ink-faint)]">
                        behavior: {item.behavior}
                        {item.defaultProbability !== undefined
                          ? ` · ${item.defaultProbability}%`
                          : ""}
                      </p>
                    )}
                  </div>
                </div>

                {editingId === item.id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={editLabel}
                      onChange={(event) => setEditLabel(event.target.value)}
                      className="w-32"
                    />
                    <Input
                      value={editColor}
                      onChange={(event) => setEditColor(event.target.value)}
                      className="w-24 font-mono"
                    />
                    <Button size="sm" onClick={() => void saveItem(item.id)}>
                      Save
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {!item.isActive && (
                      <span className="text-[11px] text-[var(--color-ink-muted)] uppercase tracking-wide">
                        Inactive
                      </span>
                    )}
                    {canUpdate && (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setEditingId(item.id);
                            setEditLabel(item.label);
                            setEditColor(item.color);
                          }}
                        >
                          Edit
                        </Button>
                        {!item.isSystem && item.isActive && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void toggleActive(item)}
                          >
                            Deactivate
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p className="px-5 py-3 text-[12px] text-[var(--color-danger-fg)]">{error}</p>
        )}
      </Card>
    </div>
  );
}
