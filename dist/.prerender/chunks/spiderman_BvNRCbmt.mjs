import { l as createRenderInstruction } from './prerender_DGZJpN45.mjs';

async function renderScript(result, id) {
  const inlined = result.inlinedScripts.get(id);
  let content = "";
  if (inlined != null) {
    if (inlined) {
      content = `<script type="module">${inlined}</script>`;
    }
  } else {
    const resolved = await result.resolve(id);
    content = `<script type="module" src="${result.userAssetsBase ? (result.base === "/" ? "" : result.base) + result.userAssetsBase : ""}${resolved}"></script>`;
  }
  return createRenderInstruction({ type: "script", id, content });
}

const HERO = new Proxy({"src":"/_astro/sun_on_desk.C8T7yJPI.png","width":1280,"height":888,"format":"png"}, {
						get(target, name, receiver) {
							if (name === 'clone') {
								return structuredClone(target);
							}
							if (name === 'fsPath') {
								return "/home/someone_practicing/sunflora/src/assets/sun_on_desk.png";
							}
							if (target[name] !== undefined && globalThis.astroAsset) globalThis.astroAsset?.referencedImages?.add("/home/someone_practicing/sunflora/src/assets/sun_on_desk.png");
							return target[name];
						}
					});

const STARS = new Proxy({"src":"/_astro/stars.CM_7M5Kl.png","width":1011,"height":566,"format":"png"}, {
						get(target, name, receiver) {
							if (name === 'clone') {
								return structuredClone(target);
							}
							if (name === 'fsPath') {
								return "/home/someone_practicing/sunflora/src/assets/stars.png";
							}
							if (target[name] !== undefined && globalThis.astroAsset) globalThis.astroAsset?.referencedImages?.add("/home/someone_practicing/sunflora/src/assets/stars.png");
							return target[name];
						}
					});

const SUN_CLOSEUP = new Proxy({"src":"/_astro/sun_on_desk_closeup.B8PjDC5A.png","width":960,"height":1280,"format":"png"}, {
						get(target, name, receiver) {
							if (name === 'clone') {
								return structuredClone(target);
							}
							if (name === 'fsPath') {
								return "/home/someone_practicing/sunflora/src/assets/sun_on_desk_closeup.png";
							}
							if (target[name] !== undefined && globalThis.astroAsset) globalThis.astroAsset?.referencedImages?.add("/home/someone_practicing/sunflora/src/assets/sun_on_desk_closeup.png");
							return target[name];
						}
					});

const SPIDEY = new Proxy({"src":"/_astro/spiderman.B0vYca13.jpg","width":2686,"height":4032,"format":"jpg","orientation":1}, {
						get(target, name, receiver) {
							if (name === 'clone') {
								return structuredClone(target);
							}
							if (name === 'fsPath') {
								return "/home/someone_practicing/sunflora/src/assets/spiderman.jpg";
							}
							if (target[name] !== undefined && globalThis.astroAsset) globalThis.astroAsset?.referencedImages?.add("/home/someone_practicing/sunflora/src/assets/spiderman.jpg");
							return target[name];
						}
					});

export { HERO as H, SPIDEY as S, STARS as a, SUN_CLOSEUP as b, renderScript as r };
