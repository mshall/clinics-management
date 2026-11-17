import React from 'react';
import type { LucideIcon } from 'lucide-react';
export function KiorlyStatCard({label,value,delta,icon:Icon}:{label:string;value:string;delta?:string;icon?:LucideIcon}) { return <section className="kiorly-card p-4 sm:p-5 min-w-0"><div className="flex justify-between gap-2 text-muted-foreground text-xs font-semibold"><span>{label}</span>{Icon&&<Icon size={18} aria-hidden/>}</div><div className="text-2xl font-bold mt-2 tabular-nums">{value}</div>{delta&&<div className="mt-1 text-xs text-emerald-600 dark:text-emerald-300">{delta}</div>}</section> }
