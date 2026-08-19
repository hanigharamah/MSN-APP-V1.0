# Running MSN on Windows

There are two ways through this. Pick one.

- **[Let Claude do it](#let-claude-do-it)** — you paste one block of text into
  Claude Code and it installs the toolchain, sets the environment variables,
  creates an emulator and builds the app. Recommended.
- **[Do it yourself](#doing-it-yourself)** — the same steps, by hand. Also the
  place to look when something in the automated path fails.

Either way, read the two short sections below first. They apply to both.

---

## What you can and cannot run

| | |
|---|---|
| **Android emulator** | Yes — this is the path below |
| **A real Android phone** | Yes, over USB |
| **iOS** | No. Building for iPhone needs macOS and Xcode. |
| **Web** (`npm run web`) | Starts, but camera, the Stripe payment sheet and secure storage all behave differently or not at all in a browser. Not a reliable way to evaluate the app. |

**This has never been built or run on Android before.** The native project
generates cleanly and every dependency is cross-platform, so there is no known
blocker — but you are the first person to compile it, and first compiles
surface things nobody has seen.

## Before you start: this talks to the live shared database

The app points at a shared Supabase project. Bookings you make, messages you
send and attendees you check in are **written to the same database the rest of
the team is looking at**. It is all demo and test data, and payments run on
Stripe **test** keys so no real money moves — but it is not your own private
copy.

You will be sent two values separately, for a file called `.env`:

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

They are not in this document and not in the repository. Have them to hand
before you start. **Do not commit that file** — it is already in `.gitignore`,
so the only way it ends up published is if someone forces it.

---

# Let Claude do it

You need **Claude Code** installed and working in a terminal
(https://claude.com/claude-code). Open it in whatever folder you want the
project to live in — ideally something with a short path like `C:\dev`.

Then paste this, exactly as it is:

---

> I have a React Native / Expo project to set up on Windows and I would like you
> to do it. Please work through this and stop to ask me only when you genuinely
> cannot proceed.
>
> **The goal:** clone the repo, install whatever Android tooling is missing, and
> get the app running on an Android emulator.
>
> **The repo:** `https://github.com/hanigharamah/MSN-APP-V1.0.git`
> Clone it into the current folder. The app itself is in the `app` subfolder —
> that is where `package.json` and `app.config.ts` live, and where every command
> below should run.
>
> **Steps:**
>
> 1. Check what is already installed: `node -v`, `git --version`, `adb --version`,
>    and whether `%LOCALAPPDATA%\Android\Sdk` exists. Only install what is
>    missing.
> 2. Install anything missing with winget:
>    - Node LTS — `winget install -e --id OpenJS.NodeJS.LTS`
>    - Git — `winget install -e --id Git.Git`
>    - Android Studio — `winget install -e --id Google.AndroidStudio`
>      (this is a large download and brings the SDK and a bundled JDK)
> 3. Set user environment variables with `setx` — no admin rights needed, but a
>    NEW terminal is required afterwards for them to take effect:
>    - `ANDROID_HOME` to `%LOCALAPPDATA%\Android\Sdk`
>    - `JAVA_HOME` to Android Studio's bundled JDK, normally
>      `C:\Program Files\Android\Android Studio\jbr`
>    - add `%ANDROID_HOME%\platform-tools` and `%ANDROID_HOME%\emulator` to `Path`
> 4. Accept the SDK licences and install the packages, using `sdkmanager` from
>    the SDK's `cmdline-tools\latest\bin`:
>    `platform-tools`, `emulator`, `platforms;android-35`,
>    `system-images;android-35;google_apis;x86_64`
> 5. Create and start an emulator with `avdmanager` and `emulator`. A Pixel-class
>    device on API 35 is fine. Confirm it is up with `adb devices` before moving
>    on — an emulator that is still booting looks identical to one that failed.
> 6. In the `app` folder: copy `.env.example` to `.env`, then **stop and ask me
>    for the two Supabase values.** They are secret, they are not in the repo,
>    and you cannot guess them. Wait for me before continuing.
> 7. `npm install`
> 8. `npx expo run:android` — the first build downloads Gradle and compiles the
>    native project. Expect 10–20 minutes. Do not assume a long silence is a
>    hang.
> 9. When it launches, take a screenshot with
>    `adb exec-out screencap -p > screen.png` and show me, so we can both see it
>    actually rendered rather than just compiled.
>
> **Things to know, so you do not go wrong:**
>
> - **Do not run `expo prebuild`.** The `app/android` folder is committed on
>   purpose. Prebuild deletes and regenerates it, and you would lose the working
>   native project for no reason.
> - **Do not commit anything.** Especially not `.env`. If you need to change a
>   tracked file, tell me first.
> - The app writes to a **shared live database**. It is demo data, but other
>   people are looking at it, so do not bulk-create or bulk-delete records to
>   test something.
> - If a build fails, read the actual Gradle error before changing anything.
>   The common Windows causes are a path that is too long, `JAVA_HOME` unset, or
>   a terminal opened before `setx` ran.
> - `npm run typecheck` and `npm run lint` should both be silent. If they are
>   not, that is a real problem in the code, not a Windows one — tell me rather
>   than trying to fix it.

---

That is the whole thing. Claude will stop and ask you for the two Supabase
values at step 6; everything else it can do on its own.

**What it cannot do for you:** if Windows throws a UAC elevation prompt during
the Android Studio install, you have to click it. Claude cannot.

---

# Doing it yourself

The same thing by hand. Also the reference when the automated path breaks.

## 1. Install the prerequisites

**Node 20 or newer** — https://nodejs.org (take the LTS installer). Check with
`node -v`.

**Android Studio** — https://developer.android.com/studio. The installer
bundles the JDK and the Android SDK. Keep the default components and make sure
these are ticked:

- Android SDK
- Android SDK Platform
- Android Virtual Device

**Environment variables.** *Settings → System → About → Advanced system
settings → Environment Variables*, under your user variables:

| Variable | Value |
|---|---|
| `ANDROID_HOME` | `C:\Users\<your-name>\AppData\Local\Android\Sdk` |
| `JAVA_HOME` | `C:\Program Files\Android\Android Studio\jbr` |

Then edit `Path` and add:

```
%ANDROID_HOME%\platform-tools
%ANDROID_HOME%\emulator
```

Close and reopen your terminal, then check `adb --version`.

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

Open `.env` and fill in the two Supabase values you were sent. Leave everything
else blank — the Stripe publishable key is fetched from the server at runtime,
and the bundle id has a default.

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
terminal. If it persists, create `app\android\local.properties` containing:
`sdk.dir=C\:\\Users\\<your-name>\\AppData\\Local\\Android\\Sdk`

**`JAVA_HOME is not set`**
Point it at the JDK bundled with Android Studio, normally
`C:\Program Files\Android\Android Studio\jbr`.

**Build fails with path or filename errors**
The project is nested too deep. Move it to `C:\dev\msn`. You can also enable
long paths: run PowerShell as administrator and execute
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
and what is not. Trust it over anything else, including this file.

## Checking your work

```
cd MSN-APP-V1.0\app
npm run typecheck
npm run lint
```

Both should be silent. If they are not, that is a real problem in the code, not
a Windows one.
