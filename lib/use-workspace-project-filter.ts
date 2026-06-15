"use client";

import { useSearchParams } from "next/navigation";

import { readProjectIdFromSearchParams } from "@/lib/project-scope";

export function useWorkspaceProjectFilter(): string | null {
  const searchParams = useSearchParams();
  return readProjectIdFromSearchParams(searchParams);
}
