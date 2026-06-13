"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

type LostReasonOption = {
  id: string;
  label: string;
};

type LostReasonModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (lostReasonId: string, lostReasonText: string) => void;
  lostReasons: LostReasonOption[];
  pending?: boolean;
  error?: string | null;
};

export function LostReasonModal({
  open,
  onClose,
  onConfirm,
  lostReasons,
  pending = false,
  error = null,
}: LostReasonModalProps) {
  const [lostReasonId, setLostReasonId] = useState("");
  const [lostReasonText, setLostReasonText] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    setLostReasonId("");
    setLostReasonText("");
  }, [open]);

  const handleConfirm = () => {
    if (!lostReasonId) {
      return;
    }
    onConfirm(lostReasonId, lostReasonText);
  };

  return (
    <Modal open={open} onClose={onClose} title="Mark opportunity as lost">
      <div className="space-y-4">
        <p className="text-[13px] text-[var(--color-ink-soft)]">
          Select a lost reason. This is required when moving to a lost status.
        </p>

        <div>
          <Label htmlFor="lost-reason" required>
            Lost reason
          </Label>
          <Select
            id="lost-reason"
            value={lostReasonId}
            onChange={(event) => setLostReasonId(event.target.value)}
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
          <Label htmlFor="lost-reason-text">Additional details</Label>
          <Textarea
            id="lost-reason-text"
            value={lostReasonText}
            onChange={(event) => setLostReasonText(event.target.value)}
            placeholder="Optional context…"
            rows={3}
          />
        </div>

        {error && (
          <p className="text-[12.5px] text-[var(--color-danger-fg)]">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!lostReasonId || pending}
          >
            {pending ? "Saving…" : "Confirm lost"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
