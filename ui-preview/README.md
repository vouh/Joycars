# Running UI preview

This isolated Next.js / TypeScript project contains the verified showroom UI. It uses dependencies installed in the parent JoyCars workspace and keeps preview builds separate from backend work being added there.

From `C:\PROJECTS\JoyCars`:

```powershell
node node_modules/next/dist/bin/next build ui-preview
node node_modules/next/dist/bin/next start ui-preview --hostname 127.0.0.1 --port 3001
```

For development:

```powershell
node node_modules/next/dist/bin/next dev ui-preview --hostname 127.0.0.1 --port 3001
```

Preview URL: http://127.0.0.1:3001

Validation: production build and TypeScript checks passed; SUV filtering, viewing dialog, local demo submission and inventory reset checked in browser; narrow mobile viewport showed no horizontal overflow.

`app/page.tsx` and `app/globals.css` are copies of the main app's files; keep them in sync. This app has no API routes, so the page falls back to labelled sample vehicles shaped like the live API data (see `docs/DATA_MODEL.md`) and saves enquiries only in the browser. Sample images are exact regions of the supplied screenshot, rendered with CSS cropping; original high-resolution assets are still required for production.
