import {supabase} from './supabase';
import {getMemberships, type StoredMembership} from '../lib/storage';
const client = () => {if (!supabase) throw new Error('SMS sign-in needs a live connection.'); return supabase;};
export async function sendPhoneCode(phone: string, name: string) {
  const {error} = await client().auth.signInWithOtp({phone, options: {data: {display_name: name}}});
  if (error) throw new Error(error.status === 429 ? 'Please wait before requesting another code.' : 'Couldn’t send a code. Check the number and try again. Phone sign-in and an SMS provider must be enabled.');
}
export async function verifyPhoneCode(phone: string, token: string, name: string) {
  const {data, error} = await client().auth.verifyOtp({phone, token, type: 'sms'});
  if (error || !data.user?.phone_confirmed_at) throw new Error('That code is invalid or expired. Try again or request a new code.');
  localStorage.setItem('vibemate-display-name', name);
}
/** Recover only memberships owned by the verified account; migrate existing bearer access explicitly. */
export async function syncPhoneMemberships(userId: string, isCurrent: () => boolean = () => true) {
  const previousOwner = localStorage.getItem('vibemates-membership-owner');
  const cached = !previousOwner || previousOwner === userId ? getMemberships() : [];
  // The server checks both the old bearer secret and the verified account before binding.
  for (const item of cached.filter(item => item.memberToken)) {
    if (!isCurrent()) return;
    const {error} = await client().rpc('link_phone_membership', {p_member: item.memberId, p_token: item.memberToken});
    if (error) throw new Error('Couldn’t link your existing vibes. Apply the phone-account migration and try again. Your saved access has been kept.');
  }
  const {data, error} = await client().rpc('list_phone_memberships');
  if (error) throw new Error('Couldn’t load your phone account. Check the connection and ensure migration 008 is installed.');
  if (!isCurrent()) return;
  const memberships: StoredMembership[] = (data ?? []).map((item: {vibe_id: string; member_id: string}) => ({vibeId: item.vibe_id, memberId: item.member_id, memberToken: '', inviteToken: cached.find(old => old.memberId === item.member_id)?.inviteToken}));
  localStorage.setItem('vibemate-memberships', JSON.stringify({version: 2, memberships}));
  localStorage.setItem('vibemates-membership-owner', userId);
}
export async function signOutPhone() {
  const {error} = await client().auth.signOut({scope: 'local'});
  if (error) throw new Error('Couldn’t sign out. Try again.');
  // Membership cache is scoped by account; keeping it preserves this creator’s private invite.
}
