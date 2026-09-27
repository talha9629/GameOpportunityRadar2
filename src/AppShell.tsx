import { useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  Activity,
  Archive,
  BarChart3,
  Download,
  FlaskConical,
  ListChecks,
  Menu,
  MessageSquareText,
  Network,
  Search,
  ShieldCheck,
  Video,
  X,
} from 'lucide-react';
import { OwnerAccess } from './OwnerAccess';
import { APP_PAGE_META, type AppRoute, type AppView } from './appRouter';
import { PlatformScopeSelector } from './PlatformScopeSelector';
import type { PlatformScope } from './platformScope';
import './app-shell.css';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const groups: Array<{
  label: string;
  items: Array<{ view: AppView; label: string; icon: typeof Activity; primary?: boolean }>;
}> = [
  {
    label: 'Radar',
    items: [
      { view: 'today', label: 'Radar', icon: Activity, primary: true },
      { view: 'trends', label: 'Trend Signals', icon: BarChart3 },
    ],
  },
  {
    label: 'Analyze',
    items: [
      { view: 'analyze', label: 'Analyze Game', icon: Search, primary: true },
      { view: 'competitors', label: 'Competitors', icon: Network },
      { view: 'reviews', label: 'Review Samples', icon: MessageSquareText },
    ],
  },
  {
    label: 'Verify',
    items: [
      { view: 'verification', label: 'Verify Queue', icon: ListChecks, primary: true },
      { view: 'deep-verify', label: 'Deep Verify', icon: Video },
    ],
  },
  {
    label: 'Library',
    items: [
      { view: 'saved', label: 'Saved Dossiers', icon: Archive, primary: true },
      { view: 'policy', label: 'Policy Watch', icon: ShieldCheck },
    ],
  },
];

const mobilePrimary: Array<{ view: AppView; label: string; icon: typeof Activity }> = [
  { view: 'today', label: 'Radar', icon: Activity },
  { view: 'analyze', label: 'Analyze', icon: Search },
  { view: 'verification', label: 'Verify', icon: ListChecks },
  { view: 'saved', label: 'Library', icon: Archive },
];

export function AppShell({
  route,
  owner,
  platformScope,
  onPlatformScopeChange,
  onNavigate,
  children,
}: {
  route: AppRoute;
  owner: User | null;
  platformScope: PlatformScope;
  onPlatformScopeChange: (scope: PlatformScope) => void;
  onNavigate: (view: AppView) => void;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const meta = APP_PAGE_META[route.view];

  useEffect(() => {
    document.title = `${meta.title} · Game Opportunity Radar`;
    setMobileOpen(false);
  }, [meta.title, route.view]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    const alreadyInstalled = window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
    if (alreadyInstalled) return;

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstallPrompt(null);

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  function navigate(view: AppView) {
    onNavigate(view);
    setMobileOpen(false);
  }

  async function installApp() {
    if (!installPrompt) return;
    const prompt = installPrompt;
    setInstallPrompt(null);
    await prompt.prompt();
    await prompt.userChoice.catch(() => undefined);
  }

  return <div className="app-frame">
    {mobileOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}

    <aside className={`app-sidebar ${mobileOpen ? 'mobile-open' : ''}`} aria-label="Primary navigation">
      <div className="sidebar-brand">
        <div className="brand-mark">R2</div>
        <div>
          <strong>Game Opportunity Radar</strong>
          <span>Radar → Analyze → Verify → Library</span>
        </div>
        <button className="sidebar-close" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X size={20} /></button>
      </div>

      <nav className="sidebar-nav">
        {groups.map((group) => <div className="sidebar-group" key={group.label}>
          <div className="sidebar-group-label">{group.label}</div>
          {group.items.map((item) => {
            const Icon = item.icon;
            return <button
              key={item.view}
              className={`sidebar-link ${item.primary ? 'workflow-primary' : 'workflow-secondary'} ${route.view === item.view ? 'active' : ''}`}
              aria-current={route.view === item.view ? 'page' : undefined}
              onClick={() => navigate(item.view)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>;
          })}
        </div>)}
      </nav>

      <div className="sidebar-footer">
        {installPrompt && <button className="install-app-button" onClick={() => void installApp()}>
          <Download size={17} />
          <span>
            <strong>Install Radar</strong>
            <small>Keep the auto-updating app on this device</small>
          </span>
        </button>}
        <div className="sidebar-principle">
          <FlaskConical size={15} />
          <span>Evidence → unknowns → verification → decision</span>
        </div>
        <OwnerAccess user={owner} />
      </div>
    </aside>

    <section className="app-workspace">
      <header className="workspace-header">
        <div className="workspace-header-left">
          <button className="mobile-nav-toggle" aria-label="Open full navigation" onClick={() => setMobileOpen(true)}><Menu size={20} /></button>
          <div className="page-context">
            <span>{meta.section}</span>
            <strong>{meta.title}</strong>
            <p>{meta.description}</p>
          </div>
        </div>
        <div className="workspace-header-right">
          <PlatformScopeSelector value={platformScope} onChange={onPlatformScopeChange} />
          <div className="workspace-status">
            <span className="status-dot" />
            <span>Live workspace</span>
          </div>
        </div>
      </header>

      <main className="page-shell app-page-shell">{children}</main>
    </section>

    <nav className="mobile-bottom-nav" aria-label="Mobile workflow navigation">
      {mobilePrimary.map((item) => {
        const Icon = item.icon;
        const active = route.view === item.view || groups.find((group) => group.items.some((child) => child.view === route.view))?.items[0]?.view === item.view;
        return <button
          key={item.view}
          className={active ? 'active' : ''}
          aria-current={route.view === item.view ? 'page' : undefined}
          onClick={() => navigate(item.view)}
        >
          <Icon size={20} />
          <span>{item.label}</span>
        </button>;
      })}
    </nav>
  </div>;
}
