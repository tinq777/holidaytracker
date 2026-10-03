import { createContext, useContext, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { UIProvider, useRoute, go, Icon, useOnline } from './components/ui';
import { db, ensureDefaults, requestPersistence } from './lib/db';
import { processAllPending } from './lib/capture';
import { refreshRates } from './lib/rates';
import type { Expense, Holiday } from './lib/types';
import Home from './screens/Home';
import HolidayForm from './screens/HolidayForm';
import Trip from './screens/Trip';
import ImportScreen from './screens/Import';
import Reconcile from './screens/Reconcile';
import More from './screens/More';
import Compare from './screens/Compare';
import { AllExpenses, Checklists } from './screens/Hub';
import CaptureSheet from './screens/CaptureSheet';
import ExpenseEditor from './screens/ExpenseEditor';

interface AppCtxT { openCapture: (h: Holiday) => void; openExpense: (e: Expense | string, opts?: { confirmOnSave?: boolean }) => void }
const AppCtx = createContext<AppCtxT>({ openCapture: () => {}, openExpense: () => {} });
export const useApp = () => useContext(AppCtx);

export default function App() {
  return <UIProvider><Shell /></UIProvider>;
}

function Shell() {
  const route = useRoute();
  const online = useOnline();
  const [capture, setCapture] = useState<Holiday | null>(null);
  const [editing, setEditing] = useState<{ e: Expense | string; confirmOnSave?: boolean } | null>(null);
  const inboxCount = useLiveQuery(() => db.expenses.where('status').equals('inbox').count(), [], 0);

  useEffect(() => { ensureDefaults(); requestPersistence(); }, []);
  // When connectivity returns: process captured images that were waiting, refresh exchange rates.
  useEffect(() => {
    if (!online) return;
    processAllPending();
    (async () => { const hs = await db.holidays.toArray(); const byHome = new Map<string, Set<string>>(); hs.forEach(h => h.currencies.forEach(c => byHome.set(h.homeCurrency, (byHome.get(h.homeCurrency) ?? new Set()).add(c)))); for (const [home, cs] of byHome) await refreshRates(home, [...cs]); })();
  }, [online]);

  const [root, id, sub] = route;
  let screen: JSX.Element;
  let tab: 'trips' | 'expenses' | 'checklist' | 'more' = 'trips';
  if (root === 'new') screen = <HolidayForm />;
  else if (root === 'trip' && id && sub === 'edit') screen = <HolidayForm id={id} />;
  else if (root === 'trip' && id && sub === 'import') { screen = <ImportScreen id={id} />; tab = 'expenses'; }
  else if (root === 'trip' && id && sub === 'reconcile') { screen = <Reconcile id={id} />; tab = 'expenses'; }
  else if (root === 'trip' && id) { const t = (sub ?? 'overview') as 'overview'; screen = <Trip id={id} tab={t} />; }
  else if (root === 'expenses') { screen = <AllExpenses />; tab = 'expenses'; }
  else if (root === 'checklist') { screen = <Checklists />; tab = 'checklist'; }
  else if (root === 'compare') { screen = <Compare />; tab = 'more'; }
  else if (root === 'more') { screen = <More section={id} />; tab = 'more'; }
  else screen = <Home />;

  const ctx: AppCtxT = { openCapture: setCapture, openExpense: (e, o) => setEditing({ e, confirmOnSave: o?.confirmOnSave }) };
  return <AppCtx.Provider value={ctx}>
    <div className="app">
      {!online && <div className="offline">Offline. Everything still works; AI reading and exchange rates will update when you reconnect.</div>}
      {screen}
    </div>
    <nav className="nav" aria-label="Main">
      <div className="nav-inner">
        {([['trips', 'Trips', '/'], ['expenses', 'Expenses', '/expenses'], ['checklist', 'Checklist', '/checklist'], ['more', 'More', '/more']] as const).map(([k, label, path]) =>
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => go(path)} aria-current={tab === k ? 'page' : undefined}>
            <Icon name={k} size={25} stroke={tab === k ? 2.3 : 1.8} />{label}
            {k === 'expenses' && inboxCount > 0 && <span className="badge">{inboxCount}</span>}
          </button>)}
      </div>
    </nav>
    {capture && <CaptureSheet holiday={capture} onClose={() => setCapture(null)} onEdit={(id) => { setCapture(null); setEditing({ e: id }); }} />}
    {editing && <ExpenseEditor target={editing.e} confirmOnSave={editing.confirmOnSave} onClose={() => setEditing(null)} />}
  </AppCtx.Provider>;
}
