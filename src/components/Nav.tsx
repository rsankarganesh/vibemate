import {Activity, Home, Plus, UserRound, UsersRound} from 'lucide-react';
import {go, parseHash} from '../lib/router';

export function BottomNav({inside = false, onAdd}: {inside?: boolean; onAdd: () => void}) {
  const route = parseHash();
  const base = inside && route.id ? `/vibe/${route.id}` : '';
  const links = [
    {path: base || '/', label: inside ? 'Overview' : 'Home', icon: Home, active: inside ? route.page === 'vibe' : route.page === 'home'},
    {path: base ? `${base}/members` : '/vibes', label: inside ? 'Mates' : 'Vibes', icon: UsersRound, active: ['members', 'vibes'].includes(route.page)},
    {path: base ? `${base}/activity` : '/activity', label: 'Activity', icon: Activity, active: ['activity', 'global-activity'].includes(route.page)},
    {path: '/profile', label: 'Profile', icon: UserRound, active: route.page === 'profile'},
  ];
  return <nav className="bottom-nav" aria-label="Main navigation">
    {links.map(({path, label, icon: Icon, active}, index) => <div className="nav-slot" key={path}>
      {index === 2 && <button className="nav-add" onClick={onAdd} aria-label={inside ? 'Add expense' : 'Create vibe'}><Plus/></button>}
      <button className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} onClick={() => go(path)}><Icon/><span>{label}</span></button>
    </div>)}
  </nav>;
}

export function VibeTabs({id}: {id: string}) {
  const page = parseHash().page;
  return <nav className="vibe-tabs" aria-label="Vibe navigation">
    {[['vibe', 'Overview'], ['expenses', 'Expenses'], ['members', 'Mates'], ['settle', 'Settle up'], ['activity', 'Activity']].map(([key, label]) =>
      <button key={key} aria-current={page === key ? 'page' : undefined} className={page === key ? 'active' : ''} onClick={() => go(`/vibe/${id}${key === 'vibe' ? '' : `/${key}`}`)}>{label}</button>)}
  </nav>;
}
