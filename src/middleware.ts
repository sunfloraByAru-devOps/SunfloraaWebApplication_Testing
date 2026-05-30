import { defineMiddleware } from 'astro:middleware'
import { createServerClient } from '@supabase/ssr'

export const onRequest = defineMiddleware(async (ctx, next) => {
  if (ctx.url.pathname.startsWith('/admin')) {
    // check session + profile.role === 'admin'
    // redirect to /login if not
  }
  return next()
})
