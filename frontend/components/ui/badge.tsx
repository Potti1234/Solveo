import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex min-h-[26px] items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold leading-none transition-colors",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-muted-foreground",
        teal: "border-primary/30 bg-primary/10 text-primary",
        coral: "border-destructive/35 bg-destructive/10 text-destructive",
        amber: "border-amber/40 bg-amber/10 text-amber",
        violet: "border-violet/35 bg-violet/10 text-violet",
        slate: "border-transparent bg-muted text-muted-foreground"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
