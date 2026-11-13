import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "../../lib/utils";
export function Button({
  className,
  variant = "primary",
  asChild = false,
  type = "button",
  ...props
}: React.ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      type={type}
      className={cn(
        "button inline-flex items-center justify-center gap-2 font-medium disabled:pointer-events-none disabled:opacity-50",
        `button-${variant}`,
        className,
      )}
      {...props}
    />
  );
}
