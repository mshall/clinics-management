import React from 'react';
export function KiorlyBrand({ compact = false, dark = false }: { compact?: boolean; dark?: boolean }) {
  return <div className="flex items-center gap-2 min-w-0" aria-label="Kiorly">
    <img src={dark ? '/kiorly-assets/logo-dark.svg' : '/kiorly-assets/logo.svg'} alt="" width={36} height={36} className="size-9 shrink-0" />
    {!compact && <div className="min-w-0"><div className="font-bold tracking-tight text-lg leading-5">Kiorly</div><div className="text-[10px] text-muted-foreground">Clinic Operating System</div></div>}
  </div>;
}
