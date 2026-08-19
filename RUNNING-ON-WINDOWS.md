# Running MSN on Windows

Everything a developer on a PC needs to get the app running. Written for
someone who has never seen this project.

## What you can and cannot run

| | |
|---|---|
| **Android emulator** | Yes — this is the path below |
| **A real Android phone** | Yes, over USB |
| **iOS** | No. Building for iPhone needs macOS and Xcode. |
| **Web** (`npm run web`) | Starts, but several features depend on native modules (camera, Stripe payment sheet, secure storage) that behave differently or not at all in a browser. Not a reliable way to evaluate the app. |

**This has never been built or run on Android before.** The project generates
cleanly and every dependency is cross-platform, so there is no known blocker —
but you will be the first person to compile it, and first compiles surface
things nobody has seen.

## Before you start: this talks to the live shared database

The app points at a shared Supabase project. Bookings you make, messages you
send and attendees you check in are **written to the same database the rest of
the team is looking at**. It is all demo and test data, but it is not your own
private copy. Nothing you can do in the app is destructive, and payments run on
Stripe **test** keys — no real money moves.

---

## 1. Install the prerequisites

**Node 20 or newer** — https://nodejs.org (take the LTS installer).
Check it worked:

```
node -v
```

**Android Studio** — https://developer.android.com/studio
The installer bundles the JDK and the Android SDK. In the setup wizard, keep
the default components and make sure these are ticked:

- Android SDK
- Android SDK Platform
- Android Virtual Device

**Environment variables.** Open *Settings → System → About → Advanced system
settings → Environment Variables* and add, under your user variables:

| Variable | Value |
|---|---|
| `ANDROID_HOME` | `C:\Users\<your-name>\AppData\Local\Android\Sdk` |

Then edit `Path` and add two entries:

```
%ANDROID_HOME%\platform-tools
%ANDROID_HOME%\emulator
```

Close and reopen your terminal, then check:

```
adb --version
```

## 2. Get the code

```
git clone https://github.com/hanigharamah/MSN-APP-V1.0.git
```

Clone it somewhere with a **short path** — `C:\dev\msn` is ideal. Windows has a
260-character path limit and Node projects nest deeply; cloning into
`Downloads\...\...` is the single most common cause of confusing build
failures.

The repo does not contain `node_modules` (you generate it) or `ios/` (4.7 GB of
build artefacts, and unusable on Windows anyway). `app/android/` **is**
included, so the native project is ready to build.

## 3. Create your environment file

The clone gives you a folder called `MSN-APP-V1.0`. The app itself lives in
`app` inside it:

```
cd MSN-APP-V1.0\app
copy .env.example .env
```

Open `.env` and fill in the two Supabase values. **They will be sent to you
separately** — they are not in this document and not in the repository.

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

Leave everything else blank. The Stripe publishable key is fetched from the
server at runtime, so you do not need it here, and the bundle id has a default.

## 4. Install and run

From that same `MSN-APP-V1.0\app` folder:

```
npm install
npx expo run:android
```

The first run downloads Gradle and compiles the native project. **Expect 10–20
minutes** and a lot of output. Later runs take seconds.

If no emulator is running, start one first: Android Studio → **Device Manager**
→ **Create Device** → Pixel 8 → a recent API level → Finish → press play.

The `app/android/` folder is committed, so you do **not** need to run
`expo prebuild` — clone, install, run.

If you ever do run `npx expo prebuild --platform android`, be aware it
**deletes and regenerates** that folder. You only need it if something native
changes in `app.config.ts` — a permission, the package id, an icon.

---

## Troubleshooting

**`SDK location not found`**
`ANDROID_HOME` is not set, or the terminal predates you setting it. Reopen the
terminal. If it persists, create `android\local.properties` containing:
`sdk.dir=C\:\\Users\\<your-name>\\AppData\\Local\\Android\\Sdk`

**`JAVA_HOME is not set`**
Point it at the JDK bundled with Android Studio, typically
`C:\Program Files\Android\Android Studio\jbr`.

**Build fails with path or filename errors**
The project is nested too deep. Move it to `C:\dev\msn-app`. You can also
enable long paths: run PowerShell as administrator and execute
`New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force`

**`No connected devices`**
Run `adb devices`. If it is empty, the emulator is not running, or a physical
phone does not have USB debugging enabled (Settings → About phone → tap Build
number seven times → Developer options → USB debugging).

**Metro says the port is in use**
`npx expo run:android --port 8082`

**The app builds but shows a red screen about the development server**
The bundler is not reachable. Leave the terminal running, and on a physical
device run `adb reverse tcp:8081 tcp:8081`.

---

## Known gaps, so you do not go hunting

- **Push notifications are not built** on either platform. Notifications appear
  in the app's own bell, but nothing is delivered to the device.
- **Apple in-app purchase is iOS-only.** On Android every payment routes to
  Stripe. Whether Google Play's billing rules apply to one-to-many online
  events has not been checked — treat that as an open question, not a decision.
- **Photo upload** compiles but the upload round trip has never been watched
  complete.
- **Landscape has never been reviewed.** Orientation was recently unlocked for
  accessibility reasons; nothing sets a fixed width, so layouts should reflow,
  but no one has looked.

`FEATURES.md` in the repo root is the current, maintained list of what is built
and what is not. Trust it over anything else.

## Checking your work

```
cd MSN-APP-V1.0\app
npm run typecheck
npm run lint
```

Both should be silent. If they are not, that is a real problem, not a Windows
one.
