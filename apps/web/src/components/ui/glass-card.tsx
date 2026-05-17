import type { ReactNode } from "react";

type GlassCardProps = {
  children: ReactNode;
  className?: string;
  strong?: boolean;
};

export function GlassCard({
  children,
  className = "",
  strong = false,
}: GlassCardProps) {
  return (
    <div
      className={`rounded-2xl ${strong ? "glass-panel-strong" : "glass-panel"} ${className}`}
    >
      {children}
    </div>
  );
}
