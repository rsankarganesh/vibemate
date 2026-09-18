import {useEffect, useState} from 'react';
import {getCountries, getCountryCallingCode, type CountryCode} from 'libphonenumber-js/max';
import {ArrowRight, Phone, ShieldCheck} from 'lucide-react';
import {Logo} from './Logo';
import {getDemoProfile, normalizeMobile} from '../lib/phone';
import {sendPhoneCode, verifyPhoneCode} from '../services/phone-auth';
const regionNames = new Intl.DisplayNames(['en'], {type: 'region'});
const countries = getCountries().sort((a, b) => (a === 'AU' ? -1 : b === 'AU' ? 1 : (regionNames.of(a) || a).localeCompare(regionNames.of(b) || b)));
export function PhoneOnboarding({demo = false, onDone}: {demo?: boolean; onDone: () => void}) {
  const [name, setName] = useState(demo ? getDemoProfile()?.name ?? '' : localStorage.getItem('vibemate-display-name') || '');
  const [country, setCountry] = useState<CountryCode>('AU'), [number, setNumber] = useState(demo ? getDemoProfile()?.phone ?? '' : '');
  const [sentTo, setSentTo] = useState(''), [code, setCode] = useState(''), [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {if (!cooldown) return; const timer = setTimeout(() => setCooldown(value => value - 1), 1000); return () => clearTimeout(timer);}, [cooldown]);
  const send = async () => {
    if (busy || cooldown) return;
    setError('');
    try {
      if (name.trim().length < 2) throw new Error('Enter at least two characters for your name.');
      const phone = normalizeMobile(number, country);
      setBusy(true);
      if (demo) {
        localStorage.setItem('vibemates-demo-profile', JSON.stringify({name: name.trim(), phone, verified: false}));
        onDone(); return;
      }
      await sendPhoneCode(phone, name.trim()); setSentTo(phone); setCooldown(60);
    } catch (caught) {setError(caught instanceof Error ? caught.message : 'Please try again.');}
    finally {setBusy(false);}
  };
  return <main className="phone-onboarding"><div className="phone-brand"><Logo/><span className="pill">{demo ? 'Local demo' : 'Mobile sign-in'}</span></div><section className="phone-card"><span className="phone-symbol"><Phone/></span><p className="eyebrow">WELCOME TO VIBEMATES</p><h1>{sentTo ? 'Check your messages' : 'Your mates. Your number.'}</h1><p className="lede">{sentTo ? `Enter the 6-digit code sent to ${sentTo}.` : 'Just your name and mobile number. No Google account or password needed.'}</p>
    {!sentTo ? <form className="stack" onSubmit={event => {event.preventDefault(); void send();}}><label>Your name<input autoFocus autoComplete="given-name" required minLength={2} maxLength={60} value={name} onChange={event => setName(event.target.value)} placeholder="What should your mates call you?"/></label><label>Country<select value={country} onChange={event => setCountry(event.target.value as CountryCode)}>{countries.map(item => <option key={item} value={item}>{regionNames.of(item)} (+{getCountryCallingCode(item)})</option>)}</select></label><label>Mobile number<input type="tel" autoComplete="tel" required maxLength={30} value={number} onChange={event => setNumber(event.target.value)} placeholder={country === 'AU' ? '0412 345 678' : `+${getCountryCallingCode(country)} …`}/></label><p className="helper">{demo ? 'Demo: we check the number’s format only. No SMS is sent and your number is not verified.' : 'We’ll text you a verification code. Your number stays private and isn’t shown to your mates.'}</p><button className="primary full" disabled={busy || cooldown > 0}>{busy ? 'Please wait…' : cooldown > 0 ? `Try again in ${cooldown}s` : demo ? 'Continue in demo' : 'Send verification code'}<ArrowRight/></button></form> : <form className="stack" onSubmit={async event => {event.preventDefault(); if (busy) return; setError(''); if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code from your SMS.'); setBusy(true); try {await verifyPhoneCode(sentTo, code, name.trim()); onDone();} catch (caught) {setError(caught instanceof Error ? caught.message : 'Couldn’t verify the code.');} finally {setBusy(false);}}}><label>Verification code<input autoFocus required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} placeholder="6-digit code"/></label><button className="primary full" disabled={busy}>{busy ? 'Verifying…' : 'Verify & continue'}</button><button type="button" className="secondary" disabled={busy || cooldown > 0} onClick={() => void send()}>{cooldown ? `Resend code in ${cooldown}s` : 'Resend code'}</button><button type="button" className="text-btn" disabled={busy} onClick={() => {setSentTo(''); setCode(''); setError('');}}>Change mobile number</button></form>}
    {error && <p className="form-error" role="alert">{error}</p>}<p className="phone-privacy"><ShieldCheck/>{demo ? 'Saved only in this browser' : 'Sign in with the same number on another device'}</p>
    {demo && <button className="text-btn full" onClick={() => {localStorage.setItem('vibemates-demo-preview', '1'); onDone();}}>Explore demo without a number</button>}
  </section></main>;
}
