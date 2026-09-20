import { supabase } from "./supabase";

export async function sendMagicLink(
  email: string,
  fullName: string | undefined,
  redirectTo?: string,
) {
  return supabase.auth.signInWithOtp({
    email,
    options: {
      data: fullName ? { full_name: fullName } : undefined,
      shouldCreateUser: true,
      emailRedirectTo: redirectTo || window.location.href,
    },
  });
}

export async function getCurrentUser() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

export async function logout() {
  await supabase.auth.signOut();
}

/** Password sign-in. The storefront uses magic links, but the shop dashboard
 *  also allows a password so Aru can get in without waiting for an email —
 *  useful on a phone with a slow inbox, or when she's already signed out. */
export async function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}
