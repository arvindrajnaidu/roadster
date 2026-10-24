# Roadster

A 2D game where you fly a Tesla Roadster with cold-gas thrusters: lift off the launch pad, cross the range and land softly on the green pad. Built with Next.js (static export) and wrapped with Capacitor for iOS and Android, the same setup as Birthday Scroll.

## Play

```bash
npm install
npm run dev
```

Open http://localhost:3000.

| Input | Effect |
|---|---|
| `←` / `A` or the left thumb pad | Left thruster: lifts the tail, pushes the car right |
| `→` / `D` or the right thumb pad | Right thruster: lifts the nose, pushes the car left |
| `↑` / `W` / `Space` or both pads | Both thrusters: straight up |
| `R` | Restart the test |

Only both thrusters together can lift the car off the ground.

### Modes and scoring

- **Normal**: forgiving touchdowns (under 5.5 m/s down, 3.5 m/s drift, 18° tilt).
- **Challenge**: the original prototype limits (under 3 m/s down, 2 m/s drift, 10° tilt).

Every landing on the target pad is scored out of 10 against the current mode's limits: vertical speed counts most, then drift and tilt, then distance from the pad centre.

## Code

- `lib/game/sim.ts`: flight physics and landing rules. No DOM, no framework; tested headless.
- `lib/game/engine.ts`: canvas rendering, HUD, input, sound.
- `components/RoadsterGame.tsx`: mounts the engine in the page.
- `tests/autopilot.test.ts`: an autopilot flies every level in both modes; plus touchdown rule checks. Run with `npm test`.

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
