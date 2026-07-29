"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { CAMPAIGN_EMAIL_VARIABLES } from "@/lib/campaign-email";
import {
  IconBold,
  IconItalic,
  IconLink,
  IconList,
  IconListOrdered,
  IconUnderline,
} from "@/lib/icons";
import { cn } from "@/lib/utils";

type EmailRichTextEditorProps = {
  valueHtml: string;
  onChange: (html: string, plainText: string) => void;
  disabled?: boolean;
  placeholder?: string;
  editorRef?: (editor: Editor | null) => void;
};

function ToolbarButton({
  active,
  onClick,
  label,
  children,
  disabled,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)] focus-ring disabled:opacity-40",
        active && "bg-[var(--color-muted)] text-[var(--color-ink)]",
      )}
    >
      {children}
    </button>
  );
}

export function EmailRichTextEditor({
  valueHtml,
  onChange,
  disabled = false,
  placeholder = "Write your email…",
  editorRef,
}: EmailRichTextEditorProps) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("https://");
  const [mergeOpen, setMergeOpen] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: valueHtml || "<p></p>",
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "min-h-[280px] max-h-[480px] overflow-y-auto px-4 py-3 text-[15px] leading-relaxed text-[var(--color-ink)] outline-none prose prose-sm max-w-none [&_a]:text-[var(--color-brand-700)] [&_a]:underline",
      },
    },
    onUpdate: ({ editor: current }) => {
      const html = current.getHTML();
      const plain = current.getText({ blockSeparator: "\n" });
      onChange(html === "<p></p>" ? "" : html, plain);
    },
  });

  useEffect(() => {
    editorRef?.(editor);
    return () => editorRef?.(null);
  }, [editor, editorRef]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (editor.isEditable === !disabled) {
      return;
    }

    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const current = editor.getHTML();
    const next = valueHtml || "<p></p>";
    if (current !== next && !editor.isFocused) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [editor, valueHtml]);

  function openLinkModal() {
    if (!editor) {
      return;
    }
    const previous = editor.getAttributes("link").href;
    setLinkUrl(typeof previous === "string" && previous ? previous : "https://");
    setLinkOpen(true);
  }

  function applyLink() {
    if (!editor) {
      return;
    }

    const trimmed = linkUrl.trim();
    if (!trimmed || trimmed === "https://") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setLinkOpen(false);
      return;
    }

    const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinkOpen(false);
  }

  function insertMergeTag(token: string) {
    if (!editor) {
      return;
    }
    editor.chain().focus().insertContent(token).run();
    setMergeOpen(false);
  }

  if (!editor) {
    return (
      <div className="min-h-[320px] rounded-lg border border-[var(--color-line)] bg-white px-4 py-3 text-[13px] text-[var(--color-ink-muted)]">
        Loading editor…
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-line)] bg-white">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--color-line)] bg-[var(--color-canvas)] px-2 py-1.5">
        <ToolbarButton
          label="Bold"
          active={editor.isActive("bold")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <IconBold size={15} />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={editor.isActive("italic")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <IconItalic size={15} />
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          active={editor.isActive("underline")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <IconUnderline size={15} />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-[var(--color-line)]" />
        <ToolbarButton
          label="Bulleted list"
          active={editor.isActive("bulletList")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <IconList size={15} />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={editor.isActive("orderedList")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <IconListOrdered size={15} />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-[var(--color-line)]" />
        <ToolbarButton
          label="Insert link"
          active={editor.isActive("link")}
          disabled={disabled}
          onClick={openLinkModal}
        >
          <IconLink size={15} />
        </ToolbarButton>
        <div className="relative">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => setMergeOpen((value) => !value)}
          >
            Insert field
          </Button>
          {mergeOpen ? (
            <>
              <button
                type="button"
                aria-label="Close merge tags"
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setMergeOpen(false)}
              />
              <div className="absolute left-0 top-[calc(100%+4px)] z-50 min-w-[180px] rounded-lg border border-[var(--color-line)] bg-white p-1.5 shadow-[var(--shadow-lg)]">
                {CAMPAIGN_EMAIL_VARIABLES.map((variable) => (
                  <button
                    key={variable.key}
                    type="button"
                    className="flex h-8 w-full items-center rounded-md px-2.5 text-left text-[13px] text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)] focus-ring"
                    onClick={() => insertMergeTag(variable.token)}
                  >
                    {variable.label}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      <EditorContent editor={editor} />

      <Modal
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        title="Insert link"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setLinkOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={applyLink}>
              Apply link
            </Button>
          </div>
        }
      >
        <div>
          <Label htmlFor="email-link-url">URL</Label>
          <Input
            id="email-link-url"
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            placeholder="https://example.com"
            autoFocus
          />
          <p className="mt-2 text-[12px] text-[var(--color-ink-muted)]">
            Select text in the email first, then apply a link. Clear the URL to remove a link.
          </p>
        </div>
      </Modal>
    </div>
  );
}
