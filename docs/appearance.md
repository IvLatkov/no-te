# Appearance and theme switching

The supplied Dusty Blue & Cream `style.css` is a one-page template. Its palette,
surface, typography, corner, shadow and theme-toggle styles are adapted in
`src/theme.css`; existing feature styles and application layouts remain in place.
The sidebar uses the template's hero-band colours instead of adding a marketing
hero to the dashboard. Cream/slate remain the dominant canvas, dusty blue supports
navigation and surfaces, and cobalt is reserved for primary actions and links.
Error, warning and success feedback keep separate accessible semantic colours.
Custom artwork and user-defined tag colours are preserved.

Open **Settings → Appearance → Dark mode**. The accessible switch selects dark or
light mode. Until a choice is saved, the theme follows the device, including live
device changes. An explicit choice takes precedence and is shared across tabs.
The preference is browser-wide, independent of accounts, and stored only under
`no-te.appearance`. It does not alter projects, notes, backups or authentication.
Storage failures leave the switch usable for the current visit and display a
notice rather than falsely claiming the preference was saved.

`public/theme-init.js` applies the preference to the document before the app paints;
the React provider keeps the document, native control colour scheme and browser
theme-colour metadata synchronized afterward. Keep its key and allowed values in
sync with `src/theme/preferences.js`. The script reads only the appearance key.

Dark mode uses the supplied slate `#0F172A`, card surface `#1A2438`, deeper dusty-blue
hero/sidebar `#43596E`, cream headings and muted-blue body text. Links use the
requested lifted blue `#A8C3D9` (~9.8:1 on slate; calculated as 9.75:1). Primary
buttons use the template's `#7E9BC4` with slate labels to retain AA contrast. Light
mode keeps white labels on cobalt. Both palettes have contrast regression tests.

The template's Work Sans and Zodiak font stacks are used with their supplied local
fallbacks (Helvetica/Arial and Iowan/Georgia). No font files were supplied, so no
external font requests or additional dependencies were introduced.

Focused verification:

```powershell
node --test tests/theme-ui.test.js tests/theme-contrast.test.js tests/sidebar-responsive.test.js
npm run lint
npm test
npm run build
```

UI tests cover switching, focus/state semantics, navigation, remounting, account
changes, system preference, tab synchronization, storage denial and pre-paint
initialization. Existing responsive navigation checks cover 375, 768, 984, 1024
and 1440px. These use jsdom and do not replace visual review in a real browser.
