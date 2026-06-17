"use client";

import { useState } from "react";

import { ImportWizard } from "@/components/imports/import-wizard";
import { Button } from "@/components/ui/button";
import type { ImportEntityType } from "@/lib/imports";
import { IconUpload } from "@/lib/icons";

type ImportLaunchButtonProps = {
  workspaceSlug: string;
  entityType: ImportEntityType;
  onComplete?: () => void;
};

export function ImportLaunchButton({
  workspaceSlug,
  entityType,
  onComplete,
}: ImportLaunchButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="secondary"
        leadingIcon={<IconUpload size={14} />}
        onClick={() => setOpen(true)}
      >
        Import
      </Button>

      <ImportWizard
        open={open}
        onClose={() => setOpen(false)}
        workspaceSlug={workspaceSlug}
        entityType={entityType}
        onComplete={() => {
          onComplete?.();
          setOpen(false);
        }}
      />
    </>
  );
}
