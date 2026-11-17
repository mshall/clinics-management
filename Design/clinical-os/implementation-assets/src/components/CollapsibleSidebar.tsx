import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { KiorlyBrand } from './KiorlyBrand';
import { KiorlyIcons, type KiorlyIconName } from './kiorly-icons';
export type SidebarLink = { path: string; label: string; icon: KiorlyIconName; allowed?: boolean };
const STORAGE_KEY = 'kiorly-sidebar-expanded-v1';
/** Collapsed by default; remembers explicit preference; production role filtering remains caller-owned. */
export function CollapsibleSidebar({ links, dark = false }: { links: SidebarLink[]; dark?: boolean }) {
  const [expanded, setExpanded] = useState<boolean>(() => { try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; } });
  const location = useLocation();
  const { i18n } = useTranslation();
  const rtl = i18n.dir() === 'rtl';
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, expanded ? '1' : '0'); } catch {} }, [expanded]);
  const visible = links.filter(x => x.allowed !== false);
  return <aside data-sidebar-state={expanded ? 'expanded' : 'collapsed'} className="kiorly-nav-transition sticky top-0 hidden h-dvh shrink-0 border-e border-border bg-card md:flex flex-col" style={{width: expanded ? 240 : 72}}>
    <div className="h-16 flex items-center justify-center px-3 border-b border-border"><KiorlyBrand compact={!expanded} dark={dark}/></div>
    <nav aria-label="Primary" className="flex-1 overflow-y-auto p-2 space-y-1">
      {visible.map(item => { const Icon = KiorlyIcons[item.icon]; const active = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path+'/')); return <Link to={item.path} key={item.path+item.label} title={!expanded ? item.label : undefined} aria-label={item.label} aria-current={active?'page':undefined} className={`kiorly-focus min-h-11 rounded-xl flex items-center gap-3 px-3 text-sm font-medium ${active?'bg-primary/10 text-primary':'text-muted-foreground hover:bg-muted hover:text-foreground'}`}><Icon size={20} aria-hidden="true" className="shrink-0"/>{expanded && <span className="truncate">{item.label}</span>}</Link> })}
    </nav>
    <button className="kiorly-focus min-h-12 m-2 rounded-xl hover:bg-muted flex justify-center items-center gap-2" aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'} aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded ? <PanelLeftClose size={20}/> : <PanelLeftOpen size={20}/>} {expanded && <span className="text-sm">{rtl ? 'طي القائمة' : 'Collapse'}</span>}</button>
  </aside>;
}
