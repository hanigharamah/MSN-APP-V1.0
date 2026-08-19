import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
const env = Object.fromEntries(fs.readFileSync('.env','utf8').split('\n').filter(Boolean).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const sb = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
await sb.auth.signInWithPassword({ email:'q@m.test', password:'demo-password-1234' });
const { data, error } = await sb.functions.invoke('connect-onboarding', { body: {} });
if (error) {
  const detail = await error.context?.json?.().catch(() => null);
  console.log('ERROR:', JSON.stringify(detail ?? error.message, null, 1).slice(0, 700));
} else {
  console.log('account:', data.account_id);
  console.log('onboarding url:', data.url?.slice(0, 80) + '…');
}
