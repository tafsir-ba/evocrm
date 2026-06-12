import { Input } from "@/components/ui/input";
import { IconSearch } from "@/lib/icons";
import type { InputHTMLAttributes } from "react";

export function SearchInput({
  placeholder = "Search…",
  fieldSize = "sm",
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  fieldSize?: "sm" | "md";
}) {
  return (
    <Input
      {...rest}
      placeholder={placeholder}
      fieldSize={fieldSize}
      leadingIcon={<IconSearch size={15} />}
    />
  );
}
