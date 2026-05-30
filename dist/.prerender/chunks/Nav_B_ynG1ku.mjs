import { c as createComponent } from './Layout_SblD8Eqv.mjs';
import 'piccolore';
import { p as maybeRenderHead, j as addAttribute, t as renderTemplate } from './prerender_DGZJpN45.mjs';
import 'clsx';
import { r as renderScript } from './spiderman_BvNRCbmt.mjs';

const Logo = new Proxy({"src":"/_astro/logo.DOgqsJAK.png","width":806,"height":303,"format":"png"}, {
						get(target, name, receiver) {
							if (name === 'clone') {
								return structuredClone(target);
							}
							if (name === 'fsPath') {
								return "/home/someone_practicing/sunflora/src/assets/logo.png";
							}
							if (target[name] !== undefined && globalThis.astroAsset) globalThis.astroAsset?.referencedImages?.add("/home/someone_practicing/sunflora/src/assets/logo.png");
							return target[name];
						}
					});

const $$Nav = createComponent(($$result, $$props, $$slots) => {
  const links = [
    { label: "Shop", href: "/productlist" },
    { label: "Story", href: "/#story" },
    { label: "Customs", href: "/#custom" },
    { label: "FAQ", href: "/#faq" }
  ];
  return renderTemplate`${maybeRenderHead()}<header id="site-header" data-testid="site-header" class="fixed top-0 left-0 right-0 z-50 transition-all duration-500 py-6" data-astro-cid-dmqpwcec> <div class="max-w-[1400px] mx-auto px-6 md:px-12 flex items-center justify-between" data-astro-cid-dmqpwcec> <a href="#top" data-testid="nav-logo" class="flex items-center logo-wrap" data-astro-cid-dmqpwcec> <img${addAttribute(Logo.src, "src")} alt="Sunflora" class="logo-img" style="mix-blend-mode: multiply;" data-astro-cid-dmqpwcec> </a> <nav class="hidden md:flex items-center gap-10" data-astro-cid-dmqpwcec> ${links.map((l) => renderTemplate`<a${addAttribute(l.href, "href")}${addAttribute(`nav-link-${l.label.toLowerCase()}`, "data-testid")} class="nav-link hover-underline text-sm tracking-wide" data-astro-cid-dmqpwcec> ${l.label} </a>`)} </nav> <a href="#cta" data-testid="nav-cta-button" class="nav-cta hidden md:inline-flex items-center gap-2 px-5 py-2.5 text-sm tracking-wide transition-all duration-500" data-astro-cid-dmqpwcec>
Inquire
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-astro-cid-dmqpwcec><path d="M7 17L17 7" data-astro-cid-dmqpwcec></path><path d="M7 7h10v10" data-astro-cid-dmqpwcec></path></svg> </a> <button id="mobile-toggle" data-testid="mobile-menu-toggle" class="md:hidden nav-link" aria-label="Toggle menu" data-astro-cid-dmqpwcec> <svg id="icon-menu" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-astro-cid-dmqpwcec><line x1="4" y1="12" x2="20" y2="12" data-astro-cid-dmqpwcec></line><line x1="4" y1="6" x2="20" y2="6" data-astro-cid-dmqpwcec></line><line x1="4" y1="18" x2="20" y2="18" data-astro-cid-dmqpwcec></line></svg> <svg id="icon-close" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="hidden" data-astro-cid-dmqpwcec><line x1="18" y1="6" x2="6" y2="18" data-astro-cid-dmqpwcec></line><line x1="6" y1="6" x2="18" y2="18" data-astro-cid-dmqpwcec></line></svg> </button> </div> <div id="mobile-menu" class="md:hidden hidden bg-[#EFE8DA] border-t border-[rgba(26,24,21,0.08)] overflow-hidden" data-astro-cid-dmqpwcec> <div class="px-6 py-6 flex flex-col gap-5" data-astro-cid-dmqpwcec> ${links.map((l) => renderTemplate`<a${addAttribute(l.href, "href")} class="mobile-nav-link font-serif-display text-3xl italic text-[#1A1815]" data-astro-cid-dmqpwcec>${l.label}</a>`)} <a href="#cta" class="mobile-nav-link mt-2 inline-flex items-center gap-2 bg-[#1A1815] text-[#EFE8DA] px-5 py-3 text-sm w-fit" data-astro-cid-dmqpwcec>
Inquire
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-astro-cid-dmqpwcec><path d="M7 17L17 7" data-astro-cid-dmqpwcec></path><path d="M7 7h10v10" data-astro-cid-dmqpwcec></path></svg> </a> </div> </div> </header>  ${renderScript($$result, "/home/someone_practicing/sunflora/src/components/Nav.astro?astro&type=script&index=0&lang.ts")}`;
}, "/home/someone_practicing/sunflora/src/components/Nav.astro", void 0);

export { $$Nav as $ };
