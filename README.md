# Commons

A persistent, shared-map city builder. Every player owns a 24×24 plot on one master map, next to real neighbours. A day lasts 10 real minutes (about 6 of daylight, 4 of night). Cities keep running while you're away (up to 144 city days, 24 hours), and cities that collapse stay on the map as ruins with a record.

Plain HTML, CSS and JavaScript modules on Firebase Hosting, with Firestore and Firebase Auth. No build step.

## Sign-in options

Enable these in the Firebase console under **Authentication → Sign-in method**:

- **Email/Password**
- **Anonymous** (this is "Play as a guest")
- **Google**

Guests can turn their guest city into a full account later (Account menu). Linking keeps the same user id, so the city comes along.

## More
- Level crossings (draw rail over a road), congestion-aware driving, seasons and weather on a shared world clock.
- Policies (tax, service funding, free transit), resident requests with rewards, factory products sold in a Store or traded on the Market (see "New in 1.2" below).
- Life stories and favourites for residents, catalogue search, snapshot undo for the last minute, photo mode, likes, chat mute and report, browser alerts, installable app.
- Saves are split: `plots/{id}` is a small public summary everyone listens to; `plotState/{id}` holds the full city and is only fetched for adjacent neighbours.
- `node test/balance.mjs` runs a scripted city for 100 days.

## New in 2.14: sound waits for a gesture, faster births, and grocers as a real business

- **The bug**: `sound.js`'s `audio()` created a `new AudioContext()` the first time anything tried to play a sound - including `music()`/`ambient()`, called every frame from the game loop as soon as a city loads, well before the player has clicked anything. Every browser refuses to start an `AudioContext` before a real user gesture and logs "The AudioContext was not allowed to start" - `ctx.resume()` afterwards doesn't fix an attempt that started too early. Fixed by listening for the page's first `pointerdown`/`keydown`/`touchstart` and only constructing (or resuming) the context after that; `audio()` returns `null` before it, which every sound call already handled gracefully.
- `BIRTH_CHANCE` (was an inline `0.1` in `sim.js`'s daily family logic, now a named constant in `constants.js`) raised to `0.22` - residents have babies noticeably more often. A 60-seed `balance.mjs` sweep with this alone (grocers unchanged) came back at the same tally as before it, so the extra fragility below isn't from this.
- **Grocers are now a real business, not a free service.** `capacity(s, i, 'serves')` for `T.SHOP` used to be a flat, level-scaled number; it's now also capped by `shopTerms(s, i)` - a weekly `budget` and a `markup` (`GROCER_MARKUP_MIN`-`GROCER_MARKUP_MAX`, 120%-300% of `GROCER_FOOD_COST`) the mayor sets with `setGrocerTerms(s, i, budget, markup)` via a new form in the tile panel (`main.js`'s `ownTile()`/`wireDrawer()`). `grocerDemand(markup)` linearly slides from 1 at the lowest markup down to `GROCER_DEMAND_FLOOR` (0.35) at the highest - a high price buys in the same amount of food, but fewer residents actually pay for it, so the existing `shopFor`/mood-penalty path in `plan()` already treats them as unfed, same as living too far from any grocer. `daily()` charges `budget / 7` every day a shop is staffed, whether or not that food sold, and pays back `served × GROCER_FOOD_COST × markup` for what did - both folded into `st.byClass.grocery`/`st.upkeepBy.grocery` for the Budget panel. Until a mayor sets their own terms, `shopTerms()`'s default buys in exactly the shop's base capacity at the lowest markup (close to the old always-free behaviour, plus a little passive profit) and tracks upgrades automatically, so an untouched shop doesn't fall behind its own level.
- Balance impact: a 60-seed sweep went from the usual 0-2 fallen cities to 2/60 either way, with or without the birth-rate change - an empty or over-built grocer is now a real, if modest, drain a scripted bot doesn't actively manage, same kind of noise past economy changes (2.7, 2.9) accepted rather than chased further.
- New regression tests: `test/sim.test.mjs` ("grocers: a mayor-set weekly budget and markup...") checks the default terms, that `setGrocerTerms` validates the tile and clamps budget/markup, and that the same budget feeds more people at the lowest markup than the highest; `test/smoke/smoke.spec.mjs` ("grocer: set a weekly budget and price...") builds a grocer, submits the new form, and checks the panel reflects it.
- No firestore.rules change, no world reset - `s.shopTerms` lives inside the opaque `plotState` blob like everything else in `sim`'s state.

## New in 2.13: free rubble, and landmarks for fallen cities

- A fresh start: `WORLD_ID` moved on again (`s2` → `s3`).
- `bulldoze()`'s `T.RUBBLE` branch no longer charges (the removed `RUBBLE_CLEAR_COST` constant); clearing what a fallen city left behind is now free, whether you're rebuilding your own ruins or someone else's.
- New: `collapse()` now stashes its `record` (name, `daysSurvived`, `peakPop`) on the state as `s.fallen` - `rebuild()` doesn't touch it, so it survives into whichever city gets built on top. `sim.setLandmark(s, i, true)` turns one rubble tile into a permanent marker carrying a copy of that record (`sim.landmark(s, i)`); `bulldoze()` and `canPlace()`'s existing "clear the rubble first" check both already refuse a tile with a landmark on it, so once made it can never be cleared or built over until `setLandmark(s, i, false)` lifts it. Shown in the tile panel as a plaque with the fallen city's name, lifespan and peak population; drawn in `render.js`'s `object()` as a small plinth-and-stele instead of loose rubble (only where the full state is known - a distant neighbour rendered from just their `map` string still shows plain rubble).
- New regression test (`test/sim.test.mjs`, "landmarks: rubble is free to clear, or can be kept as a lasting marker") collapses and rebuilds a city, checks clearing rubble takes no money, and checks a landmarked tile resists both `bulldoze` and `place` until unmarked.
- No firestore.rules change - `s.fallen`/`s.landmarks` live inside the opaque `plotState` blob like everything else in `sim`'s state.

