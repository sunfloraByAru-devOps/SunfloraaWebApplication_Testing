const DINO = new Proxy({"src":"/_astro/green-dino.ZG0GhYH8.jpg","width":3024,"height":4032,"format":"jpg"}, {
						get(target, name, receiver) {
							if (name === 'clone') {
								return structuredClone(target);
							}
							if (name === 'fsPath') {
								return "/home/someone_practicing/sunflora/src/assets/green-dino.jpg";
							}
							if (target[name] !== undefined && globalThis.astroAsset) globalThis.astroAsset?.referencedImages?.add("/home/someone_practicing/sunflora/src/assets/green-dino.jpg");
							return target[name];
						}
					});

const SUNMOON = new Proxy({"src":"/_astro/sun_and_moon.0hySUkMw.jpg","width":2718,"height":4080,"format":"jpg"}, {
						get(target, name, receiver) {
							if (name === 'clone') {
								return structuredClone(target);
							}
							if (name === 'fsPath') {
								return "/home/someone_practicing/sunflora/src/assets/sun_and_moon.jpg";
							}
							if (target[name] !== undefined && globalThis.astroAsset) globalThis.astroAsset?.referencedImages?.add("/home/someone_practicing/sunflora/src/assets/sun_and_moon.jpg");
							return target[name];
						}
					});

export { DINO as D, SUNMOON as S };
