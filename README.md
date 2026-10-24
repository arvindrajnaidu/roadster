# Roadster

A 2D game where you fly a Tesla Roadster with cold-gas thrusters: lift off the launch pad, cross the range and land softly on the green pad. Built with Next.js (static export) and wrapped with Capacitor for iOS and Android, the same setup as Birthday Scroll.

## Play

```bash
npm install
npm run dev
```

Open http://localhost:3000.

There are two control schemes, switchable on the briefing card:

| Simple controls (default) | Pro controls |
|---|---|
| Hold `↑` / `Space` / **Lift** to climb; let go to sink gently | `←` / `A` or left pad: left thruster (lifts the tail, pushes right) |
| `←` `→` / **◀ ▶** to fly left or right at a steady speed | `→` / `D` or right pad: right thruster (lifts the nose, pushes left) |
| With no arrow held, the car brakes its own drift | `↑` / `Space` or both pads: both thrusters, straight up |

Simple controls still fly on the two thrusters: `simplePilot` in `lib/game/sim.ts` works out a throttle for each one. `R` restarts a test.

### Modes and scoring

| Mode | Handling | Touchdown limits |
|---|---|---|
| **Easy** (default) | About half Earth gravity, slow spin, levels itself, more gas | 7 m/s down, 5 m/s drift, 25° |
| **Normal** | Earth gravity, levels itself gently | 5.5 m/s down, 3.5 m/s drift, 18° |
| **Challenge** | Earth gravity, no help (the original prototype) | 3 m/s down, 2 m/s drift, 10° |

Every landing on the target pad is scored out of 10 against the current mode's limits: vertical speed counts most, then drift and tilt, then distance from the pad centre. Best scores are kept per mode.

## Code

- `lib/game/sim.ts`: flight physics and landing rules. No DOM, no framework; tested headless.
- `lib/game/engine.ts`: canvas rendering, HUD, input, sound.
- `components/RoadsterGame.tsx`: mounts the engine in the page.
- `tests/autopilot.test.ts`: autopilots fly every level in every mode with both control schemes, plus touchdown rule checks. Run with `npm test`.

## Native apps

Next builds a static site into `out/`, which Capacitor copies into the native projects.

```bash
npm run ios       # build, sync and open Xcode
npm run android   # build, sync and open Android Studio
```

- Bundle ID: `com.buzzie.roadster`, Apple team `P3F54L5BAH` (Buzzie LLC).
- Icons and splash screens are generated from `assets/` with `npx @capacitor/assets generate`.

### TestFlight

On a Mac with Xcode signed in to the Buzzie LLC team, and with an App Store Connect app record for `com.buzzie.roadster`:

```bash
npm run testflight
```

This runs the tests, builds, archives with a timestamp build number, and uploads to App Store Connect.
