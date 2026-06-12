import { StateView } from "@/components/states/state-view";
import type { ComponentProps } from "react";

type StateViewProps = ComponentProps<typeof StateView>;

export function EmptyState(props: Omit<StateViewProps, "variant">) {
  return <StateView variant="empty" {...props} />;
}
