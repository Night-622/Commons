// firebase.js imports the SDK from gstatic. In tests those imports go to the npm SDK, wrapped to use the emulators.
const SHIM = /^https:\/\/www\.gstatic\.com\/firebasejs\/[^/]+\/firebase-(app|auth|firestore)\.js$/;
export async function resolve(specifier, context, next) {
  const m = specifier.match(SHIM);
  if (m) return { url: new URL(`./sdk-${m[1]}.mjs`, import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
