import { useState } from 'react';
import { Analyze } from './Analyze';
import { Today } from './Today';

type View = 'today' | 'analyze';

export function App() {
  const [view, setView] = useState<View>('today');

  return (
    <main className="page-shell">
      <nav className="top-nav">
        <div className="brand-block">
          <div className="brand-mark">R2</div>
          <div><strong>Game Opportunity Radar</strong><span>Studio intelligence</span></div>
        </div>
        <div className="nav-tabs">
          <button className={view === 'today' ? 'active' : ''} onClick={() => setView('today')}>Today</button>
          <button className={view === 'analyze' ? 'active' : ''} onClick={() => setView('analyze')}>Analyze Game</button>
          <button disabled title="Next milestone">Competitors</button>
          <button disabled title="Next milestone">Deep Verify</button>
        </div>
      </nav>
      {view === 'today' ? <Today /> : <Analyze />}
    </main>
  );
}
