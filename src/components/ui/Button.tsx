import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-white shadow-[0_6px_16px_-8px_rgba(36,83,199,.7)] hover:bg-primary-hover disabled:bg-primary/45 disabled:shadow-none",
  secondary: "border border-border bg-surface text-foreground shadow-sm hover:border-foreground/20 hover:bg-background disabled:text-muted",
  ghost: "text-foreground hover:bg-surface-muted disabled:text-muted",
  danger: "bg-conflict text-white shadow-[0_6px_16px_-8px_rgba(180,35,24,.7)] hover:bg-conflict/90 disabled:bg-conflict/45 disabled:shadow-none",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition active:translate-y-px disabled:cursor-not-allowed disabled:active:translate-y-0 ${variants[variant]} ${className}`}
    />
  );
}