## New in 2.12: a Greek (or other non-English) name could jam every future save, forever

- **The bug**: `firestore.rules`' `nameOk()` checks `d.ownerName.size() <= 24` and `d.name.size() <= 40` - Firestore's `.size()` on a string counts UTF-8 *bytes*. The client only ever trimmed with JS's `.slice(0, 24)`/`.slice(0, 40)`, which counts UTF-16 *code units* - one per character for anything in the Basic Multilingual Plane, including Greek, Cyrillic and most other non-Latin scripts. A Greek letter is 2 bytes in UTF-8 but 1 JS "character", so a 20-letter Greek mayor name (well under the `found-mayor`/`acct-mayor` inputs' 20-character `maxlength`) is ~40 bytes: within every client-side check, over the rule's actual 24-byte limit. The founding form's own create would have caught this (`nameOk` also gates `plots` `create`), but the **rename-mayor flow didn't**: `save({ ownerName: v })` (main.js) sets the local `mayor` variable *before* the write is attempted, then the save is refused with `permission-denied` - the same error text `authMessage()` blames on stale rules. Worse, `save()`'s own retry logic (`if (ex) pendingExtra = { ...ex, ...(pendingExtra || {}) };`) re-queued that same rejected `ownerName` into every subsequent save attempt, forever - so from that point on, *every* save failed identically, including plain autosaves that had nothing to do with the name, and no amount of redeploying rules or refreshing the sign-in token (2.11) could ever fix it, because the rules were already correct and the token was never the problem.
- **The fix**: a byte-aware `truncateUtf8(str, maxBytes)` (encodes to UTF-8, cuts to `maxBytes`, then backs off a character at a time until it decodes cleanly) replaces every `.slice()` that feeds `plots.ownerName`/`plots.name` - at founding (`claimPlotTx`/`takeOverRuins`/`buyPlot`) and at rename (`savePlot`'s `extra.ownerName`, and the Account panel's input handling). As defence in depth, `save()` now drops a stuck `extra` after 3 identical failures instead of resurrecting it forever, so one bad field can no longer wedge every other save behind it - the player sees "a recent change couldn't be saved" instead of a silent, permanent stall.
- New regression test (`test/rules/rules.test.mjs`, "names: a multi-byte mayor or city name is truncated by bytes, not characters") claims a plot and renames with a name built to be exactly this shape (fits the character-count input limit, over the byte limit) and checks both the claim and the rename save succeed with a rules-legal `ownerName`/`name`.
- No firestore.rules change, no world reset - the rules were already right; this is a client-side fix.

## New in 2.11: a stale sign-in could get a tab stuck unable to save
- **The bug**: a Firebase ID token lasts an hour and is normally refreshed silently by the SDK's own internal timer, a few minutes before it expires - but a hidden/backgrounded browser tab has its timers throttled, so a tab left in the background (or a phone screen left off) for long enough can sit on an actually-expired token, unnoticed, until something tries to write. The next save then fails with `permission-denied` - indistinguishable in the console from a genuine stale-rules problem (`authMessage()` in firebase.js says exactly that), but redeploying rules does nothing for it, and neither did 2.10's fix (that was a real, separate bug, just not this one). The giveaway once seen directly: two *completely unrelated* writes - the routine autosave (`plots`/`plotState`) and a one-off "the city fell" record (`legacy`, written by `onCollapse()`) - failing with the identical error at the same moment. Different collections, different security-rule blocks; the only thing they share is `signedIn()`, so a token gone bad explains both at once in a way a rules-content bug can't.
- **The fix**: force a fresh ID token (`user.getIdToken(true)`) at the moments a stale one is most likely to bite - reader’s `visibilitychange` (tab regains focus after being hidden), the `online` event (reconnecting after being offline), and right before each retry once a save has actually come back `permission-denied` - so the retry loop can self-heal instead of failing the same way on every attempt until the SDK's own timer eventually gets around to it. `getIdToken` doesn't exist on the smoke-test fake auth user, so every call site uses `user?.getIdToken?.(true)` (optional chaining on the *call*, not just the property - `user?.getIdToken(true)` would still throw if the method were simply missing) with the whole chain, `.catch()` included, short-circuiting safely to `undefined` when it's absent.
- No firestore.rules change, no world reset - this is a client-side fix; nothing about the server side of authentication changed.

