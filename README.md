# Commons

A persistent, shared-map city builder. Every player owns a 24×24 plot on one master map, next to real neighbours. Cities keep running while you're away (up to 20 city days), and cities that collapse stay on the map as ruins with a record.

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

## New in 1.8: languages
- `public/js/i18n.js` translates the interface as it is drawn: the English text is its own key, so untranslated text stays English. Anything inside `[translate="no"]` is left alone.
- Dictionaries live in `public/js/lang/`. To add a language: copy `el.js` to e.g. `fr.js`, translate the right-hand sides, then add it to `LANGS` and `languages` in `i18n.js`. Text with numbers in it goes in `patterns`.
- Still English: news items, advisor tips and toasts built from several parts. Add those strings to the dictionary as you go.

## New in 1.7
- Heritage (`s.bday` build days, `s.protect`, `isHistoric`), Monument, disaster insurance (`policy.insured`), city bonds (`s.bond`), selling land back (`sellLand`), crowdfunded requests (`want.fund`), monthly growth (`flags.season`, `growth` in the plot summary) and a hall of fame.
- Generated music (sound.js `music`), remappable keys (`prefs.keys`), thumb layouts (`prefs.hand`).

## New in 1.6
- Region panel: regional projects (`worlds/{w}/projects`, contributions in a transaction; rules only let a player raise their own line, by up to $2,000 at a time) and alliances (`worlds/{w}/alliances`, members-only chat; rules let a player add or remove only themselves, 12 max).
- Simple mode, striped info views, per-view sounds, softer repeated errors, separate city-sound volume, mute in background, haptics.

## New in 1.5
- Research (`TECH`, `s.rp`, `s.tech`), eras (`ERAS`), the metro (trip mode `metro`, riders shown but not drawn), resident letters and promises (`s.letter`, `s.pledge`), election challengers (`s.flags.opp`), follow-up decisions (`chain: true` in `DECISIONS`, queued in `s.flags.chain`), roof variety, winter roofs and damage cracks.

## New in 1.4
- Residents' traits and pets are derived from their ids (`traitOf`, `hasPet` in sim.js), so older saves get them without migration. Pensions, school quality from staffing, a Vet.
- Rubbish and sewage as capacity-based utilities (`wasteStatus`): landfill, recycling centre, sewage works.
- Timelapse: one map string a day in localStorage (`commons-tl-{plotId}`), replayed with the normal renderer and recordable to WebM with MediaRecorder.

## New in 1.3
- Terrain (`terrainFor` in sim.js): value noise on master-map coordinates, so rivers and coast continue across plots. Each city stores its own copy in `state.terr` (one character a tile: 0 land, 1 hill, 2 water) and sends it in the map string; buildings from before terrain stay dry. Bridges cost 4×, hills 1.4×.
- Harbour and airport, daily challenges, mayor levels with flag colour unlocks (the colour is saved as `flag` on the plot), undo history list, coverage previews while placing.

## New in 1.2
- Weekly world challenges (rotating goals, $600 for every city that helped), guestbooks, gifts between mayors (capped per day), chat reactions and a server-enforced chat slow mode (`chatLimits/{uid}`), blocking, a live "Around the world" feed, renaming private worlds, share-sheet screenshots on phones.

## New in 1.1
- Land value per tile, rent pressure and an optional property tax; a Land value info view.
- The city Daily newspaper, an alerts inbox, a 7-day money forecast and a 3-day weather forecast.
- Cities simulate up to 20 days while you're away, in slices with a progress screen.
- Two tabs on one city: the newest plays, the older pauses (no more overwritten saves).
- Quick-build bar, Upgrade all, confirmations for big spends, milestones, neighbour arrivals, city download.
- Firestore offline cache for faster loads.
- `admin.html`: read and handle feedback and chat reports, delete chat messages. To make yourself an admin, create a document `admins/{your uid}` in the Firebase console (any field). Your uid is in Authentication, Users.

## New in 1.0
- Clean energy (solar farms, wind turbines) alongside the fossil power station; an air-quality stat that makes people ill and unhappy when it drops.
- Tourism: museums and stadiums draw visitors, hotels let them stay the night.
- The bank: loans sized by a credit rating (A–D), repaid automatically over 40 days.
- Policies: congestion charge and carbon tax, on top of tax, funding and free transit.
- Earthquakes and tornadoes; new council votes (car-free Sundays, four-day week, expenses scandal, factory robots).
- City badges and eight leaderboards (biggest, longest running, fallen, happiest, greenest, transit, richest, tourism).
- Ten new achievements, two of them secret. Undo reaches back five minutes.
- Accessibility: an easy-to-read font and a larger interface size; disasters and goals can be spoken aloud.
- Invite links for private worlds (`?join=CODE`) and joining a friend's world from the "Found your city" screen.
- Saving retries by itself and shows Saved / Saving / Not saved by the clock. If the live rules are older than the game, it falls back to the one-document save instead of failing.

## Zoning and disasters
- Zones (homes, shops, industry) grow private buildings when demand is positive; they cost the city no upkeep.
- Floods after heavy rain (storm drains protect within 8 tiles) and blackouts (a second power station is a backup). Fires are softened by fire stations.

## Deploy

Push to `main`. The GitHub Action deploys hosting.

After changing `firestore.rules`, run `npm run login` once, then `npm run deploy:rules` (npx fetches the Firebase CLI, nothing to install).
The Action also tries to deploy the rules on every push. That needs the **Firebase Rules Admin** role on the GitHub deploy service account (Google Cloud console, IAM). Without it the step warns and the site still deploys.

Every collection and subcollection the game touches needs its own `match` block: rules on `/worlds/{id}` don't cover `/worlds/{id}/chat`.

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
- `public/admin.html`, `public/js/admin.js` — moderation page

## Accessibility

Colour modes for red–green and blue–yellow colour blindness plus high contrast; shape badges on buildings; a flat 2D view; light, dark or system theme; three text sizes; reduced motion; notification levels; compact layout; full keyboard play (arrow keys and Enter on the map); screen reader announcements.
