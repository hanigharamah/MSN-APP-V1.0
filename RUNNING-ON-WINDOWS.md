# Running MSN on Windows

You are not going to set this up by hand. Hand it to a coding agent — **Claude
Code** or **Codex** — and let it do the work. This file is mostly one block of
text you paste in.

## Before you start

**The agent has to be running on your PC, with permission to run shell
commands.** It is going to install Android Studio, set environment variables
and compile a native project. A browser-based assistant cannot touch your
machine and cannot do any of this.

- **Claude Code** — https://claude.com/claude-code
- **Codex** — use the CLI, running locally. Check its current Windows support
  before you start; if it needs WSL, install the Android tooling on the Windows
  side and be aware that the emulator and the build will not see each other
  across the WSL boundary without extra work. Claude Code is the smoother path
  on Windows today.

**Have these two values to hand.** They are sent to you separately — not in
this document, not in the repository:

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

The agent will stop and ask for them. It cannot guess them and should not try.

**Open the agent in a folder with a short path** — `C:\dev` is ideal. Windows
has a 260-character path limit, Node projects nest deeply, and starting in
`Downloads\...\...` is the single most common cause of confusing build
failures.

---

## Paste this

Everything below the line, exactly as it is. It works for either agent.

---

> I have a React Native / Expo project to set up on Windows and I would like you
> to do it end to end. Work through this and stop to ask me only when you
> genuinely cannot proceed.
>
> **Goal:** clone the repo, install whatever Android tooling is missing, and get
> the app running on an Android emulator.
>
> **Repo:** `https://github.com/hanigharamah/MSN-APP-V1.0.git`
> Clone into the current folder. The app is in the `app` subfolder — that is
> where `package.json` and `app.config.ts` live, and where every command below
> should run.
>
> ### Steps
>
> 1. Check what already exists before installing anything: `node -v`,
>    `git --version`, `adb --version`, and whether `%LOCALAPPDATA%\Android\Sdk`
>    is there.
> 2. Install only what is missing, with winget:
>    - `winget install -e --id OpenJS.NodeJS.LTS`
>    - `winget install -e --id Git.Git`
>    - `winget install -e --id Google.AndroidStudio` — large download; brings the
>      SDK and a bundled JDK
> 3. Set user environment variables with `setx`. No admin rights needed, but they
>    only take effect in a NEW terminal, so open one before continuing:
>    - `ANDROID_HOME` → `%LOCALAPPDATA%\Android\Sdk`
>    - `JAVA_HOME` → `C:\Program Files\Android\Android Studio\jbr`
>    - append `%ANDROID_HOME%\platform-tools` and `%ANDROID_HOME%\emulator` to `Path`
> 4. Accept the SDK licences and install packages with `sdkmanager`, found in the
>    SDK's `cmdline-tools\latest\bin`: `platform-tools`, `emulator`,
>    `platforms;android-35`, `system-images;android-35;google_apis;x86_64`
> 5. Create an emulator with `avdmanager` (a Pixel-class device on API 35 is
>    fine) and start it. Confirm with `adb devices` before moving on — an
>    emulator still booting looks identical to one that failed.
> 6. In `app`, copy `.env.example` to `.env`. Then **stop and ask me for the two
>    Supabase values.** They are secret, they are not in the repo, you cannot
>    guess them, and placeholder values will produce a confusing auth error
>    rather than a clear missing-config one. Wait for my reply.
> 7. `npm install`
> 8. `npx expo run:android`
> 9. When it launches, screenshot it with `adb exec-out screencap -p > screen.png`
>    and show me. I want to see it rendered, not just compiled — those are
>    different claims.
>
> ### Do not
>
> - **Do not run `expo prebuild`.** The `app/android` folder is committed on
>   purpose. Prebuild deletes and regenerates it, and you would destroy a working
>   native project for nothing.
> - **Do not commit anything**, above all `.env`. If you need to change a tracked
>   file, ask me first.
> - **Do not treat a long silence as a hang.** The first Gradle build downloads a
>   toolchain and compiles the native project: 10–20 minutes of very little
>   output is normal. Killing it and "fixing" something is how this goes wrong.
> - **Do not bulk-create or bulk-delete records to test.** The app writes to a
>   shared live database that other people are looking at. It is demo data, and
>   payments are on Stripe test keys so no real money moves, but it is not a
>   private copy.
>
> ### If a build fails
>
> Read the actual Gradle error before changing anything. On Windows it is nearly
> always one of these:
>
> - **`SDK location not found`** — `ANDROID_HOME` unset, or the terminal predates
>   `setx`. Open a new terminal. If it persists, write
>   `app\android\local.properties` containing
>   `sdk.dir=C\:\\Users\\<name>\\AppData\\Local\\Android\\Sdk`
> - **`JAVA_HOME is not set`** — point it at Android Studio's bundled JDK.
> - **Path or filename errors** — the project is nested too deep. Move it to
>   `C:\dev`. Long paths can also be enabled from an elevated PowerShell:
>   `New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force`
> - **`No connected devices`** — run `adb devices`. Empty means the emulator is
>   not running, or a physical phone has not had USB debugging enabled.
> - **Port in use** — `npx expo run:android --port 8082`
> - **Red screen about the development server** — the bundler is unreachable.
>   Keep the terminal running; on a physical device, `adb reverse tcp:8081 tcp:8081`
>
> ### Finally
>
> Run `npm run typecheck` and `npm run lint`. Both should be silent. If they are
> not, that is a problem in the code rather than a Windows one — tell me, do not
> try to fix it.

---

## The one thing the agent cannot do

If Windows raises a UAC elevation prompt while installing Android Studio, you
have to click it yourself. Nothing else needs you except the two Supabase
values.

---

## What you are getting

| | |
|---|---|
| **Android emulator** | Yes — this is what the above sets up |
| **A real Android phone** | Yes, over USB |
| **iOS** | No. Building for iPhone needs macOS and Xcode. |
| **Web** (`npm run web`) | Starts, but camera, the Stripe payment sheet and secure storage behave differently or not at all in a browser. Not a fair way to evaluate the app. |

**This has never been built or run on Android before.** The native project
generates cleanly and every dependency is cross-platform, so there is no known
blocker — but you are the first person to compile it.

## Known gaps, so you do not go hunting

- **Push notifications are not built** on either platform. Notifications appear
  in the app's own bell; nothing is delivered to the device.
- **Apple in-app purchase is iOS-only.** On Android every payment routes to
  Stripe. Whether Google Play's billing rules apply to one-to-many online
  events has not been checked — an open question, not a decision.
- **Photo upload** compiles, but the upload round trip has never been watched
  complete.
- **Landscape has never been reviewed.** Orientation was recently unlocked for
  accessibility reasons; nothing sets a fixed width so layouts should reflow,
  but nobody has looked.

`FEATURES.md` in the repo root is the maintained list of what is built and what
is not. Trust it over anything else, including this file.
