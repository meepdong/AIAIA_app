# UI preview (proof of concept)

A clickable mock-up of the app's screens, published to GitHub Pages by
`.github/workflows/pages.yml` on every push to `main` that touches `poc/`.

- `boards/` holds the screens as design-canvas boards (one file per screen or menu item).
- `build.mjs` turns them into plain HTML in `dist/` (gitignored): phone screens fill a phone
  browser and sit in a centred column on a computer; the admin console pages are full width and
  collapse their side menu into a scrolling row on a phone.
- Build locally with `node poc/build.mjs`, then open `poc/dist/index.html`.

Every person, number and amount on these screens is a placeholder; nothing is saved anywhere.

**The sign-in is a demo gate, not security.** It checks a phone number and code against a SHA-256
hash in `build.mjs`, in the browser. The repository and the pages are public, so anyone can read the
pages directly. To change the demo login, replace `ACCESS_HASH` with the SHA-256 of
`<10-digit phone>:<6-digit code>`.
