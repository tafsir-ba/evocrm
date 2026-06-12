"use client";

import { useState } from "react";

import { FileList } from "@/components/domain/file-list";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { Modal } from "@/components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";

const MOCK_FILES = [
  { id: "f1", name: "Floor-plan.pdf", size: "1.2 MB", updatedAt: "2 days ago" },
  { id: "f2", name: "Brochure.pdf", size: "840 KB", updatedAt: "1 week ago" },
];

export function ComponentShowcase() {
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[14px] font-semibold text-[var(--color-ink)] mb-3 tracking-tight">
          Overlay primitives
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setModalOpen(true)}>
            Open modal
          </Button>
          <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
            Open drawer
          </Button>
          <Dropdown
            trigger={
              <Button variant="secondary" aria-label="Open actions menu">
                Actions
              </Button>
            }
          >
            <DropdownItem>Edit lead</DropdownItem>
            <DropdownItem>Archive</DropdownItem>
            <DropdownItem tone="danger">Delete</DropdownItem>
          </Dropdown>
        </div>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Example modal"
        >
          <p className="text-[13px] text-[var(--color-ink-muted)]">
            Phase 1 placeholder dialog. Real mutations arrive in later phases.
          </p>
        </Modal>
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title="Example drawer"
        >
          <p className="text-[13px] text-[var(--color-ink-muted)]">
            Mobile-friendly panel for filters or quick edits.
          </p>
        </Drawer>
      </div>

      <div>
        <h2 className="text-[14px] font-semibold text-[var(--color-ink)] mb-3 tracking-tight">
          Table primitive
        </h2>
        <div className="bg-white border border-[var(--color-line)] rounded-xl overflow-hidden">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Owner</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell>Anna Keller</TableCell>
                <TableCell>New</TableCell>
                <TableCell>John Doe</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Marc Dubois</TableCell>
                <TableCell>Qualified</TableCell>
                <TableCell>Jane Roe</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>

      <div>
        <h2 className="text-[14px] font-semibold text-[var(--color-ink)] mb-3 tracking-tight">
          File list
        </h2>
        <FileList files={MOCK_FILES} />
      </div>
    </div>
  );
}
