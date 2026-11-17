import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { KiorlyIcons, type KiorlyIconName } from './kiorly-icons';
export function KiorlyMobileNav({items}:{items:{to:string;label:string;icon:KiorlyIconName}[]}) {
 const {pathname}=useLocation(); return <nav aria-label="Mobile primary" className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur flex justify-around px-2 pb-[env(safe-area-inset-bottom)]">
 {items.slice(0,4).map(i=>{const I=KiorlyIcons[i.icon];return <Link key={i.to} to={i.to} aria-current={pathname===i.to?'page':undefined} className={`kiorly-focus flex flex-col min-w-[64px] min-h-[56px] items-center justify-center gap-0.5 text-[11px] ${pathname===i.to?'text-primary':'text-muted-foreground'}`}><I size={21}/><span>{i.label}</span></Link>})}
 </nav>
}
