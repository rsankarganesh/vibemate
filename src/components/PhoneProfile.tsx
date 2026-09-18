import {useEffect, useState} from 'react';
import {Phone, ShieldCheck} from 'lucide-react';
import {getDemoProfile, maskPhone} from '../lib/phone';
import {isDemoMode, supabase} from '../services/supabase';
import {signOutPhone} from '../services/phone-auth';
import {PhoneOnboarding} from './PhoneOnboarding';
import {Modal} from './Modal';
export function PhoneProfile() {
  const [phone, setPhone] = useState(isDemoMode ? getDemoProfile()?.phone ?? '' : '');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [editing, setEditing] = useState(false);
  useEffect(() => {if (supabase) void supabase.auth.getUser().then(({data, error}) => {if (error) setError('Couldn’t load your mobile number.'); else setPhone(data.user?.phone ? `+${data.user.phone.replace(/^\+/, '')}` : '');});}, []);
  return <section className="panel phone-profile"><h2><Phone/> Mobile account</h2><strong>{phone ? maskPhone(phone) : 'No mobile number added'}</strong><p className="helper">{isDemoMode ? 'Demo only · format checked, not SMS verified.' : 'SMS-verified sign-in. Your number is private to your account.'}</p>{isDemoMode ? <button className="secondary" onClick={() => setEditing(true)}>{phone ? 'Update demo details' : 'Add name & mobile'}</button> : <><p className="helper"><ShieldCheck/>Sign in with this number on another device to recover linked vibes.</p><button className="secondary" disabled={busy} onClick={async () => {setBusy(true); try {await signOutPhone();} catch (caught) {setError(caught instanceof Error ? caught.message : 'Couldn’t sign out.');} finally {setBusy(false);}}}>{busy ? 'Signing out…' : 'Sign out'}</button></>}{error && <p className="form-error" role="alert">{error}</p>}{editing && <Modal title="Your demo profile" onClose={() => setEditing(false)}><PhoneOnboarding demo onDone={() => {setPhone(getDemoProfile()?.phone ?? ''); setEditing(false); window.dispatchEvent(new Event('vibemates-profile'));}}/></Modal>}</section>;
}
