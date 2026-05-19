import { GlassCard } from "@/components/ui/glass-card";
import {
  IconDesigner,
  IconPlanning,
  IconSparkle,
  IconTasks,
} from "@/components/ui/nav-icons";

const features = [
  {
    icon: IconPlanning,
    title: "AI planning",
    description:
      "Shape your product with a Gemini-powered assistant. Your ideas flow into architecture and tasks automatically.",
    gradient: "from-app-violet/30 to-app-violet-dim/10",
  },
  {
    icon: IconDesigner,
    title: "System designer",
    description:
      "Generate diagrams, APIs, database schemas, and sprint tasks from a single project description.",
    gradient: "from-app-accent/25 to-app-accent-dim/10",
  },
  {
    icon: IconTasks,
    title: "Projects + Jira tasks",
    description:
      "Browse your Jira projects, open a task board per project, and keep assignees aligned in real time.",
    gradient: "from-cyan-500/20 to-app-accent/10",
  },
] as const;

/** Server-rendered landing (no Firebase, framer-motion, or client hydration). */
export function LandingPageStatic() {
  return (
    <div className="relative isolate min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 app-mesh" aria-hidden />
      <div
        className="animate-float-orb pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-app-violet/20 blur-3xl"
        aria-hidden
      />
      <div
        className="animate-float-orb pointer-events-none absolute -right-16 top-40 h-96 w-96 rounded-full bg-app-accent/15 blur-3xl"
        style={{ animationDelay: "-3s" }}
        aria-hidden
      />
      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-16 lg:px-10 lg:py-24">
        <div className="inline-flex items-center gap-2 rounded-full border border-app-border-bright/60 bg-app-elevated/50 px-4 py-1.5 text-xs font-medium text-app-muted backdrop-blur-md">
          <IconSparkle className="h-3.5 w-3.5 text-app-accent" />
          AI-native engineering workspace
        </div>

        <div className="mt-8 max-w-3xl">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            <span className="text-gradient">Plan, design, and ship</span>
            <br />
            <span className="text-app-text">with your team</span>
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-app-muted sm:text-xl">
            letAIcook connects AI planning, system architecture, and task execution —
            so your team moves from idea to Jira-backed delivery in one flow.
          </p>
        </div>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <a href="/login" className="btn-primary px-8 py-3.5 text-center">
            Get started
          </a>
          <a
            href="/login?returnUrl=%2Fchat"
            className="btn-secondary px-8 py-3.5 text-center"
          >
            Open planning chat
          </a>
        </div>

        <div className="feature-carousel mt-16 lg:mt-20">
          {features.map((f) => (
            <div key={f.title}>
              <GlassCard className="group h-full p-6 transition-transform duration-300 hover:-translate-y-1">
                <div
                  className={`mb-4 inline-flex rounded-xl bg-gradient-to-br p-3 ${f.gradient} ring-1 ring-white/10`}
                >
                  <f.icon className="h-6 w-6 text-app-accent-bright" />
                </div>
                <h3 className="text-lg font-semibold text-app-text">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-app-muted">{f.description}</p>
              </GlassCard>
            </div>
          ))}
        </div>

        <p className="mt-12 text-center text-xs text-app-muted">
          Swipe cards on mobile · Sign in to save your workspace to the cloud
        </p>
      </div>
    </div>
  );
}
