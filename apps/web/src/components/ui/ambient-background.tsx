"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

type AmbientBackgroundProps = {
  children: ReactNode;
  className?: string;
  /** Stronger glow on marketing pages */
  variant?: "subtle" | "hero";
};

export function AmbientBackground({
  children,
  className = "",
  variant = "subtle",
}: AmbientBackgroundProps) {
  return (
    <motion.div
      className={`relative isolate min-h-full overflow-hidden ${className}`}
    >
      <motion.div
        className="pointer-events-none absolute inset-0 -z-10 app-mesh"
        aria-hidden
      />
      {variant === "hero" ? (
        <>
          <div
            className="animate-float-orb pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-app-violet/20 blur-3xl"
            aria-hidden
          />
          <motion.div
            className="animate-float-orb pointer-events-none absolute -right-16 top-40 h-96 w-96 rounded-full bg-app-accent/15 blur-3xl"
            style={{ animationDelay: "-3s" }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute bottom-0 left-1/2 h-px w-[min(100%,48rem)] -translate-x-1/2 bg-gradient-to-r from-transparent via-app-accent/40 to-transparent"
            aria-hidden
          />
        </>
      ) : (
        <div
          className="pointer-events-none absolute -right-32 top-0 h-64 w-64 rounded-full bg-app-accent/10 blur-3xl"
          aria-hidden
        />
      )}
      {children}
    </motion.div>
  );
}
