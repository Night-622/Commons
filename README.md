# Commons

A persistent city-builder on a shared map. Plain HTML/CSS/JS, Firebase Auth + Firestore + Hosting, deployed from GitHub.

## Setup (once)

1. **Create the Firebase project** at console.firebase.google.com.
   - Build > Authentication > Get started > enable **Google**.
   - Build > Firestore Database > Create database (production mode, pick `australia-southeast1` for Sydney).
   - Project settings > Your apps > add a **Web app**. Copy the config object into `public/js/config.js`.
2. **Put your project ID** in `.firebaserc` and both files in `.github/workflows/`.
3. **Install the CLI and log in:** `npm i -g firebase-tools`, then `firebase login`.
4. **Deploy the security rules:** `npm run deploy:rules`. (GitHub Actions only deploys hosting, so rerun this whenever `firestore.rules` changes.)
5. **Connect GitHub:** push this folder to a GitHub repo, then run `firebase init hosting:github` in it. It creates a service account and stores it as a repo secret named `FIREBASE_SERVICE_ACCOUNT_<PROJECT_ID>`. Either rename that secret to `FIREBASE_SERVICE_ACCOUNT` or update the two workflow files to use its name. If it offers to overwrite the workflow files, say no.
6. Push to `main`. The site deploys to `https://<project-id>.web.app`. Pull requests get preview links.

## Local development

`npm run serve` serves `public/` at http://localhost:5000 (Google sign-in works on localhost by default). `npm test` runs the simulation tests.

## Where things are

| File | What it does |
|---|---|
| `public/js/constants.js` | Every balance number: costs, upkeep, road capacity, tax, school length, tick speed |
| `public/js/sim.js` | The whole simulation, pure JS, no DOM or Firebase |
| `public/js/render.js` | Canvas map rendering |
| `public/js/main.js` | Game loop, input, HUD, modals |
| `public/js/firebase.js` | Auth, plot claiming, saving, world loading, leaderboards |
| `public/js/spiral.js` | Plot placement on the master map |
| `firestore.rules` | Who can read and write what |

## Data model

- `worlds/public` holds `nextIndex`, the next spiral slot to hand out.
- `plots/public_{x}_{y}` holds owner, position, the serialized city (`state`), and top-level summary fields (`pop`, `peakPop`, `day`, `status`...) for leaderboards and the map.
- `users/{uid}` points to the player's plot.
- `legacy/{auto}` is a permanent record written when a city falls.

## Known limits of this first version

- The simulation runs in the player's browser, so a determined player could edit their own city's money from the console. Fixing this means moving `sim.js` into Cloud Functions, which needs the Blaze plan. The sim is already DOM-free so it can move as-is.
- Two open tabs on the same account will overwrite each other's saves.
- The world loads up to 400 plots at once. Past that, load by map region instead.

## Not built yet

Plot-to-plot connections, the land market (buying, selling, salvage), rebuilding on someone else's ruins, and private worlds.
