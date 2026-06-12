"use client";

import { useCallback, useEffect, useState } from "react";

import { TagSelector } from "@/components/domain/tag-selector";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Skeleton } from "@/components/ui/skeleton";
import { TAG_ENTITY_TYPES, type TagEntityType } from "@/lib/dictionary-constants";

type TagRecord = {
  id: string;
  name: string;
  color: string;
  entityTypes: TagEntityType[];
  archivedAt: string | null;
};

type TagsPanelProps = {
  workspaceSlug: string;
  canUpdate: boolean;
};

export function TagsPanel({ workspaceSlug, canUpdate }: TagsPanelProps) {
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3B82F6");
  const [entityTypes, setEntityTypes] = useState<TagEntityType[]>(["lead"]);

  const apiBase = `/api/workspaces/${workspaceSlug}`;

  const loadTags = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);

    try {
      const response = await fetch(`${apiBase}/tags`);
      const payload = await response.json();

      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to load tags.");
      }

      setTags(payload.data.tags as TagRecord[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    void loadTags();
  }, [loadTags]);

  function toggleEntityType(type: TagEntityType) {
    setEntityTypes((current) =>
      current.includes(type)
        ? current.filter((value) => value !== type)
        : [...current, type],
    );
  }

  async function createTag() {
    const response = await fetch(`${apiBase}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color, entityTypes }),
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error?.message ?? "Failed to create tag.");
      return;
    }

    setShowForm(false);
    setName("");
    await loadTags();
  }

  async function archiveTag(tagId: string) {
    const response = await fetch(`${apiBase}/tags/${tagId}`, { method: "DELETE" });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error?.message ?? "Failed to archive tag.");
      return;
    }

    await loadTags();
  }

  if (forbidden) {
    return <PermissionDenied title="Tags unavailable" />;
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error && tags.length === 0) {
    return <ErrorState title="Could not load tags" description={error} />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between gap-3 mb-4">
          <p className="text-[13.5px] font-medium text-[var(--color-ink)]">
            Workspace tags
          </p>
          {canUpdate && (
            <Button size="sm" onClick={() => setShowForm((value) => !value)}>
              {showForm ? "Cancel" : "+ Add tag"}
            </Button>
          )}
        </div>

        {tags.length === 0 ? (
          <EmptyState title="No tags yet" description="Create tags to label leads, properties, and opportunities." />
        ) : (
          <TagSelector tags={tags} readOnly />
        )}
      </Card>

      {canUpdate && showForm && (
        <Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] text-[var(--color-ink-muted)]">Name</label>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div>
              <label className="text-[12px] text-[var(--color-ink-muted)]">Color</label>
              <Input
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="font-mono"
              />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-[12px] text-[var(--color-ink-muted)] mb-2">Entity types</p>
            <div className="flex flex-wrap gap-2">
              {TAG_ENTITY_TYPES.map((type) => (
                <label key={type} className="flex items-center gap-1.5 text-[12px]">
                  <input
                    type="checkbox"
                    checked={entityTypes.includes(type)}
                    onChange={() => toggleEntityType(type)}
                  />
                  {type}
                </label>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <Button size="sm" onClick={() => void createTag()} disabled={!name || entityTypes.length === 0}>
              Create tag
            </Button>
          </div>
        </Card>
      )}

      {tags.length > 0 && canUpdate && (
        <Card padded={false}>
          <ul className="divide-y divide-[var(--color-line)]">
            {tags.map((tag) => (
              <li
                key={tag.id}
                className="flex items-center justify-between gap-3 px-5 py-3"
              >
                <TagSelector tags={[tag]} readOnly />
                <span className="text-[11px] text-[var(--color-ink-muted)]">
                  {tag.entityTypes.join(", ")}
                </span>
                <Button size="sm" variant="outline" onClick={() => void archiveTag(tag.id)}>
                  Archive
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {error && (
        <p className="text-[12px] text-[var(--color-danger-fg)]">{error}</p>
      )}
    </div>
  );
}
