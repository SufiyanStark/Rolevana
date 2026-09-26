import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
const buttonVariants = cva("inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:pointer-events-none disabled:opacity-50", { variants: { variant: { primary: "bg-cyan-400 text-slate-950 hover:bg-cyan-300", secondary: "border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10", ghost: "text-slate-300 hover:bg-white/5 hover:text-white" }, size: { default: "h-10 px-4", sm: "h-8 px-3 text-xs", lg: "h-12 px-5" } }, defaultVariants: { variant: "primary", size: "default" } });
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }
export function Button({ className, variant, size, asChild, ...props }: ButtonProps) { const Comp = asChild ? Slot : "button"; return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />; }
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn("rounded-2xl border border-white/[0.08] bg-slate-900/70 shadow-[0_20px_70px_rgba(2,8,23,.25)]", className)} {...props} />; }
export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) { return <span className={cn("inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[.14em] text-slate-300", className)} {...props} />; }

