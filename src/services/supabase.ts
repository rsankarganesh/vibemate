import {createClient} from '@supabase/supabase-js';
const url=import.meta.env.VITE_SUPABASE_URL,anonKey=import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase=url&&anonKey?createClient(url,anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}}):null;
export const isDemoMode=!supabase;
