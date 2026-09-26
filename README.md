# Commons

A persistent, shared-map city builder. Every player owns a 24×24 plot on one master map, next to real neighbours. A day lasts 30 real minutes (20 of daylight, 10 of night). Cities keep running while you're away (up to 48 city days, 24 hours), and cities that collapse stay on the map as ruins with a record.

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

## New in 1.18: styles, a fresh start, better names
- `STYLES` in constants.js: Frontier (hall level 0), Township (2), Modern (4), Skyline (6). Each has building colours (`cols`) and ground/road/wall colours (`map`) that the renderer merges over its light or dark theme (`styleScene` in main.js), and CSS variables (`:root[data-style=...]`: plates, ink, accent, font, a frosted `--blur`). `prefs.style` is `auto` (newest owned) or an id; locked ones can't be chosen. Colour-blind palettes still take priority for buildings.
- A fresh start: `WORLD_ID` is `s2`; `OPEN_WORLDS` lists only it, and private worlds made before `RESET_AT` aren't listed. Older worlds stay in Firestore (delete them in the console if you like). The rules accept any open world id matching `public|main|sN`, so the next fresh start is just a new id.
- Names: more first names and surnames (appended; people store them by position) and `cityName()` for founding.
- The 2D view is gone (`renderer.view` is always '3d'); the mood panel starts folded.

## New in 1.17: town hall levels, technology, the exchange, city shares
- Town hall levels (`HALL_LEVELS`): a city's size. `sim.hallState` / `sim.checkHall` (with the goals check): the hall upgrades itself when the city has the people, has met the level's objectives (tests in `PATH_TESTS`, kept in `s.hallDone`) and has the resources in store, which the upgrade uses. Each level sets the land cap (`canBuyLand`), extra storage (`storeCap`), research a day, and the hall's size on the map (`s.lv[HALL_INDEX]`). `s.hall` is the level; cities from before start where their size earns and keep the technologies behind features they used.
- Features open by technology or hall level (`FEATURE_NEEDS`, `sim.unlocked`): Trade (Market), Finance (city shares), Diplomacy (Region), High schools and Universities (buildings); co-mayors and more cities by hall level. `lockHtml` says exactly what opens each.
- The Next step line (`nextStep` in main.js): anything urgent, then the next hall level's first missing piece, then explore; Show me opens the right tool or panel. Goals lists the next level and "What your city needs".
- Neighbour goals (friend1, gift1, link1, deal1, ally1) and achievements (neighbour, trader, allied, investor).
- The map: unclaimed plots around the cities are drawn as terrain (`wildPlots`); `plotBorder` follows each city's owned parcels; ground texture patches. Taps use the ground tile (`renderer.hit`). The free 3D view and three.js are removed.
- The exchange: `sim.worldPrices(cities, day)` from everyone's summaries (which carry `res`, `bld`, `listed`): scarcity and a daily demand swing (`EXCHANGE`, `PER_CAPITA`). `state._prices` drives `buyResource`/`sellResource`, surplus sales and imports (clamped to `importBand`).
- City shares: `sim.cityValue`/`sharePrice`, `listCity`, `buyCityShares`, `sellCityShares` (`STOCK`); `worlds/{w}/stocks/{plotId}` counts shares for sale (`fb.tradeStock` in a transaction); rules keep it within bounds. `migrate` refunds the 1.16 companies.

## New in 1.16: alliance rankings
- Region panel ranks alliances by members' growth this month (from each plot's `growth`/`season` summary) or population; the leader gets a crown.

## New in 1.15: resources on show, harvests, materials in prices, and the free 3D camera
- `public/js/view3d.js` draws the city with three.js (pinned 0.186.1, served from `public/vendor/three-0.186.1/` through an import map in index.html; MIT licence alongside). It's imported the first time the Free view opens (`toggleFree` in main.js), so nobody else downloads it (about 420 KB compressed).
- `View3D.sync(scene)` rebuilds a plot's meshes only when its version changes: an instanced ground mesh per plot (terrain, roads, owned land), a mesh per building (with special shapes for water towers, wind turbines, factories, power stations and towers), trees, yellow borders. Each frame it moves the trip agents (one instanced mesh), updates harvest markers, lighting and night windows.
- Picking ray-casts buildings and ground and hands back a tile to the usual `click()`, so selection, building and harvesting all work there. The selection glows and gets an outline.
- The canvas renderer also outlines the selected building in the normal 3D view.

