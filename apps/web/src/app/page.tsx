import Link from "next/link";

export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-app-bg px-6 py-16">
      {/* Background Gradients */}
      <div className="absolute top-1/4 left-1/4 -z-10 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-app-accent/20 blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 -z-10 h-96 w-96 translate-x-1/2 translate-y-1/2 rounded-full bg-blue-600/20 blur-[120px]" />
      
      <div className="glass z-10 max-w-3xl rounded-3xl p-10 text-center shadow-2xl animate-slide-up">
        <div className="inline-flex items-center rounded-full border border-app-accent/30 bg-app-accent/10 px-4 py-1.5 text-sm font-medium text-app-accent-bright shadow-[0_0_15px_rgba(139,92,246,0.3)]">
          <span className="mr-2 inline-block h-2 w-2 rounded-full bg-app-accent-bright animate-pulse-slow"></span>
          letAIcook
        </div>
        
        <h1 className="mt-8 text-5xl font-extrabold tracking-tight text-white md:text-7xl lg:text-7xl leading-tight bg-gradient-to-r from-white via-app-text to-app-muted bg-clip-text text-transparent">
          Engineering <br className="hidden md:block" />
          Coordination Reimagined
        </h1>
        
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-app-muted md:text-xl">
          Plan seamlessly with AI, execute flawlessly on a shared Firebase task board. 
          Admins assign, workers deliver, and everyone stays in sync.
        </p>
        
        <div className="mt-12 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/login"
            className="group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-app-accent px-8 py-4 text-base font-semibold text-white transition-all duration-300 hover:scale-105 hover:bg-app-accent-bright hover:shadow-[0_0_30px_rgba(139,92,246,0.5)] focus:outline-none focus:ring-2 focus:ring-app-accent focus:ring-offset-2 focus:ring-offset-app-bg"
          >
            <span className="relative z-10">Sign in to start</span>
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-hover:animate-shimmer"></div>
          </Link>
          
          <Link
            href="/login?returnUrl=%2Ftasks"
            className="inline-flex items-center justify-center rounded-full border border-app-border bg-app-elevated/50 px-8 py-4 text-base font-medium text-app-text backdrop-blur-md transition-all duration-300 hover:border-app-accent/50 hover:bg-app-elevated hover:text-app-accent hover:shadow-[0_0_20px_rgba(139,92,246,0.1)]"
          >
            Go to tasks after login
          </Link>
        </div>
        
        <p className="mt-10 text-sm text-app-muted/80">
          New here? Sign up on the login page — you&apos;ll land in planning chat, 
          then use the sidebar for tasks.
        </p>
      </div>
    </div>
  );
}
