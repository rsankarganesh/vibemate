import {useEffect, useState} from 'react';
import {Moon, RefreshCw, ShieldCheck, Sun} from 'lucide-react';
import {PhoneProfile} from './components/PhoneProfile';
import {Logo} from './components/Logo';
import {BottomNav} from './components/Nav';
import {VibeCard} from './components/VibeCard';
import {getMemberships} from './lib/storage';
import {go, parseHash} from './lib/router';
import {loadLiveVibe} from './services/vibe-service';
import type {Vibe} from './types';
import LiveApp from './LiveApp';
import {LiveActivity, LiveMembers} from './LiveVibePages';
const KEY = 'vibemate-display-name';
const AppHeader = () => <header className="topbar"><Logo/><span className="demo-badge live-badge">Live</span><button className="avatar" aria-label="Your profile" onClick={() => go('/profile')}>{(localStorage.getItem(KEY) || 'VM').slice(0, 2).toUpperCase()}</button></header>;
export default function LiveRoot() {
  const [name, setName] = useState(localStorage.getItem(KEY) || ''), [draft, setDraft] = useState('');
  const [route, setRoute] = useState(parseHash), [vibes, setVibes] = useState<Vibe[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');
  const managed = ['profile', 'vibes', 'global-activity', 'members', 'activity'].includes(route.page);
  useEffect(() => {
    const changed = () => {setRoute(parseHash()); setName(localStorage.getItem(KEY) || ''); setQuery(''); window.scrollTo(0, 0);};
    addEventListener('hashchange', changed); return () => removeEventListener('hashchange', changed);
  }, []);
  useEffect(() => {
    if (!name || !managed) return;
    let active = true;
    setLoading(true); setError('');
    Promise.all(getMemberships().map(loadLiveVibe)).then(values => {if (active) setVibes(values);}).catch(caught => {if (active) setError(caught instanceof Error ? caught.message : 'Couldn’t load your vibes.');}).finally(() => {if (active) setLoading(false);});
    return () => {active = false;};
  }, [name, managed, route.page, route.id, retry]);
  const nav = <BottomNav inside={!!route.id} onAdd={() => go(route.id ? `/vibe/${route.id}/add` : '/create')}/>;
  if (!managed) return <><LiveApp/>{!['create', 'join'].includes(route.page) && nav}</>;
  if (loading || error) return <><AppHeader/><main className="page"><div className="empty">{loading ? <h2 role="status">Loading your vibes…</h2> : <><h2>Couldn’t load your vibes</h2><p role="alert">{error}</p><button className="primary" onClick={() => setRetry(value => value + 1)}>Try again</button></>}</div></main>{nav}</>;
  const activeVibe = vibes.find(vibe => vibe.id === route.id);
  if (route.page === 'members' && activeVibe) return <LiveMembers vibe={activeVibe} onRefresh={async () => setVibes(await Promise.all(getMemberships().map(loadLiveVibe)))}/>;
  if (route.page === 'activity' && activeVibe) return <LiveActivity vibe={activeVibe}/>;
  let content;
  if (route.id) content = <div className="empty"><h1>Vibe not found</h1><p>This browser doesn’t have access to that vibe. Ask its creator for an invite.</p><button className="primary" onClick={() => go('/vibes')}>Back to vibes</button></div>;
  else if (route.page === 'profile') content = <><p className="eyebrow">THIS BROWSER</p><h1>Your profile</h1><section className="profile-card"><span className="big-avatar">{name.slice(0, 2).toUpperCase()}</span><div><h2>{name}</h2><p>{vibes.length} private vibes</p></div></section><section className="notice"><ShieldCheck/><div><strong>Your vibes follow your number</strong><p>Use your verified mobile number to sign in on another device.</p></div></section><PhoneProfile/><Theme/><form className="panel stack profile-name" onSubmit={event => {event.preventDefault(); const clean = draft.trim(); if (clean.length < 2) return; localStorage.setItem(KEY, clean); setName(clean); setDraft('');}}><label>Name for new vibes<input required minLength={2} maxLength={60} value={draft} onChange={event => setDraft(event.target.value)} placeholder={name}/></label><p className="helper">This updates your browser profile and the name used for new vibes. Your name in existing vibes stays the same.</p><button className="secondary">Save name</button></form></>;
  else if (route.page === 'vibes') {
    const found = vibes.filter(vibe => `${vibe.name} ${vibe.location}`.toLowerCase().includes(query.toLowerCase()));
    content = <><p className="eyebrow">YOUR PLANS</p><h1>All vibes</h1><input aria-label="Search vibes" placeholder="Find a vibe or location" value={query} onChange={event => setQuery(event.target.value)}/>{found.length ? <section className="vibe-grid live-vibes">{found.map(vibe => <VibeCard key={vibe.id} vibe={vibe}/>)}</section> : <div className="empty"><h2>{query ? 'No matching vibes' : 'Your next good time starts here'}</h2><p>{query ? 'Try another search.' : 'Create a vibe, add your mates, and share the costs.'}</p><button className="primary" onClick={() => query ? setQuery('') : go('/create')}>{query ? 'Clear search' : 'Create a vibe'}</button></div>}</>;
  } else {
    const activity = vibes.flatMap(vibe => [...vibe.activity].reverse().map(item => ({...item, vibe: vibe.name})));
    content = <><p className="eyebrow">ALL VIBES</p><h1>Activity</h1>{activity.length ? <div className="timeline">{activity.map(item => <article key={item.id}><span><RefreshCw/></span><div><p><strong>{item.actor}</strong> {item.action}</p><small>{item.vibe} · {item.detail}</small><time>{item.timestamp}</time></div></article>)}</div> : <div className="empty"><h2>No activity yet</h2><p>New expenses and payments will appear here.</p></div>}</>;
  }
  return <><AppHeader/><main className="page subpage">{content}</main>{nav}</>;
}
function Theme() {
  const [theme, setTheme] = useState(localStorage.getItem('vibemate-theme') || 'system');
  return <section className="panel"><h2>Appearance</h2><div className="theme-switch">{[{id: 'light', icon: Sun}, {id: 'dark', icon: Moon}, {id: 'system', icon: RefreshCw}].map(({id, icon: Icon}) => <button key={id} aria-pressed={theme === id} className={theme === id ? 'active' : ''} onClick={() => {setTheme(id); localStorage.setItem('vibemate-theme', id); document.documentElement.dataset.theme = id;}}><Icon/>{id[0].toUpperCase() + id.slice(1)}</button>)}</div></section>;
}
