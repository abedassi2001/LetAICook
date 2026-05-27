"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownContentProps = {
  children: string;
  className?: string;
  /** Tighter spacing for chat bubbles. */
  compact?: boolean;
};

export function MarkdownContent({
  children,
  className = "",
  compact = false,
}: MarkdownContentProps) {
  if (!children.trim()) return null;

  return (
    <div
      className={`markdown-body ${compact ? "markdown-body--compact" : ""} ${className}`.trim()}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: linkChildren }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-app-accent-bright underline decoration-app-accent/40 underline-offset-2 hover:decoration-app-accent"
            >
              {linkChildren}
            </a>
          ),
          code: ({ className: codeClassName, children: codeChildren, ...props }) => {
            const isBlock = Boolean(codeClassName);
            if (isBlock) {
              return (
                <code className={codeClassName} {...props}>
                  {codeChildren}
                </code>
              );
            }
            return (
              <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[0.9em] text-app-accent-bright">
                {codeChildren}
              </code>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
