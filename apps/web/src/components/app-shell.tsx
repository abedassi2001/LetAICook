"use client";

import { useAuth } from "@/contexts/auth-context";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

const nav = [
  {
    href: "/chat",
    label: "Planning",
    sub: "AI assistant",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    href: "/system-designer",
    label: "System designer",
    sub: "Architecture & diagrams",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
      </svg>
    ),
  },
  {
    href: "/tasks",
    label: "Tasks",
    sub: "Board",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    sub: "Jira & Preferences",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, profile, signOutUser } = useAuth();
  const [mobileNav, setMobileNav] = useState(false);

  return (
    <div className="flex min-h-screen flex-1 bg-app-bg text-app-text">
      {/* Mobile top bar */}
      <header className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center justify-between border-b border-app-border bg-app-bg/80 px-4 backdrop-blur-xl lg:hidden">
        <button
          type="button"
          className="rounded-xl p-2 text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text"
          onClick={() => setMobileNav((o) => !o)}
          aria-expanded={mobileNav}
          aria-label="Toggle menu"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {mobileNav ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
        <Link href="/chat" className="text-sm font-bold tracking-tight text-app-accent">
          letAIcook
        </Link>
        <span className="w-9" />
      </header>

      {/* Mobile overlay */}
      {mobileNav && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm lg:hidden"
          aria-label="Close menu"
          onClick={() => setMobileNav(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed bottom-0 left-0 top-0 z-40 flex w-64 flex-col border-r border-app-border bg-app-sidebar/80 pt-14 backdrop-blur-xl transition-transform duration-300 lg:static lg:pt-0 ${
          mobileNav ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Logo */}
        <div className="hidden border-b border-app-border/60 px-5 py-5 lg:block">
          <Link href="/chat" className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-app-accent/20">
              <span className="text-xs font-bold text-app-accent">AI</span>
            </div>
            <span className="font-bold tracking-tight text-app-text">letAIcook</span>
          </Link>
          <p className="mt-1 pl-9 text-xs text-app-muted">Engineering coordination</p>
        </div>

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-1 p-3">
          <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-app-muted/60">
            Navigation
          </p>
          {nav.map(({ href, label, sub, icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileNav(false)}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 ${
                  active
                    ? "bg-app-accent/15 text-app-accent shadow-[inset_0_0_0_1px_rgba(139,92,246,0.3)]"
                    : "text-app-muted hover:bg-app-elevated hover:text-app-text"
                }`}
              >
                <span className={`shrink-0 transition-transform duration-200 group-hover:scale-110 ${active ? "text-app-accent" : ""}`}>
                  {icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium leading-tight">{label}</span>
                  <span className="block text-[11px] leading-tight opacity-60">{sub}</span>
                </span>
                {active && (
                  <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-app-accent" />
                )}
              </Link>
            );
          })}

          <Link
            href="/"
            onClick={() => setMobileNav(false)}
            className="mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Home
          </Link>
        </nav>

        {/* User card */}
        <div className="border-t border-app-border/60 p-3">
          {profile ? (
            <div className="rounded-xl bg-app-elevated/80 p-3 ring-1 ring-app-border/50">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-app-accent/20 text-xs font-bold text-app-accent">
                  {profile.displayName?.[0]?.toUpperCase() ?? "U"}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-app-text">{profile.displayName}</p>
                  <p className="truncate text-xs capitalize text-app-muted">{profile.role}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void signOutUser()}
                className="mt-3 w-full rounded-lg border border-app-border py-1.5 text-xs text-app-muted transition-all hover:border-app-accent/50 hover:bg-app-accent/5 hover:text-app-accent"
              >
                Sign out
              </button>
            </div>
          ) : user ? (
            <div className="rounded-xl bg-app-elevated/80 p-3 ring-1 ring-amber-500/20">
              <p className="text-xs text-amber-400">No Firestore profile — check Firebase Console.</p>
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

      <div className="flex min-w-0 flex-1 flex-col pt-14 lg:pt-0">
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
      </div>
    </div>
  );
}

