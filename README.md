# Commons

A persistent, shared-map city builder. Every player owns a 24×24 plot on one master map, next to real neighbours. Cities keep running while you're away (up to 3 days), and cities that collapse stay on the map as ruins with a record.

Plain HTML, CSS and JavaScript modules on Firebase Hosting, with Firestore and Firebase Auth. No build step.

## Sign-in options

Enable these in the Firebase console under **Authentication → Sign-in method**:

- **Email/Password**
- **Anonymous** (this is "Play as a guest")
- **Google**

Guests can turn their guest city into a full account later (Account menu). Linking keeps the same user id, so the city comes along.

## More
- Level crossings (draw rail over a road), congestion-aware driving, seasons and weather on a shared world clock.
- Policies (tax, service funding, free transit), resident requests with rewards, factory goods sold to neighbours.
- Life stories and favourites for residents, catalogue search, snapshot undo for the last minute, photo mode, likes, chat mute and report, browser alerts, installable app.
- Saves are split: `plots/{id}` is a small public summary everyone listens to; `plotState/{id}` holds the full city and is only fetched for adjacent neighbours.
- `node test/balance.mjs` runs a scripted city for 100 days.

## Zoning and disasters
- Zones (homes, shops, industry) grow private buildings when demand is positive; they cost the city no upkeep.
- Floods after heavy rain (storm drains protect within 8 tiles) and blackouts (a second power station is a backup). Fires are softened by fire stations.

## Deploy

Push to `main`. The GitHub Action deploys hosting.

Firestore rules are not deployed by the Action. After changing `firestore.rules`, run `npm run deploy:rules` (needs the Firebase CLI, logged in).

## Features

- Real residents: names, ages, families, education, jobs, health and moods. A day is a year of life.
- Every car, bike and walker is a resident on a real trip: to work, school, the shops, a clinic or a night out. Parents drive young children to school.
- Life events: births, couples, children growing up and moving out, illness, injury, old age, crime, court cases.
- 30 building types, each with a job: homes, work, education (daycare to university, tutoring, library), health and safety (clinic, hospital, police, fire, courthouse, cemetery), leisure and sport.
- Services only open when staffed by people with the right education.
- Build, Select and Move modes. Tap land in Build mode for a menu of everything you can afford.
- Land: buy 4×4 parcels next to what you own.
- Roads with pavements, footpaths for walkers and bikes.
- Buses and trains: a bus depot runs buses between your stops; stations beside a railway carry people on long trips. Riders leave their cars at home.
- Railways or roads that cross into a neighbour's city link the two: trade, mood, and out-of-town jobs your residents reach by train or bus.
- Linked cities share spare facilities (leisure, clinics, shops, schools): residents cross over and visitors come back, earning the host money.
- Holidays in linked cities, and unhappy families migrating to a happier linked city (sent through `worlds/{world}/moves`).
- Live: every plot in the world is streamed with Firestore listeners, so changes appear within a second or two. Cities save every 12 seconds and right after building.
- World chat, neighbour links, moving onto ruins, private worlds.
- Account: profile, lifetime stats, 25 achievements, delete account (the city becomes ruins).
- Interactive tutorial, 3D and 2D views, colour-blind modes and other accessibility options.

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
- `public/js/trips.js` — residents' trips as cars, bikes and walkers
- `public/js/account.js` — lifetime stats and achievements
- `public/js/tutorial.js` — the interactive tour
- `public/js/prefs.js` — accessibility and display settings, colour modes
- `public/js/sound.js` — synthesised sound effects
- `public/js/firebase.js` — auth and data
- `public/js/constants.js` — every tunable number

## Accessibility

Colour modes for red–green and blue–yellow colour blindness plus high contrast; shape badges on buildings; a flat 2D view; light, dark or system theme; three text sizes; reduced motion; notification levels; compact layout; full keyboard play (arrow keys and Enter on the map); screen reader announcements.
