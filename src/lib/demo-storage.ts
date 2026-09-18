import {getDemoProfile} from './phone';
import type {Vibe} from '../types';
import {demoVibes} from '../services/demo-service';

const key = 'vibemate-demo-data-v1';
export function loadDemoVibes(): Vibe[] {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (Array.isArray(saved) && saved.every(v => v && typeof v.id === 'string' && Array.isArray(v.members) && Array.isArray(v.expenses) && Array.isArray(v.settlements) && Array.isArray(v.activity))) return personalizeDemo(saved);
  } catch { /* Start with the sample data if storage is unavailable. */ }
  return personalizeDemo(structuredClone(demoVibes));
}
export function saveDemoVibes(vibes: Vibe[]) {
  localStorage.setItem(key, JSON.stringify(vibes));
}

export function personalizeDemo(vibes: Vibe[]): Vibe[] {
  const profile = getDemoProfile();
  return profile ? vibes.map(vibe => ({...vibe, members: vibe.members.map(member => member.id === 'alex' ? {...member, name: profile.name, initials: profile.name.slice(0, 2).toUpperCase()} : member)})) : vibes;
}
