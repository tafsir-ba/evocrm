"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { WorkspaceNavigationItem } from "@/lib/v1-navigation";

export type WorkspaceShellUser = {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
};

export type WorkspaceShellWorkspace = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  defaultCurrency: string;
  initials: string;
};

export type WorkspaceShellContextValue = {
  user: WorkspaceShellUser;
  workspace: WorkspaceShellWorkspace;
  navigation: WorkspaceNavigationItem[];
  workspaces: Array<{
    id: string;
    name: string;
    slug: string;
    initials: string;
  }>;
  permissionDenied?: boolean;
};

const WorkspaceShellContext = createContext<WorkspaceShellContextValue | null>(
  null,
);

export function WorkspaceShellProvider({
  value,
  children,
}: {
  value: WorkspaceShellContextValue;
  children: ReactNode;
}) {
  return (
    <WorkspaceShellContext.Provider value={value}>
      {children}
    </WorkspaceShellContext.Provider>
  );
}

export function useWorkspaceShell(): WorkspaceShellContextValue {
  const context = useContext(WorkspaceShellContext);

  if (!context) {
    throw new Error("useWorkspaceShell must be used within WorkspaceShellProvider");
  }

  return context;
}
