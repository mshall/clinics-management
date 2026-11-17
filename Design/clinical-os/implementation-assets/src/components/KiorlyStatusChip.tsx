import React from 'react';
type Status = 'scheduled'|'waiting'|'in-consult'|'completed'|'cancelled'|'no-show'|'pending'|'error';
const map: Record<Status,string> = {
 scheduled:'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200',waiting:'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
 'in-consult':'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200',completed:'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-200',
 cancelled:'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200','no-show':'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
 pending:'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-200',error:'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200'
};
export function KiorlyStatusChip({status,children}:{status:Status;children:React.ReactNode}) { return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${map[status]}`}>{children}</span> }
