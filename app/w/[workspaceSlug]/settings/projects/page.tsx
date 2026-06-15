import { redirect } from "next/navigation";

type Params = Promise<{ workspaceSlug: string }>;

export default async function SettingsProjectsRedirectPage({
  params,
}: {
  params: Params;
}) {
  const { workspaceSlug } = await params;
  redirect(`/w/${workspaceSlug}/projects`);
}
