import { createClient, SupabaseClient } from '@supabase/supabase-js';

const normalizeEnv = (value?: string) => {
  const trimmed = (value || '').trim().replace(/^["']+|["']+$/g, '').trim();
  if (
    !trimmed ||
    trimmed === 'undefined' ||
    trimmed === 'null' ||
    trimmed.includes('YOUR_PROJECT_REF') ||
    trimmed.startsWith('YOUR_SUPABASE_')
  ) {
    return '';
  }
  return trimmed;
};

const normalizeSupabaseUrl = (rawValue?: string) => {
  const clean = normalizeEnv(rawValue);
  if (!clean) return '';

  const withProtocol = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }

    // Handle pasted Supabase Studio dashboard URL: https://supabase.com/dashboard/project/<ref>
    if (parsed.hostname === 'supabase.com') {
      const match = parsed.pathname.match(/^\/dashboard\/project\/([a-z0-9-]+)/i);
      if (match?.[1]) {
        return `https://${match[1]}.supabase.co`;
      }
    }

    // Hosted Supabase project URLs always use the bare origin (no /rest/v1 or subpaths)
    if (
      parsed.hostname.endsWith('.supabase.co') ||
      parsed.hostname.endsWith('.supabase.in')
    ) {
      return parsed.origin;
    }

    // Custom domain / reverse proxy: strip accidental API service suffixes & trailing slashes
    const cleanPath = parsed.pathname
      .replace(/\/(rest|auth|storage|functions|graphql)\/v1(\/.*)?$/i, '')
      .replace(/\/+$/, '');
    return `${parsed.origin}${cleanPath}`;
  } catch {
    return '';
  }
};

const supabaseUrl = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
const supabaseAnonKey = normalizeEnv(
  import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);

export const SUPABASE_STORAGE_BUCKET = 'product-images';
export const PAYMENT_SCREENSHOTS_BUCKET = 'payment-screenshots';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    /^https?:\/\//i.test(supabaseUrl)
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