- Top-bar resources (`renderResbar`): water, power, food and materials in store, red when water or power runs short. Tap for City stats, Resources.
- Harvests: every hour a staffed producer adds to `s.ready[i]` (up to `HARVEST.max` hours). From `HARVEST.min` hours a bubble shows and tapping collects `sim.harvest`: `bonus` x what it made in that time, on top of normal output. The balance bot collects daily, like a player.
- Materials: `sim.matCost` (a load per $25 of price) and `sim.buildPrice`: the list price includes buying them in; each load from your store takes `MAT_BUY` off (never below half). `place` records `paid`/`mat` on the queue item so undo refunds exactly.
- The catalogue shows materials and daily output (`gives`), the building panel shows output, harvest and power use, and people show their daily needs.

## New in 1.13: market, labour contracts, private messages
- `worlds/{w}/offers` (kinds sell, buy, loan, labour) and `worlds/{w}/deals`. Posting reserves goods, money or workers in `s.escrow` (`sim.reserve`/`release`); `fb.takeOffer` marks an offer taken and writes the taker's deal in one transaction; the owner's game applies deals addressed to it (`toPlot`). Loans: the borrower gets a debt (`sim.addDebt`), repaid by `repayDebts` on the due day with a `repay` deal. Rules: `dealOk` only lets deals flow between an offer's two sides, within its amounts.
- Labour contracts: `sim.hireCrew` adds `s.contracts`; in `plan()` contract crews fill empty job slots (`s._cfill`, counted by `staffing`). The lending city's jobless adults get `p.oc` (away until that day) via `sim.sendCrew`: they count as employed and aren't matched to local jobs.
- `state.applied` remembers the last 80 gifts, moves and deals a city has applied, so a document that shows up twice (before its deletion lands, or after a reload) counts once.
- Private messages: `dms/{pair}/messages` (pair = sorted uids joined with _) and `inbox/{uid}/threads/{other}` (one line per conversation; a sender may only stamp their own line in yours, as unread).

## New in 1.12: resources and the technology tree
- `RES` in constants.js: water, power, veg, fruit, dairy, meat, materials. Buildings list what they make a day in `makes` (water tower 80, power station 120, solar and wind 60, urban farm 25 veg, orchard 25 fruit, dairy farm 25, ranch 20 meat, materials works 30); `sim.production` scales by staffing and level.
- Once a day `resourcesDay` (inside `daily`): people use `USE` (1 water, 0.5 power, 1 food each; 1 power per staffed building), food comes from every kind in store and the rest is imported at the average `import` price (upkeep "imports"), anything over `storeCap` (`STORE_BASE` + warehouses) sells at `SURPLUS_SALE` of the import price (income "produce"). Stock lives in `s.res`; yesterday's figures in `s.stats.res`.
- Effects: a water or power shortfall (when there is some supply but not enough; none at all is still the coverage rule) lowers mood; each kind of food past the first adds mood. Materials in store make builders `MATERIALS_BOOST` faster and are used up at `MATERIALS_PER_WORK`.
- `TECH` entries have a `branch` (`TECH_BRANCHES`) and the Research tab shows them as a tree. New: orchards, dairy, ranching, logistics; vertical farming now follows orchards.
- New building types 56-60 (orchard, dairy, ranch, materials works, warehouse), with models in render.js. Map codes stay below 76 so they never clash with the `|` separator.

## New in 1.11: one joined-up world, councils, co-mayors
- `WORLD_ID` is `main`: a fresh world with `GAP` 0, so plots touch and `terrainFor` runs straight across borders; the renderer draws a thin yellow border round each plot (`plotBorder`). The classic `public` world is kept (`CLASSIC_WORLD`, `OPEN_WORLDS`) and players who were in it start in the new one once (`commons-world-v2` in localStorage). Founding skips spiral slots someone already holds, and the rules let `nextIndex` jump forward by up to 30.
- Councils: `fb.buyPlot` founds a city on free land touching one of yours (`via`), priced by `sim.plotPrice` (`PLOT_BUY_*`), up to `MAX_CITIES`. The link doc keeps `plotIds`; `plotId` is the home city (`fb.setHome`). Rules: `boughtNextTo` and `citiesOk`.
- Co-mayors: `plots/{id}.co` (up to `MAX_CO` uids) set by the owner (`fb.setCoMayors`); co-mayors save like the owner but can't change `owner` or `co` except to leave (`fb.leaveCo`). Friends live in the private profile (`profile.friends`).
- The desk: `desks/{plotId}` {uid, name, at, idle}, readable and writable only by the owner and co-mayors. The holder stamps it every `DESK_BEAT_MS` with `idle` after `DESK_IDLE_MS` without input; others watch (`fb.listenState`, no simulating or saving) and can take it when it's idle or older than `DESK_STALE_MS`.
- The smoke-test fake keeps the signed-in player per tab (sessionStorage), so one browser can hold two players.

