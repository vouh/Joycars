# JoyCars showroom UI

The verified running UI is in `ui-preview/`, isolated from backend files being added concurrently to this workspace. See `ui-preview/README.md` for the build and run commands. Current preview: http://127.0.0.1:3001.

Next.js App Router with TypeScript and React. Run `npm install` and `npm run dev`, then open http://localhost:3000. Use `npm run build` for the production build.

The interface follows the supplied DriveX screenshot: orange accents, dark utility bar, scenic hero, floating search, vehicle cards, promotional banner and dark footer. Images use CSS crops of `public/reference.png` to preserve the exact supplied imagery; resolution is limited by that screenshot. Replace with original licensed high-resolution photos before production.

The homepage uses the public API and the fields in [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md): inventory from `/api/vehicles` (make/model search, fuel, budget, year, transmission, location, sort and pagination, kept in the URL), details from `/api/vehicles/[slug]`, filter options from `/api/search-facets` and `/api/locations`, and enquiry/viewing requests posted to `/api/leads` with an idempotency key. Cards show make, model, year, KES price, mileage, fuel, transmission, location and availability; sold cars cannot take viewing requests.

When no backend is reachable (local development without `DATABASE_URL`, or the standalone `ui-preview` app), the page shows four labelled sample vehicles with the same fields, and form submissions are saved only in the browser. Business details need verification before launch.

The reference's orange styling takes precedence over the earlier burgundy design document for this UI request. The screenshot's logo is represented as a JoyCars header wordmark; the approved burgundy logo remains in `assets/brand`.

## Backend

API, database and admin backend (Next.js route handlers, Prisma, Supabase, Zod): see `BACKEND.md`. Staff sign in at `/admin` to see bookings. Customers who book a viewing get a confirmation email through Resend.
