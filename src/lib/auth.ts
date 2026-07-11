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
