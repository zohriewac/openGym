# TODO

Open work for the modded app + server (fork: github.com/zohriewac/openGym, branch `ios-widgets`).
Deploy: server `gymserver` (ssh alias), `~/opengym`, `git pull && docker compose up -d --build`.

- [ ] **Widgets show no values.** iOS WidgetKit widgets render empty. Snapshot is written by
      `OpenGym/Sources/OpenGym/WidgetBridge.swift` to app group `group.com.zohriewac.opengym`
      (key `snapshot`) and read in `OpenGym/Sources/OpenGymWidget/OpenGymWidget.swift`.
      Check: app group entitlement on both targets, that the web side actually calls the bridge,
      and that the widget timeline reloads after a write. Bundle ID changed
      on 2026-10-16 — reinstall and re-add the widget.
      Code path audited and hardened (da13bf8c). **Likely real cause:** xtool does not grant App
      Groups on free Apple IDs (`DeveloperServicesCapability(.appGroups, isFree: false)`, open PR
      xtool-org/xtool#284), so app and widget each get private storage. Also see xtool#313 (widget
      .appex dead-stripped). Next: check `FileManager.containerURL(forSecurityApplicationGroupIdentifier:)`
      on device; if nil → paid account, or xtool with #284, or a non-group sharing path.
- [ ] **Rep wheel picker with haptics** — in progress (scroll-snap number wheel on the reps cell,
      native `haptic` bridge on iOS).
- [ ] **AI coach breaks when the phone is locked/closed.** Requests die when the app is
      backgrounded. Move to server-side handling: the server runs the coach job to completion and
      caches the result, the client re-fetches it on resume instead of holding the request open.
      Start in `api/coach/jobs.js` / `api/coach/routes.js` and `frontend/src/lib/coach-api.js`.
- [ ] **Dashboard: cleaner, more professional look.** Home dashboard (`frontend/src/views/Home.jsx`,
      `components/Ring.jsx`, `components/WeekGrid.jsx`, `lib/dashboard.js`).
- [ ] **Failing frontend tests on `ios-widgets`** (Node 22, `cd frontend && npm test`; Node 26
      breaks happy-dom's localStorage, use 22):
      `views/AdminCoach.test.jsx` (5 daily-cap tests), `views/CoachSetup.test.jsx`
      ("the categories module carries no catalogue"), `lib/workout-at.test.js`
      ("no source file dates a workout by hand").
