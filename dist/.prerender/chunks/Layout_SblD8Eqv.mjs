import { A as AstroError, f as InvalidComponentArgs, j as addAttribute, q as renderHead, s as renderSlot, t as renderTemplate } from './prerender_DGZJpN45.mjs';
import 'piccolore';
import 'clsx';

function validateArgs(args) {
  if (args.length !== 3) return false;
  if (!args[0] || typeof args[0] !== "object") return false;
  return true;
}
function baseCreateComponent(cb, moduleId, propagation) {
  const name = moduleId?.split("/").pop()?.replace(".astro", "") ?? "";
  const fn = (...args) => {
    if (!validateArgs(args)) {
      throw new AstroError({
        ...InvalidComponentArgs,
        message: InvalidComponentArgs.message(name)
      });
    }
    return cb(...args);
  };
  Object.defineProperty(fn, "name", { value: name, writable: false });
  fn.isAstroComponentFactory = true;
  fn.moduleId = moduleId;
  fn.propagation = propagation;
  return fn;
}
function createComponentWithOptions(opts) {
  const cb = baseCreateComponent(opts.factory, opts.moduleId, opts.propagation);
  return cb;
}
function createComponent(arg1, moduleId, propagation) {
  if (typeof arg1 === "function") {
    return baseCreateComponent(arg1, moduleId, propagation);
  } else {
    return createComponentWithOptions(arg1);
  }
}

const $$Layout = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$Layout;
  const {
    title = "My Website",
    description = "My awesome website"
  } = Astro2.props;
  return renderTemplate`<html lang="en"> <head><!-- Basic SEO --><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><meta name="description"${addAttribute(description, "content")}><!-- Title --><title>${title}</title><!-- Open Graph (for social sharing) --><meta property="og:title"${addAttribute(title, "content")}><meta property="og:description"${addAttribute(description, "content")}><meta property="og:type" content="website"><!-- Twitter --><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title"${addAttribute(title, "content")}><meta name="twitter:description"${addAttribute(description, "content")}>${renderHead()}</head> <body class="paper-grain min-h-screen relative"> ${renderSlot($$result, $$slots["default"])} </body></html>`;
}, "/home/someone_practicing/sunflora/src/layouts/Layout.astro", void 0);

export { $$Layout as $, createComponent as c };
