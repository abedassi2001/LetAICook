"use client";

import { useAuth } from "@/contexts/auth-context";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

const nav = [
  { href: "/chat", label: "Planning", sub: "AI assistant" },
  { href: "/system-designer", label: "System designer", sub: "Architecture & diagrams" },
  { href: "/tasks", label: "Tasks", sub: "Board" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, profile, signOutUser } = useAuth();
  const [mobileNav, setMobileNav] = useState(false);

  return (
    <div className="flex min-h-0 min-h-screen flex-1 bg-app-bg text-app-text">
      {/* Mobile top bar */}
      <header className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center justify-between border-b border-app-border bg-app-bg/95 px-4 backdrop-blur-md lg:hidden">
        <button
          type="button"
          className="rounded-lg p-2 text-app-muted hover:bg-app-elevated hover:text-app-text"
          onClick={() => setMobileNav((o) => !o)}
          aria-expanded={mobileNav}
          aria-label="Toggle menu"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="font-semibold tracking-tight text-app-accent">letAIcook</span>
        <span className="w-10" />
      </header>

      {mobileNav ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          aria-label="Close menu"
          onClick={() => setMobileNav(false)}
        />
      ) : null}

      {/* Sidebar */}
      <aside
        className={`fixed bottom-0 left-0 top-0 z-40 flex w-64 flex-col border-r border-app-border bg-app-sidebar pt-14 transition-transform lg:static lg:pt-0 ${
          mobileNav ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="hidden border-b border-app-border px-4 py-5 lg:block">
          <Link href="/chat" className="block font-semibold tracking-tight text-app-text">
            letAIcook
          </Link>
          <p className="mt-0.5 text-xs text-app-muted">Engineering coordination</p>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {nav.map(({ href, label, sub }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileNav(false)}
                className={`rounded-xl px-3 py-2.5 transition-colors ${
                  active
                    ? "bg-app-accent/15 text-app-accent ring-1 ring-app-accent/40"
                    : "text-app-muted hover:bg-app-elevated hover:text-app-text"
                }`}
              >
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs opacity-80">{sub}</span>
              </Link>
            );
          })}

          <Link
            href="/"
            onClick={() => setMobileNav(false)}
            className="mt-2 rounded-xl px-3 py-2 text-sm text-app-muted hover:bg-app-elevated hover:text-app-text"
          >
            ← Home
          </Link>
        </nav>

        <div className="border-t border-app-border p-3">
          {profile ? (
            <div className="rounded-xl bg-app-elevated/80 px-3 py-2">
              <p className="truncate text-sm font-medium text-app-text">{profile.displayName}</p>
              <p className="truncate text-xs capitalize text-app-muted">{profile.role}</p>
              <button
                type="button"
                onClick={() => void signOutUser()}
                className="mt-2 w-full rounded-lg border border-app-border py-1.5 text-xs text-app-muted hover:border-app-accent/50 hover:text-app-accent"
              >
                Sign out
              </button>
            </div>
          ) : user ? (
            <div className="rounded-xl bg-app-elevated/80 px-3 py-2">
              <p className="text-xs text-app-muted">No Firestore profile — check Firebase Console.</p>
              <button
                type="button"
                onClick={() => void signOutUser()}
                className="mt-2 w-full rounded-lg border border-app-border py-1.5 text-xs text-app-muted hover:border-app-accent/50 hover:text-app-accent"
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col pt-14 lg:pt-0">
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
