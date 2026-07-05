import * as React from "react";
import { FileText, X } from "lucide-react";
import { cn } from "../../lib/utils";

export function MessageScroller({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [children]);

  return (
    <div ref={ref} className={cn("min-h-0 flex-1 overflow-y-auto scroll-smooth px-4 py-6", className)} {...props}>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">{children}</div>
    </div>
  );
}

export function Message({
  role,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { role: "user" | "assistant" | "system" }) {
  return (
    <div className={cn("flex w-full", role === "user" ? "justify-end" : "justify-start", className)} {...props}>
      <div className={cn("flex max-w-[86%] flex-col gap-2", role === "user" ? "items-end" : "items-start")}>{children}</div>
    </div>
  );
}

export function Bubble({
  role,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { role: "user" | "assistant" | "system" }) {
  return (
    <div
      className={cn(
        "rounded-lg px-4 py-3 text-sm leading-6 shadow-sm",
        role === "user" && "bg-zinc-950 text-white",
        role === "assistant" && "border border-zinc-200 bg-white text-zinc-900",
        role === "system" && "border border-amber-200 bg-amber-50 text-amber-950",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function Attachment({
  name,
  size,
  onRemove
}: {
  name: string;
  size: number;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700">
      <FileText className="h-4 w-4 text-zinc-500" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-zinc-900">{name}</div>
        <div className="text-xs text-zinc-500">{Math.max(1, Math.round(size / 1024))} KB</div>
      </div>
      {onRemove ? (
        <button type="button" onClick={onRemove} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export function Marker({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("mx-auto w-fit rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-500", className)} {...props}>
      {children}
    </div>
  );
}
