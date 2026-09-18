import {useEffect, useState, type ReactNode} from 'react';
import type {Session} from '@supabase/supabase-js';
import {isDemoMode, supabase} from './services/supabase';
import {getDemoProfile} from './lib/phone';
import {syncPhoneMemberships, signOutPhone} from './services/phone-auth';
import {PhoneOnboarding} from './components/PhoneOnboarding';
export default function PhoneGate({children}: {children: ReactNode}) {
  const [demoReady, setDemoReady] = useState(() => !!getDemoProfile() || localStorage.getItem('vibemates-demo-preview') === '1');
  const [session, setSession] = useState<Session | null>(null), [checking, setChecking] = useState(!isDemoMode);
  const [readyAccount, setReadyAccount] = useState(''), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({data, error}) => {if (active) {setSession(data.session); setChecking(false); if (error) setError('Couldn’t restore your sign-in. Try again.');}}).catch(() => {if (active) {setChecking(false); setError('Couldn’t restore your sign-in. Try again.');}});
    const {data} = supabase.auth.onAuthStateChange((_event, value) => {setSession(value); setChecking(false); if (!value) setReadyAccount('');});
    return () => {active = false; data.subscription.unsubscribe();};
  }, [retry]);
  const userId = session?.user.id;
  useEffect(() => {
    if (!supabase || !userId) return;
    let active = true; setReadyAccount(''); setError('');
    const hydrate = async () => {
      const {data, error} = await supabase!.auth.getUser();
      if (error || !data.user?.phone_confirmed_at) throw new Error('Verify your mobile number to continue.');
      if (!active || data.user.id !== userId) return;
      await syncPhoneMemberships(data.user.id, () => active);
      if (active) {
        const name = data.user.user_metadata.display_name;
        if (typeof name === 'string' && name.trim()) localStorage.setItem('vibemate-display-name', name.trim());
        setReadyAccount(data.user.id);
      }
    };
    hydrate().catch(caught => {if (active) setError(caught instanceof Error ? caught.message : 'Couldn’t load your account.');});
    return () => {active = false;};
  }, [userId, retry]);
  if (isDemoMode) return demoReady ? children : <PhoneOnboarding demo onDone={() => setDemoReady(true)}/>;
  if (error) return <main className="page"><div className="empty"><h1>Let’s get you connected</h1><p role="alert">{error}</p><button className="primary" onClick={() => {setError(''); setRetry(value => value + 1);}}>Try again</button>{session && <button className="secondary" onClick={async () => {try {await signOutPhone(); setError('');} catch {setError('Couldn’t sign out. Please try again.');}}}>Use another number</button>}</div></main>;
  if (checking || (session && readyAccount !== userId)) return <main className="page"><div className="empty" role="status">Opening your Vibemates account…</div></main>;
  if (!session) return <PhoneOnboarding onDone={() => setRetry(value => value + 1)}/>;
  return children;
}
