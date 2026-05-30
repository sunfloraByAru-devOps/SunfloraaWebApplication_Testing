import { m as defineMiddleware, u as sequence } from './prerender_DGZJpN45.mjs';
import '@astrojs/internal-helpers/path';
import 'piccolore';
import 'clsx';
import '@astrojs/internal-helpers/object';

const onRequest$1 = defineMiddleware(async (ctx, next) => {
  if (ctx.url.pathname.startsWith("/admin")) ;
  return next();
});

const onRequest = sequence(
	
	onRequest$1
	
);

export { onRequest };
