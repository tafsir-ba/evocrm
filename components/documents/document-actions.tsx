"use client";

import { Button } from "@/components/ui/button";
import { IconDownload, IconTrash } from "@/lib/icons";

type DocumentActionsProps = {
  canArchive: boolean;
  pending?: boolean;
  onOpen: () => void;
  onArchive: () => void;
};

export function DocumentActions({
  canArchive,
  pending,
  onOpen,
  onArchive,
}: DocumentActionsProps) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <Button
        size="sm"
        variant="secondary"
        leadingIcon={<IconDownload size={12} />}
        disabled={pending}
        onClick={onOpen}
      >
        Open
      </Button>
      {canArchive && (
        <Button
          size="sm"
          variant="ghost"
          leadingIcon={<IconTrash size={12} />}
          disabled={pending}
          onClick={onArchive}
        >
          Archive
        </Button>
      )}
    </div>
  );
}
