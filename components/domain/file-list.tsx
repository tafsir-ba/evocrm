import { IconFile } from "@/lib/icons";

export type FileListItem = {
  id: string;
  name: string;
  size?: string;
  updatedAt?: string;
};

export function FileList({ files }: { files: FileListItem[] }) {
  if (files.length === 0) {
    return (
      <p className="text-[13px] text-[var(--color-ink-muted)]">No files attached.</p>
    );
  }

  return (
    <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)] rounded-lg overflow-hidden">
      {files.map((file) => (
        <li
          key={file.id}
          className="flex items-center gap-3 bg-white px-4 py-3 text-[13px]"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[var(--color-muted)] text-[var(--color-ink-muted)]">
            <IconFile size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-[var(--color-ink)] truncate">{file.name}</p>
            {(file.size || file.updatedAt) && (
              <p className="text-[12px] text-[var(--color-ink-muted)]">
                {[file.size, file.updatedAt].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
