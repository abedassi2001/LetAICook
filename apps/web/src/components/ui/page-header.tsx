"use client";

import { FadeIn } from "@/components/ui/motion";
import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: PageHeaderProps) {
  return (
    <FadeIn className="mb-8 border-b border-app-border/80 pb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-app-accent">
              {eyebrow}
            </p>
          ) : null}
          <h1
            className={`font-semibold tracking-tight text-app-text ${eyebrow ? "mt-2 text-2xl sm:text-3xl" : "text-2xl sm:text-3xl"}`}
          >
            {title}
          </h1>
          {description ? (
            <div className="mt-2 max-w-2xl text-sm leading-relaxed text-app-muted">
              {description}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
        ) : null}
      </div>
    </FadeIn>
  );
}
