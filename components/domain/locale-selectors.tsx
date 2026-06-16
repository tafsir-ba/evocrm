"use client";

import { useMemo } from "react";

import { Select } from "@/components/ui/input";
import { buildCurrencyOptions, buildTimezoneOptions } from "@/lib/locale-options";

type SelectorProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  fieldSize?: "sm" | "md";
  className?: string;
};

export function CurrencySelect({
  id,
  value,
  onChange,
  disabled,
  required,
  fieldSize = "md",
  className,
}: SelectorProps) {
  const options = useMemo(() => buildCurrencyOptions(value), [value]);

  return (
    <Select
      id={id}
      value={value}
      disabled={disabled}
      required={required}
      fieldSize={fieldSize}
      className={className}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}

export function TimezoneSelect({
  id,
  value,
  onChange,
  disabled,
  required,
  fieldSize = "md",
  className,
}: SelectorProps) {
  const options = useMemo(() => buildTimezoneOptions(value), [value]);

  return (
    <Select
      id={id}
      value={value}
      disabled={disabled}
      required={required}
      fieldSize={fieldSize}
      className={className}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}
