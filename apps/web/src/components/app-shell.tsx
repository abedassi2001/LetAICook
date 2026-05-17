"use client";

import { AmbientBackground } from "@/components/ui/ambient-background";
import {
  IconDesigner,
  IconPlanning,
  IconSettings,
  IconSparkle,
  IconTasks,
} from "@/components/ui/nav-icons";
import { useAuth } from "@/contexts/auth-context";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

const nav = [
  { href: "/chat", label: "Planning", sub: "AI assistant", Icon: IconPlanning },
  {
    href: "/system-designer",
    label: "System designer",
    sub: "Architecture",
    Icon: IconDesigner,
  },
  { href: "/tasks", label: "Tasks", sub: "Board", Icon: IconTasks },
  { href: "/settings", label: "Settings", sub: "Jira & profile", Icon: IconSettings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, profile, signOutUser } = useAuth();
  const [mobileNav, setMobileNav] = useState(false);

  return (
    <div className="flex min-h-screen bg-app-bg text-app-text">
      <header className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center justify-between border-b border-app-border/80 bg-app-sidebar/90 px-4 backdrop-blur-xl lg:hidden">
        <button
          type="button"
          className="rounded-xl p-2 text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text"
          onClick={() => setMobileNav((o) => !o)}
          aria-expanded={mobileNav}
          aria-label="Toggle menu"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Link href="/chat" className="flex items-center gap-2 font-semibold tracking-tight">
          <IconSparkle className="h-4 w-4 text-app-accent" />
          <span className="text-gradient">letAIcook</span>
        </Link>
        <span className="w-10" />
      </header>

      <AnimatePresence>
        {mobileNav ? (
          <motion.button
            type="button"
            className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm lg:hidden"
            aria-label="Close menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileNav(false)}
          />
        ) : null}
      </AnimatePresence>

      <aside
        className={`fixed bottom-0 left-0 top-0 z-40 flex w-[min(100%,280px)] flex-col border-r border-app-border/80 bg-app-sidebar/95 pt-14 backdrop-blur-xl transition-transform duration-300 ease-out lg:static lg:w-64 lg:translate-x-0 lg:pt-0 ${
          mobileNav ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="hidden border-b border-app-border/60 px-5 py-6 lg:block">
          <Link href="/chat" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-app-accent/30 to-app-violet/20 ring-1 ring-white/10">
              <IconSparkle className="h-4 w-4 text-app-accent-bright" />
            </div>
            <div>
              <span className="block font-semibold tracking-tight text-app-text">letAIcook</span>
              <span className="block text-[11px] text-app-muted">Engineering workspace</span>
            </div>
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {nav.map(({ href, label, sub, Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileNav(false)}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 ${
                  active
                    ? "bg-gradient-to-r from-app-accent/20 to-app-violet/10 text-app-accent-bright ring-1 ring-app-accent/30 shadow-lg shadow-app-accent/5"
                    : "text-app-muted hover:bg-app-elevated/80 hover:text-app-text"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                    active
                      ? "bg-app-accent/20 text-app-accent-bright"
                      : "bg-app-elevated/60 text-app-muted group-hover:text-app-accent"
                  }`}
                >
                  <Icon />
                </span>
                <span>
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-[11px] opacity-75">{sub}</span>
                </span>
              </Link>
            );
          })}

          <Link
            href="/"
            onClick={() => setMobileNav(false)}
            className="mt-3 rounded-xl px-3 py-2 text-sm text-app-muted transition-colors hover:bg-app-elevated/80 hover:text-app-text"
          >
            ← Home
          </Link>
        </nav>

        <div className="border-t border-app-border/60 p-3">
          {profile ? (
            <div className="glass-panel rounded-xl px-3 py-3">
              <p className="truncate text-sm font-medium text-app-text">{profile.displayName}</p>
              <p className="truncate text-xs capitalize text-app-muted">{profile.role}</p>
              <button
                type="button"
                onClick={() => void signOutUser()}
                className="mt-2 w-full rounded-lg border border-app-border py-1.5 text-xs text-app-muted transition-colors hover:border-app-accent/50 hover:text-app-accent"
              >
                Sign out
              </button>
            </div>
          ) : user ? (
            <div className="glass-panel rounded-xl px-3 py-3 text-xs text-app-muted">
              No Firestore profile — check Firebase Console.
              <button
                type="button"
                onClick={() => void signOutUser()}
                className="mt-2 w-full rounded-lg border border-app-border py-1.5 hover:text-app-accent"
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col pt-14 lg:pt-0">
        <AmbientBackground className="flex min-h-0 flex-1 flex-col">
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
        </AmbientBackground>
      </div>
    </div>
  );
}
