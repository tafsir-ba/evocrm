import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { FileList } from "@/components/domain/file-list";
import { Modal } from "@/components/ui/modal";
import { Drawer } from "@/components/ui/drawer";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";

describe("overlay and table primitives", () => {
  it("renders table rows from props", () => {
    render(
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Name</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell>Test lead</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByText("Test lead")).toBeInTheDocument();
  });

  it("renders modal when open", () => {
    render(
      <Modal open onClose={() => undefined} title="Confirm action">
        Modal body
      </Modal>,
    );

    expect(screen.getByRole("dialog", { name: "Confirm action" })).toBeInTheDocument();
    expect(screen.getByText("Modal body")).toBeInTheDocument();
  });

  it("renders drawer when open", () => {
    render(
      <Drawer open onClose={() => undefined} title="Filters">
        Drawer body
      </Drawer>,
    );

    expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();
    expect(screen.getByText("Drawer body")).toBeInTheDocument();
  });

  it("opens dropdown menu on trigger click", async () => {
    const user = userEvent.setup();

    render(
      <Dropdown
        trigger={
          <button type="button" aria-label="Open actions menu">
            Open menu
          </button>
        }
      >
        <DropdownItem>First action</DropdownItem>
      </Dropdown>,
    );

    await user.click(screen.getByRole("button", { name: "Open actions menu" }));
    expect(screen.getByRole("menuitem", { name: "First action" })).toBeInTheDocument();
  });

  it("renders file list items from props", () => {
    render(
      <FileList
        files={[{ id: "1", name: "contract.pdf", size: "200 KB" }]}
      />,
    );

    expect(screen.getByText("contract.pdf")).toBeInTheDocument();
  });
});
