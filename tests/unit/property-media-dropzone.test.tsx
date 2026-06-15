import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PropertyMediaDropzone } from "@/components/properties/property-media-dropzone";
import type { PropertyPhotoDraft } from "@/lib/property-media";

function sampleDraft(name = "photo.jpg"): PropertyPhotoDraft {
  const file = new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" });
  return {
    id: `${name}-1`,
    file,
    previewUrl: "blob:preview",
  };
}

describe("PropertyMediaDropzone", () => {
  it("activates file input from keyboard", async () => {
    const user = userEvent.setup();
    const onAddFiles = vi.fn();

    render(
      <PropertyMediaDropzone photos={[]} onAddFiles={onAddFiles} onRemove={vi.fn()} />,
    );

    const dropzone = screen.getByTestId("property-media-dropzone");
    await user.type(dropzone, "{Enter}");
    expect(dropzone).toBeInTheDocument();
  });

  it("renders queued photo rows with remove buttons", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();

    render(
      <PropertyMediaDropzone
        photos={[sampleDraft()]}
        onAddFiles={vi.fn()}
        onRemove={onRemove}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remove photo.jpg" }));
    expect(onRemove).toHaveBeenCalledWith("photo.jpg-1");
  });

  it("accepts dropped image files", () => {
    const onAddFiles = vi.fn();
    const file = new File([new Uint8Array([1])], "drop.jpg", { type: "image/jpeg" });

    render(
      <PropertyMediaDropzone photos={[]} onAddFiles={onAddFiles} onRemove={vi.fn()} />,
    );

    const dropzone = screen.getByTestId("property-media-dropzone");
    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [file],
      },
    });

    expect(onAddFiles).toHaveBeenCalledWith([file]);
  });

  it("does not accept drops when disabled", () => {
    const onAddFiles = vi.fn();
    const file = new File([new Uint8Array([1])], "drop.jpg", { type: "image/jpeg" });

    render(
      <PropertyMediaDropzone
        disabled
        photos={[]}
        onAddFiles={onAddFiles}
        onRemove={vi.fn()}
      />,
    );

    fireEvent.drop(screen.getByTestId("property-media-dropzone"), {
      dataTransfer: {
        files: [file],
      },
    });

    expect(onAddFiles).not.toHaveBeenCalled();
  });

  it("handles pasted clipboard images", () => {
    const onAddFiles = vi.fn();
    const file = new File([new Uint8Array([1])], "paste.png", { type: "image/png" });

    render(
      <PropertyMediaDropzone photos={[]} onAddFiles={onAddFiles} onRemove={vi.fn()} />,
    );

    fireEvent.paste(window, {
      clipboardData: {
        items: [
          {
            kind: "file",
            type: "image/png",
            getAsFile: () => file,
          },
        ],
      },
    });

    expect(onAddFiles).toHaveBeenCalledWith([file]);
  });
});
