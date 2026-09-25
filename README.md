# Commons

A persistent, shared-map city builder. Every player owns a 24×24 plot on one master map, next to real neighbours. Cities keep running while you're away (up to 3 days), and cities that collapse stay on the map as ruins with a record.

Plain HTML, CSS and JavaScript modules on Firebase Hosting, with Firestore and Firebase Auth. No build step.

## Sign-in options

Enable these in the Firebase console under **Authentication → Sign-in method**:

- **Email/Password**
- **Anonymous** (this is "Play as a guest")
- **Google**

Guests can turn their guest city into a full account later (Account menu). Linking keeps the same user id, so the city comes along.

## Deploy

Push to `main`. The GitHub Action deploys hosting.

Firestore rules are not deployed by the Action. After changing `firestore.rules`, run `npm run deploy:rules` (needs the Firebase CLI, logged in).

## Features

- Isometric 3D and flat 2D views, day and night, traffic that drives real commutes
- People: every resident has a name, household, job, mood and a thought; follow anyone's commute
- City stats: population mix, capacity, daily budget breakdown, 30-day history charts
- News feed with random events (festivals, visitors, storms, fires, grants)
- Goals with cash rewards, building upgrades to level 3, tap to help builders
- Neighbour links: roads that meet across a plot edge form a bridge, earning trade and mood
- Rebuild on your own ruins, or move onto anyone's ruins
- Private worlds with invite codes, and switching between worlds
- Interactive tutorial that waits for you to do each step

## Local test

```
npm test          # simulation tests
npm run serve     # local server
```

## Files

- `public/js/sim.js` — the whole simulation (pure, testable)
- `public/js/render.js` — isometric 3D and flat 2D renderer
- `public/js/main.js` — game controller, HUD, input, menus
- `public/js/panels.js` — People, Stats, News, World and Goals panels
- `public/js/people.js` — named residents derived from the simulation
- `public/js/cars.js` — visual traffic
- `public/js/tutorial.js` — the interactive tour
- `public/js/prefs.js` — accessibility and display settings, colour modes
- `public/js/sound.js` — synthesised sound effects
- `public/js/firebase.js` — auth and data
- `public/js/constants.js` — every tunable number

## Accessibility

Colour modes for red–green and blue–yellow colour blindness plus high contrast; shape badges on buildings; a flat 2D view; light, dark or system theme; three text sizes; reduced motion; notification levels; compact layout; full keyboard play (arrow keys and Enter on the map); screen reader announcements.