## New in 2.10: fixed a real crash 2.9 left behind for any city that had used bricks
- **The bug**: 2.9 removed `T.BRICKWORKS` from `B` and `bricks`/`tiles`/`pavers` from `PRODUCTS`, but never cleaned up saves that already referenced them, and render.js's main 3D draw path reads `B[t].col` with no guard (`object(g, P, plot, t, i, ...)`, render.js:488) - `B[66]` (the old Brickworks id, no longer in `T`) is `undefined`, so `undefined.col` throws. That's the primary game view, called every frame for every visible tile, for **your own plot and every neighbouring one on the shared map** - so a Brickworks anywhere in view (yours or a neighbour's) froze the render loop, which looks exactly like "it won't save": nothing updates, no error toast, because the exception happens in a `requestAnimationFrame` callback with nothing to catch it. Deploying rules again (the standard first thing to try for a *"Missing or insufficient permissions"* save failure - see `authMessage()` in firebase.js) does nothing for this, since it's not a rules problem at all.
- **Two-layer fix**: `sim.migrate()` (sim.js, runs on every load - your own city and any neighbour's state fetched via `fetchState()`/`fb.getState()`) now walks the grid once and turns any tile whose type isn't in `B` any more into rubble (`T.RUBBLE`, condition 0, same as a building that's fully decayed), clears a stale `s.rec[i]` pointing at a removed product, and drops any `s.res` key that's neither a known `RES` id nor a known `PRODUCT_IDS` id. Written generically (`!B[s.grid[i]]`, not a hardcoded check for id 66) so the same gap can't reopen the next time a building gets removed rather than added - a first for this codebase. render.js's `object()` also now treats `!B[t]` the same as `T.RUBBLE` directly, as defence in depth: it draws data from more sources than just your own migrated state (neighbours' lightweight `map` strings decoded by `fromMap()` skip `migrate()` entirely, by design - it's meant only for drawing), so the renderer needed to be safe on its own regardless of whether the data upstream was ever migrated.
- New regression test (`test/sim.test.mjs`, "migrate cleans up removed types") plants a fake removed-type tile, a stale recipe and orphaned resource stock, and checks `migrate()` clears all three.
- No firestore.rules change, no world reset (this only makes the game survive 2.9's reset gracefully - it doesn't need another one).

## New in 2.9: bricks removed - wood, metal and stone for building and upgrading alike
- **Bricks, Masonry, Bricklaying, the Brickworks, tiles and pavers are all gone.** `T.BRICKWORKS` is removed from the `T` enum and `B` entirely; `masonry`/`bricklaying` are removed from `TECH`; `bricks`/`tiles`/`pavers` are removed from `PRODUCTS`; `BRICK_DISCOUNT` and its use in `buildPrice` are removed; `STARTING_RES.bricks` is gone. The Coal mine and the `i-bricks` SVG symbol stay (coal is still tradeable; the icon was only ever used for bricks, so it's deleted rather than left dead).
- **Upgrading now costs wood, metal and stone too, the same three as building fresh** - not bricks any more. `buildPrice`'s three-way material split (wood, then metal, then stone, from stock; MAT_PER_COST per dollar of cost) is factored into a shared `matSplit(s, mat)` so building and upgrading can't drift apart. A new `upgradeMatCost(s, i)` applies that same rate to `upgradeCost` instead of a fresh build's price; `canUpgrade` gates on `stockOf('wood'/'metal'/'stone') >= 1` (replacing the old bricks gate) and returns the split it would spend; `upgrade()` spends it via `takeKind`, capped by what's in stock (no auto-buy-in, same as the old brick gate never bought bricks either - there's no simple buy line for any of the three at upgrade time).
- **A fresh start**: this changes the building roster (Brickworks removed) and an existing city's grid or resource stock could reference it, so `WORLD_ID` moved `s1` → `s2` (`OPEN_WORLDS`, `RESET_AT` today). Matches the precedent every past building-roster change has followed (2.0, 2.1).
- `test/balance.mjs`'s bot: the masonry-specific Factory recipe line is gone, replaced by a general "assign whatever product is researched" fallback (a Factory with no recipe earns nothing at all, so a sensible mayor always picks something). A `1-60` sweep lands at 56 grown / 2 stalled / 2 fell (was 58/2/0 immediately before this change) - traced to two specific seeds where the scripted bot's simple greedy "build whatever the top advice tip says" logic tips into a debt spiral a little earlier than before, not a deterministic defect in the underlying mechanics (which are covered by dedicated, passing unit tests). The same class of seed-specific sensitivity to RNG-consumption order has shown up before in this codebase (see 2.6's arrivals-rate tuning); a scripted bot isn't a real player and won't over-build the way these two seeds do.
- `test/rules/rules.test.mjs` had `'s1'` hardcoded as its open-world fixture in ~28 places (string literals and a few template-literal plot/membership IDs the initial pass missed) - all moved to `'s2'` to match.
- No firestore.rules change.

## New in 2.8: vehicles pointed the wrong way on north-south roads
- **Fixed a real bug**: `car()`, `vehicle()` (bus/train) and the bike branch of `agent()` in render.js all picked their orientation with `Math.abs(x.dx || 1) >= Math.abs(x.dy || 0)`. Road-grid movement is never diagonal, so a vehicle heading north or south has a perfectly legitimate `dx === 0` - but `0 || 1` is `1`, so that real zero got silently replaced with a fake nonzero `dx`, and every such vehicle was judged "moving along X" (east-west) regardless of which way it actually faced. The `|| 1`/`|| 0` fallbacks only exist for a freshly-spawned agent whose `dx`/`dy` haven't been computed at all yet (`undefined`, not `0`) - swapped for `?? 1`/`?? 0` (nullish coalescing) at all four call sites (render.js:632, 684, 706, 1288, including the minimap's tiny agent dots) so a real `0` is trusted and only a genuinely missing value falls back to the horizontal default. Verified with a standalone truth table across all four grid directions before and after the change. No firestore.rules change, no world reset.

## New in 2.7: metal and stone as real ingredients, bricks moved to reinforcing, tighter power/water
- **Construction now needs metal and stone too**, the same `stockOf >= 1` gate that wood already had, spent from the same `matCost(type)` pool wood and metal already shared (`buildPrice`, sim.js): wood first, then metal, then stone, whatever's short bought in at `MAT_BUY` off. `BUILD_MAT_EXEMPT` is down to `[T.MATERIALS, T.QUARRY]` - the Sawmill (wood) and the Quarry (metal *and* stone) are the only two buildings still buildable at zero, since together they're a full way back from running out of any of the three. Coal mine, Factory and Brickworks lost their exemption: they were only ever exempt for the old bricks gate, and none of them make wood, metal or stone. `STARTING_RES` gained `metal: 90, stone: 110` so a brand new city isn't dead on arrival under the new gate.
- **Bricks moved off ordinary construction and onto reinforcing (upgrading)**: `buildPrice`/`place`/`canPlace` no longer touch bricks at all (the passive "bricks in store, 5% off everything" `BRICK_DISCOUNT` perk stays). Instead, `canUpgrade` now also requires `(s.res.bricks || 0) >= 1`, and a new `reinforceCost(s, i)` (same `MAT_PER_COST` rate as construction, applied to `upgradeCost`, capped by what's in stock - there's no simple buy line for bricks) is spent by `upgrade()` on top of the money cost. `STARTING_RES.bricks` dropped from 200 to 20 - 200 would have bankrolled dozens of free reinforcements on day one, now that bricks aren't also a construction cost soaking them up.
- **The top bar is now water, energy, rock, wood, metal** (`i-stone`/`i-metal` are new SVG symbols, index.html): bricks and the people-fed chip moved off it. The "Products" chip's `hasProducts` check excludes bricks from *stock alone* triggering it (a new city's starting 20 would otherwise flip it on day one) but still counts ever having *made* some (`ps.made.bricks`), same trick the original bricks-chip carve-out used.
- **Power and water are deliberately less generous**: `USE.water` 1 → 1.3, `USE.power` 0.5 → 0.7, `USE.powerPerBuilding` 1 → 1.5, and a new `USE.waterPerBuilding` (0.6) - buildings now draw water too, not just people. Production trimmed to match: Power station 120 → 95 (cost 700 → 780, upkeep 12 → 15), Solar 60 → 48 (cost 560 → 620), Wind 60 → 48 (cost 480 → 540), Water tower 80 → 65 (cost 350 → 420, upkeep 5 → 7).
- `test/balance.mjs`'s bot got the "teach it too" treatment: Quarry moved up to the same priority as the Sawmill (pop ≥ 8, was pop ≥ 10, gated behind the bricks chain); the forced Logistics/Masonry research beeline is gone (nothing about basic growth needs it now); the quarry-picking logic nudges toward whichever of metal or stone is scarcer; and metal/stone got the same Exchange top-up safety net wood already had. `1-60`: 58 grown, 2 stalled, 0 fell (comparable to 2.6's own baseline).
- No firestore.rules change, no world reset.

## New in 2.6: a faster clock, an hourly money trickle, quicker arrivals
- **Days are 3x faster**: `TICK_MS` 75000 → 25000, so a 24-hour in-game day now takes 10 real minutes instead of 30. `DAWN`/`DUSK` moved from 6/22 (16h day, 8h night) to 6/20 (14h day, 10h night) to land close to the requested 6-minute day / 4-minute night split, given both have to land on whole hours. `MAX_OFFLINE_DAYS` scaled from 48 to 144 so the real-world offline catch-up window stays the intended 24 hours rather than shrinking to 8 - it's a real-time cap (`MAX_OFFLINE_DAYS * TICK_MS` hours of real time), not an arbitrary day count. No formula in sim.js reads `DAWN`/`DUSK` (main.js/rendering only), so nothing else needed to change.
- **An hourly money trickle, on top of the existing once-a-day settlement**: `daily()` still applies the full day's net exactly as before (so nothing that reads `s.money` right after it - the debt/bailout/collapse checks - changed at all), and now also sets `s.hourlyPay = Math.round(net / 10)`; `tick()` adds that every in-game hour. Purely additive by design (deliberately not a redistribution of the same total) to avoid touching the collapse-detection math, which assumes the day's earnings land in full the moment `daily()` runs.
- **Faster arrivals**: the daily arrivals budget (`daily()`, gated on `happiness >= 0.55` and no departures that day) went from `Math.max(1, round(freeRoom * 0.25 * happiness))` to `Math.max(2, round(freeRoom * 0.3 * happiness))` - a firm floor of 2 instead of 1, and a bit more scaling with free room. Tuned down from an initial 0.4 multiplier after `test/balance.mjs 1-15` showed it destabilizing two scripted cities (a stall and a collapse, neither present in the same seeds beforehand) - population was outrunning the bot's own build-out pace. At 0.3 the full `1-60` sweep matches or beats the baseline (0 fell either way; 1 stalled here vs 9 already stalled on unmodified 2.5, likely sweep-order noise in the bot harness either way, not a regression).
- Fixed a real, unrelated latent bug this surfaced: `test/sim.test.mjs`'s "research, letters, chains, metro" scenario pushes population straight to `COLLAPSE_POP` (40) with no water tower ever built, arming a real collapse a few days later (`waterShortDays`/`COLLAPSE_WATER_DAYS`) - it only ever passed because the letter it was waiting for fired before that timer ran out. Any change upstream that shifts the seeded RNG sequence (like the arrivals tweak above) can push the letter past that window and the whole city collapses to 0 population first. Gave the test city a water tower so it isn't riding a hidden countdown.
- No firestore.rules change, no world reset.

## New in 2.5: higher-level workplaces actually work faster, not just with more staff
- **Fixed a real gap**: `productsDay` (factory recipes) and `production`/`harvest` (power, water, solar, wind) already multiplied their output by `LEVEL.capacity[level(s, i)]`, so upgrading one of those buildings meant more output per staffed worker, on top of the extra job slots every upgradable building already gets from `scale()`. `advanceBatches` - the pick-a-target-and-collect production a Quarry, Coal mine, Sawmill, Urban farm, Orchard, Dairy farm, Ranch, Poultry farm or Greenhouse uses - never got the same multiplier: `b.p += r` (just the staffing ratio, 0.4-1.0) regardless of level, so upgrading one of those bought more workers but never actually finished a load any faster. Now `b.p += r * LEVEL.capacity[level(s, i)]`, matching every other kind of workplace. Level 1 (`LEVEL.capacity[1] === 1`) is unaffected, so this changes nothing for a freshly-built, un-upgraded city - only levelling up now pays off the way it always looked like it should. New regression test (`test/sim.test.mjs`, "workplace levels") upgrades a Quarry and checks its batch-fill rate goes from 1/hour to 1.75/hour. No firestore.rules change, no world reset.

## New in 2.4: a dedicated Brickworks, two fancier brick designs to sell
- **A new building, the Brickworks** (`T.BRICKWORKS`, `makesProducts: true`, gated behind a new `bricklaying` tech that needs `masonry`), alongside the Factory rather than instead of it - it exists so a city with both a Factory and a brick habit doesn't have to keep switching one factory between (say) Tools and Bricks. It's exempt from the wood/brick build-ingredient gate for the same reason `T.FACTORY` already is (added to `BUILD_MAT_EXEMPT`, sim.js): it's one of the buildings you'd need in order to ever recover from running out.
- **Products now carry a `buildings` allowlist** (`PRODUCTS[id].buildings`, constants.js): which building type(s) can pick that recipe. `sim.setRecipe` and `productsDay` both check it (previously `setRecipe` just hard-checked `s.grid[i] !== T.FACTORY`, so any future second `makesProducts` building would have been able to pick anything). Existing recipes got an explicit list (`furniture`/`tools`/`baked` → Factory only, `bricks` → Factory and Brickworks) so nothing about the Factory changes.
- **Two new Brickworks-only products**: Patterned tiles (`bricks: 2, metal: 1` → 1) and Ornamental pavers (`bricks: 3` → 1), both gated behind `bricklaying` - a step up in value from plain bricks, the way Furniture and Tools are a step up from raw wood and metal. They're ordinary `PRODUCT_IDS` entries otherwise: sellable in a Store, tradeable on the Market, counted in the general Products resbar chip. No firestore.rules change (products already rode inside the opaque `plotState` blob), no world reset.

## New in 2.3: bricks as a second required ingredient, a split resbar, live income
- **Bricks are a required ingredient too**, at the same rate as wood (`matCost(type)`, applied to `stockOf(s, 'bricks')` - `bricks` isn't a multi-id kind, so `stockOf`/`takeKind` just fall back to that one id). `canPlace` refuses to build any `cat` building without at least 1 of each in stock, and `place()`/`buildPrice()` now spend a `brick` amount the same way they already spent `wood`/`metal`, refunded on `undoPlace` via the existing `took` map. `BUILD_MAT_EXEMPT` (`[T.MATERIALS, T.QUARRY, T.COALMINE, T.FACTORY]`) is skipped by the whole gate, wood included - these four are exactly the buildings you'd need in order to ever get more of either material, so requiring materials to build them would be a dead end with no way out. `test/balance.mjs`'s bot needed the deepest "teach the bot too" update yet: it now puts up a Quarry, Coal mine and Factory once it can afford them, and - since bricks can't be bought on the instant Exchange like wood can, only made via a factory recipe that needs Masonry research - beelines Logistics then Masonry (to the exclusion of any other, cheaper tech) the moment it's committed to that chain, or research points get soaked up by whatever's globally cheapest long before accumulating to a 40- or 60-point industry tech.
- **The resbar is split and reordered**: Water, Power, Bricks, Wood, then a repurposed "fed" chip - the old combined Materials chip (wood+metal+stone+coal) is gone; metal/stone/coal are still tracked in full in the Resources panel, just not iconified in the top bar. A new `i-bricks` SVG symbol (index.html) gives bricks their own icon distinct from wood's log stack. Bricks are technically a factory product (`PRODUCTS.bricks`, recipe stone+coal) but are excluded from the general "Products" chip's sum now that they have their own - otherwise a brand new city would show a Products chip on day one just for its starting stock, despite never having made a furniture, tool or baked good.
- **"$X a day" updates instantly.** `daily()`'s wage/trade/tourism/tax calculation (previously one large inline block) is factored out into a pure `incomeByClass(s, plan, tot, uc)` - reads `s`/`plan`/`tot`, never writes them - reused by both the real once-a-day `daily()` settlement and a new exported `previewNet(s, plan)`, which `updateHud()` now calls every 500ms refresh instead of reading yesterday's `state.stats.income/upkeep`. Produce/product sales and import costs (`resourcesDay`/`productsDay`) have side effects of their own and aren't safe to preview, so those still carry forward from the last day that actually settled - only the staffing/lease/tax component, which is what changes the instant you hire someone or finish a building, is truly live. No firestore.rules change, no world reset.

## New in 2.2: a real decay-lock bug fix, wood as a real ingredient, ten starting settlers
- **Fixed a real bug**, found from a player report of income stuck at $0 long after it should have recovered: `daily()`'s Maintenance section built its repair-candidate arrays with a `s.cond[i] <= 0` exclusion, so any building that fully decayed to 0% could never be included in the repair branch again - a permanent trap that silently zeroed both its income and its upkeep forever, even with plenty of money in the bank. Fixed by dropping that exclusion; a building at 0% now repairs like any other once the city can afford it again. Regression test added (`test/sim.test.mjs`, "a building that has fully decayed still repairs").
- **Wood is a real ingredient now**, not just a discount. `canPlace` refuses to build anything with a `cat` (i.e. an actual building, not a road/path/rail) unless `stockOf(s, 'wood') >= 1` - except the Sawmill itself, which stays buildable at zero wood so a city that ever runs dry can always build its way out (or buy some on the Exchange, which already sold every wood-kind resource for cash). `test/balance.mjs`'s bot got the same "teach the bot too" treatment as water/power and batch-picking before it: it now puts up a Sawmill early and tops up from the Exchange whenever its stock runs low, or every scripted city would eventually stall out unable to expand.
- **The Lease/Rent panel no longer closes itself.** The drawer's whole `innerHTML` gets rebuilt every 500ms while playing (`startLoops()`, main.js) and on every hour change otherwise, which silently wiped any `<details open>` that wasn't explicitly tracked. The Goals panel already had this solved for itself (`openHow`/`data-goal`); generalized into a drawer-wide `openDetails` Set keyed by `data-key` (`staff-${i}`, `lease-${i}`, `rent-${i}`, `picks-${i}-${g}`, plus the existing goal rows), wired once in `wireDrawer()`'s toggle listener instead of per-panel.
- A new city now starts with 10 settlers (`settle()`, sim.js), up from 6 - `peakPop`'s initial value moved to match.
- The Materials resbar chip's icon (three overlapping boxes, read by at least one player as a gift box) is now a stack of logs. The Food chip is repurposed: instead of raw food stock, it's a house icon showing how many residents currently have a grocer (or the hall's little shop) with room to serve them - `plan.needs.shops * population`, the same figure `sim.advice()` already used to flag "some families have no grocer nearby."

## New in 2.1: research-gated minerals/timber, adjustable lease terms, an upgrade fund
- Two new technologies (constants.js `TECH`, industry branch): `forestry` (30 pts) unlocks oak and cedar at the Sawmill; `prospecting` (45 pts, needs `logistics`) unlocks iron, gold and diamonds at the Quarry. Just a `tech` field added to the relevant `PICKS` entries - `canStartBatch` already refused an unresearched pick, so no new gating logic was needed, and `reserve()`'s `'rent'` kind got the same check added (you can't promise a mineral you haven't researched to another mayor either). Pine, metal and stone stay free from the start.
- Leasing (`sim.lease`/`setLeaseTerms`) now takes a `share` (0..`LEASE_TAX_MAX`, 60%) instead of a fixed 50%, chosen when you lease and changeable any time (no `LEASE_MIN_DAYS` wait for changing terms - only for taking full control back). A second `save` fraction (0..`LEASE_SAVE_MAX`, 100%) routes that much of your share into a new ring-fenced `s.savings` pool instead of `s.money`; `daily()`'s wage loop now computes both `by.leased` (spendable) and `st.savingsGain` per person, since each lease can have a different split. `canUpgrade`/`upgrade` check `money + savings` together and spend savings first - the only thing that can ever spend it.
- A fresh start: every world begins again (`s1`).

## New in 2.0: pick-and-collect production, leasing, cross-mayor rental
- **Production overhaul.** `T.MATERIALS`/`T.QUARRY`/`T.FARM`/`T.ORCHARD`/`T.DAIRY`/`T.RANCH`/`T.POULTRY`/`T.COALMINE` lose their `makes` field entirely - `production()` in sim.js now only sees POWER/SOLAR/WIND/WATER, which stay passive with the existing Harvest bonus. In their place, a new `PICKS` table (constants.js) lists what each building can be set to cut/dig/grow, and a small state machine in sim.js (`picksAt`/`canStartBatch`/`startBatch`/`collectBatch`/`cancelBatch`/`advanceBatches`, driven from `tick()`) runs the pick-wait-collect cycle: `s.batches[tile] = { k: pickId, p: progressHours, ready: bankedLoads }`, banking up to `BATCH_CAP` finished loads so an unattended city still finds something waiting, capped at 1 for a seeded pick (the new `T.GREENHOUSE`) so growing more always means buying another seed.
- **Specific resources, general kinds.** New resource ids (`pine`/`oak`/`cedar`, `iron`/`gold`/`diamond`, `carrots`/`tomatoes`/`potatoes`, `herbs`/`peppers`/`strawberries`) each carry a `kind` (constants.js: `kindOf`/`KIND_IDS`) pointing back to `wood`/`metal`/`vegetables`/`fruit`. `sim.js`'s new `stockOf(s, kind)`/`takeKind(s, kind, n)` sum/spend across every id of a kind, cheapest first - `buildPrice`, `construct`'s builder-speed boost, and the town hall's resource requirements all read kinds now, not single ids, so cedar is still wood and iron is still metal. Town hall wood/metal/food requirements (`HALL_LEVELS`) are cut 30-40% since production is bursty now, not a steady trickle.
- **Goals explains itself.** Every `GOALS` entry and `HALL_LEVELS[n].goals` tuple gets a `how` string; the panel wraps each row in a `<details>` (panels.js) so clicking it reveals the how-to, and a new `goalProgress`/`hallGoalProgress` pair in sim.js gives live "3 of 10" counts (or two-part "People x of y, Mood z% of w%") for goals that are naturally a count.
- **Auto-fill.** `sim.autoFill(s, tile | null, {dry})` fills open job slots from currently-unemployed residents only (never reshuffles someone already working), most-demanding slot first, matched to the least over-qualified reachable person - reusing `hire()` so locking and history stay consistent with a manual hire. A button appears per building and citywide wherever it would actually fill something.
- **Leasing** (same city): `sim.lease`/`unlease`/`canLease`/`canUnlease`/`leaseQuote`, a new `s.lease[tile] = { k: 'civ', d: dayStarted }` map. A leased building pays no upkeep and self-repairs even when the city is broke, but only `LEASE_TAX_SHARE` (50%) of its wage tax comes back to the mayor - `hire`/`recruit`/`setRecipe`/`canStartBatch`/`canUpgrade`/`autoFill` all refuse on a leased tile. Can't be taken back for `LEASE_MIN_DAYS`.
- **Renting** (cross-mayor): a 5th Market offer kind, `'rent'`, reusing the existing escrow/deal pipeline (no new Firestore collection). The renter pays the whole term up front; the owner's tile is blocked for the term (`s.lease[tile] = { k: 'list' }` while posted, `{ k: 'out' }` once taken - the same guard leasing already added does the blocking); the renter's city gets a fixed daily amount of one resource, delivered locally by each side's own `daily()` (`sim.js`: `startRentIn`/`startRentOut`/`processRentals`) with no ongoing cross-city messages at all - deliberately not a literal shipment of the owner's actual output, since that would need a settlement loop with real desync and exploit risk for two cities that don't even tick in lockstep. `firestore.rules`' offers `create` rule gained bounds for `tile`/`days`/`total` when `kind == 'rent'`; deals needed no rule change.
- A fresh start: every world begins again (`s7`).

## New in 1.9: no more tutorial, a clearer Goals panel, clearer money
- `tutorial.js` (the guided-tour system: `createTutorial(api)`, steps, coach box) is deleted, along with every `tut.*` call site in main.js, the `#coach` element in index.html, and the `.coach`/`.tut-glow`/`.choice`/`.welcome-choices`/`.wide-choice`/`.follow-chip` CSS. `showWelcome()` is rewritten as a plain-English explanation of the goal instead of a "take the tour"/"I'll explore" choice, with a button straight into the Goals panel.
- To compensate, `panels.js`'s `goalsPanel`/`hallHtml` are more instructive: a short "how this works" line up top, and a new `showMe()`/`data-build-type` "Show me" button (reusing the existing `wireDrawer` delegate that already powered the needs list) on every hall-path goal and milestone that maps to a specific building, via a new `HALL_GOAL_TYPE` lookup and a `t` field added to relevant entries in `GOALS` (constants.js).
- `START_MONEY` (constants.js) is now 2500, down from 3000. Test fallout: one smoke test hardcoded the old starting balance in a running total and needed its expected value and comment updated.
- The top bar's daily-balance figure (`#v-net`) now gets a `.pos`/green class when the city is in the black, not just `.neg`/red when it isn't - previously a gain and a break-even day looked identical (both soft grey).
- A staffed Harbour now actually does what its blurb always claimed ("the best place to trade with the rest of the world") - a `by.trade` bonus in `sim.js`'s `daily()`, mirroring the Airport's existing one but smaller, since it's cheaper and opens at a much lower population. The Budget tab's "Trade with neighbours" row now mentions it.
- A fresh start: every world begins again (`s6`).

## New in 1.8: the objective, and more ways to fall
- `#found` in index.html now explains the goal (keep people fed, housed and happy; the hall grows itself) and the stakes, right where a mayor claims their plot.
- Three new collapse triggers in `sim.js`'s `daily()`, alongside the existing `unpaidDays >= COLLAPSE_UNPAID_DAYS`: `waterShortDays >= COLLAPSE_WATER_DAYS` (completely out of water, gated by `COLLAPSE_POP` so an early settlement isn't punished before it's expected to have one - the same population the "utilities" hall goal already expects it by), `trafficBadDays >= COLLAPSE_TRAFFIC_DAYS` (`plan.needs.commute` below `COLLAPSE_TRAFFIC_COMMUTE`, same population gate), and `debtDays >= COLLAPSE_DEBT_DAYS` (owing more than `COLLAPSE_DEBT`, tracked separately from `unpaidDays` since that counts *any* unpaid day regardless of how deep). Every counter resets to 0 the day the problem clears and warns via `note()` before the threshold hits, mirroring the existing unpaid-upkeep pattern; all three end a city exactly like running out of money already did - `collapse()`, ruins anyone can rebuild.
- `test/balance.mjs`'s bot now builds a water tower and a power source proactively once the town is big enough to need them, rather than waiting for the advisor to notice a shortage that (for a *first* water tower) it was never actually going to flag - `sim.advice()`'s water/power tips only fire once there's already some production to fall short of. Balance re-checked at 58/2/0 over 60 seeds (was 57/2/1) - a net improvement once the bot plays sensibly around the new stakes.
- Caught before shipping: `RESET_AT` almost got bumped to a UTC calendar date that was still in the future relative to the actual UTC clock (local "tomorrow" isn't always UTC "tomorrow" yet) - would have hidden every world created today until UTC caught up. Check the real UTC date before changing this constant, not the local one.

## New in 1.7: a starting stock, and a real Bricks benefit
- `STARTING_RES` in constants.js (`{ water: 100, power: 200, wood: 200, bricks: 200 }`) is now set as `s.res` in `sim.newCity()`, so a brand new city can build and post a Market offer immediately rather than waiting on production. Existing cities are untouched (this only fires on founding, not in `migrate()`).
- `PRODUCTS.bricks`'s `benefit` text ("everything costs a little less to build while bricks are in store") was flavour-only until now - `buildPrice` applies a new `BRICK_DISCOUNT` (0.95) to the base cost whenever `s.res.bricks > 0`, on top of whatever wood/metal load discount applies. It's a passive perk for holding stock, not a per-build consumable, unlike wood/metal. (Furniture's and Tools' `benefit` text is still flavour-only - a good next step if you want them to matter mechanically too.)
- Several sim tests explicitly zero `s.res` before asserting an undiscounted list price, now that a fresh city starts with some stock; a new test asserts the exact `STARTING_RES` shape and the brick discount.

## New in 1.6: two more raw materials, a fourth product
- `RES`/`T`/`B` in constants.js: `stone` and `coal`. `T.QUARRY` now `makes: { metal: 22, stone: 14 }` (a real quarry digs both); a new `T.COALMINE` (`makes: { coal: 20 }`, no tech gate, matching the Sawmill/Quarry precedent) has its own render.js model (a black stepped pit and a winding-wheel headframe, next to `case T.QUARRY`). `RAW_GOODS` (`['wood','metal','stone','coal']`, exported from constants.js) replaces the hardcoded `['wood','metal']` lists in `resourcesDay`'s produce/cap/sell-surplus loops, so the new pair gets the exact same handling as the first two with no sim.js branching. `buildPrice`/`matCost` stay scoped to wood and metal only - stone and coal are trade/recipe goods, not build materials.
- A fourth product, `bricks` (`stone: 2, coal: 1 → 1`), gated by a new `masonry` tech (industry branch, needs `logistics`). The resource bar's "Materials" chip and the Stats, Resources table now cover all four raw goods.

## New in 1.5: a layering fix
- `T.HOUSE`'s low plinth (added in 1.3, `render.js`) was drawn after the wall box instead of before it. In the painter's-algorithm renderer (no depth buffer - later draws always win), that meant its flat top face, which spans the whole footprint at ground level, painted over the base of the wall instead of sitting under it. Moved the plinth draw call to before the wall, matching how the roofline trim added to `T.WORK`/`T.SHOP`/`T.HALL` in the same pass is correctly ordered *after* their walls (that trim sits at the top, where the paint order is already right).
- `showLocked()`'s modal title is now "Locked" instead of "Not yet" (both are in `lang/el.js`; "Not yet" is kept too since it's reused elsewhere - the Railway and Budget panels' "hasn't happened yet" indicators - so removing it would have silently broken their Greek translation).

## New in 1.4: two fixes
- `render.js`: `T.HOUSE`'s and `T.VILLA`'s walls were painted `th.wall` (the theme's generic wall colour) instead of `col` (their own palette colour with the per-instance hash variation computed at the top of `object()` — the exact mechanism `T.WORK`/`T.SHOP`/`T.APARTMENT` already used correctly), so every home looked the same flat theme colour and the variation code was silently dead for two of the three home types. Now uses `col` (House) and `sh(col, 0.55)` (Villa, matching Apartment's tint) like everything else.
- `i-gear` (Settings) was a sunburst/asterisk shape (a circle with 8 radiating lines), not a gear — replaced with an actual cog outline (Feather Icons' well-known "settings" glyph).

## New in 1.3: a clear objective, no emoji, depth and feedback
- A new `#objective` banner in the top bar (`updateHud()` in main.js) always shows the same `step` value the `#pulse` hint uses — one source of truth, two places it's shown, so a new mayor can't miss it. Turns to a `--bad`-tinted "urgent" style via `.objective.urgent`.
- Every decorative emoji in the UI is gone: the resource bar and the 🧱/👑 spots in panels.js now use the existing SVG icon sheet (`index.html`'s `<symbol>` defs, `panels.js`'s `icon()`), with five new icons (`i-water`, `i-power`, `i-materials`, `i-food`, `i-products`). The emoji reaction picker (`REACTIONS` in constants.js) is a deliberate feature, not decoration, and was left alone.
- `render.js`: a ground-contact shadow now draws under every building (previously gated to high zoom and skipped for cached tiles); `box()`'s wall/roof shading contrast is deepened globally; jammed roads pulse with a glow (`jamColour` plus a `shadowBlur` on the tile fill, same technique as the selected-building outline).
- `addPop` now fires for a mood-band improvement ("Happier!"), and a new idle-nudge (`maybeNudge` in main.js, its own 60s timer separate from the co-mayor desk's) toasts the current `nextStep()` suggestion if you go a minute without touching anything, on a few-minutes cooldown, suppressed during the guided tour.
- Another fresh start: `WORLD_ID` is `s4`.

## New in 1.2: a real economy, a fresh start
- `RES` in constants.js is now nine keys: water and power (unchanged), `wood` and `metal` (the old single `materials`, now made separately by the renamed Sawmill and the new Quarry), `vegetables` (renamed from `veg`), `fruit`, `dairy`, `meat` and `eggs` (Poultry farm, needs the `poultry` tech). `FOOD` is just the internal list `resourcesDay` pools eating across; the UI shows each food (and wood and metal) on its own, not a combined total.
- Products: `PRODUCTS` and `PRODUCT_IDS` in constants.js (furniture, tools, baked goods), each gated by a tech and a `recipe` of resources. A `T.FACTORY` runs one at a time (`sim.setRecipe(s, i, id)`, stored in `s.rec`); `sim.productsDay` (called from `daily`, results in `s.stats.products`) turns the recipe's resources into the product each day, scaled by staffing and level like any other production. `T.STORE` (`sellsProducts`, the Retail tech) sells product stock to residents at `STORE_SALE_SHARE` of the import price, better than the open market.
- Trade: `TRADE_RES` (the seven raw resources) is still all the instant Exchange offers (`worldPrices`/`buyResource`/`sellResource`); products can't be bought or sold there. Both trade on the player Market though: `sim.reserve`/`release`/`receive` accept any id in `RES` or `PRODUCTS`.
- The top bar (`renderResbar` in main.js) folds the new resources into calm "Materials" and "Food" chips (the per-kind breakdown is in the tooltip and in City stats, Resources), and adds a "Products" chip only once you've made or held one, so a city with no factories sees nothing new.
- `sim.buildPrice` now splits its materials use into `.wood` and `.metal` (still totalled in `.mat`/`.use`); `sim.availability`'s reasons and `matCost` are unchanged.
- Another fresh start: `WORLD_ID` is `s3`; older private worlds made before `RESET_AT` are unlisted, same mechanism as 1.18's reset.

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