## New in 1.10: slower days, staff, layout
- Time: `TICK_MS` is 75 s, so a day is 30 minutes; night runs `DUSK` 22:00 to `DAWN` 06:00 (10 of the 30 minutes). Builders work `BUILD_SPEED` (30x) per hour and progress between hours through `sim.work(s, fractionOfHour)`, called from the game loop; `tick()` does the rest of the hour. `s.wk` tracks how much of the hour's building is done. `MAX_OFFLINE_DAYS` is 48.
- Staff: `sim.hire`, `sim.fire`, `sim.recruit` (`RECRUIT_COST` by the job's education), `sim.candidates`. Hired people have `lk` set and the daily job shuffle leaves them alone; people let go get `nf`/`nfu` and aren't matched to that building for `FIRED_DAYS`.
- Learning: library evening classes work at every level (`ADULT_STUDY_YEARS`), and `TRAINING_YEARS` of work count as a level up to high school (`xp`).
- Person keys `lk`, `nf`, `nfu`, `xp` are appended to `PKEYS`; older saves unpack with them empty.
- Layout prefs `uiSize` (CSS zoom on the panels), `menus` (`across` | `down`) and `uiMin` (U hides the interface); every drawer gets a maximise button.

## New in 1.9: young towns
- Utilities arrive in stages: power and water from 25 people (`UTILITY_POP`), rubbish from 45 (`WASTE_POP`), sewage from 70 (`SEWAGE_POP`). Before, three of them landed at 25 and the fourth at 40, and about a third of scripted towns stalled or collapsed.
- The advisor's leisure tip scores `3 + 3 × shortfall` instead of a flat 3, so parks get built early.
- An empty town counts at mood 0.65 (like a new one), so newcomers can arrive if it has homes.
- Result with `npm run balance -- 1-60`: grown 57, stalled 3, fell 0 (was 30 / 20 / 10).

## New in 1.8: languages
- `public/js/i18n.js` translates the interface as it is drawn: the English text is its own key, so untranslated text stays English. Anything inside `[translate="no"]` is left alone.
- Dictionaries live in `public/js/lang/`. To add a language: copy `el.js` to e.g. `fr.js`, translate the right-hand sides, then add it to `LANGS` and `languages` in `i18n.js`. Text with numbers in it goes in `patterns`.
- Still English: news items, advisor tips and toasts built from several parts. Add those strings to the dictionary as you go.
- Stricter saves in `firestore.rules`: every plot write carries the server's timestamp (`updatedAt == request.time`), and between saves money, population, peak population and days can only rise as fast as a real city (`riseOk`). New cities start with at most $3,000 and 12 people; rebuilds with $3,500 plus half the mover's old money. `plotState` can only be written with its plot summary. Gifts must come from your own plot; fallen-city records must match your plot's last save.

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

- Real residents: names, ages, families, education, jobs, health and moods. Two days are a year of life.
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
npm install              # once: test tools (Firebase emulators, Playwright)
npx playwright install chromium   # once
npm test                 # simulation tests
npm run test:rules       # security rules against the Firestore emulator (needs Java 21+)
npm run test:smoke       # the game in Chromium with a fake firebase.js
npm run balance -- 1-30  # 30 scripted cities for 100 days: grown / stalled / fell
npm run serve            # local server
```

The rules tests run the game's own `public/js/firebase.js` in node: `test/rules/loader.mjs` points its gstatic imports at the npm SDK wired to the emulators. The smoke tests serve `public/` with `js/firebase.js` swapped for `test/smoke/fake-firebase.js`, which keeps data in localStorage; `window.__fakeFb.failSaves = 'unavailable'` makes saves fail. When you add an export to `firebase.js`, add it to the fake too (a test checks they match).

GitHub runs all three suites before every deploy (`.github/workflows/tests.yml`); a failure stops the deploy.

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
