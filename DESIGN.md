# Truxman Motors — MVP Design

## Purpose and scope

Build a high-trust, mobile-first public showroom for Truxman Motors, Ridgeways / Kiambu Road, Nairobi. Help buyers find an available vehicle, inspect its details, enquire, and request a viewing. Give staff a small secure workspace to maintain listings and sold status.

This document covers **Public Website & Search Foundation only**. The supplied proposal is background context, not an instruction to build the full platform. Financing workflows, invoices, brokers, costing, owner dashboards, automated WhatsApp ingestion, advanced analytics, and multi-business management are outside this MVP. Lead delivery to the business system is an integration boundary, not a full CRM build.

## Brand direction

Quiet confidence: warm backgrounds, burgundy actions, clear typography, honest vehicle photography, and generous spacing. Avoid busy dealership graphics, autoplay video, exaggerated promises, and decorative stock imagery. Vehicle photos and facts carry the experience.

| Token | Value | Use |
| --- | --- | --- |
| Brand burgundy | `#800020` | Primary buttons, links, logo, active states |
| Warm cream | `#F3E6D5` | Supporting sections and subtle surfaces |
| Ivory | `#FFF9F2` | Main page background |
| Rose | `#D45060` | Small decorative accents; not body text or primary buttons |
| Ink | `#241C20` | Headings and body text |
| Muted ink | `#65565C` | Secondary information |
| Border | `#DDCEC6` | Dividers and input outlines |

The first four colours come from the user's palette. Verify contrast for every final text/background pair; target WCAG AA. Never communicate availability or errors by colour alone.

### Logo

Use `assets/brand/truxman-motors-logo.png`: a minimal burgundy car outline and the TRUXMAN MOTORS wordmark on ivory. Keep clear space at least the height of “MOTORS” around the lockup. Keep proportions intact. Do not stretch, add shadows, or recolour individual parts. A production SVG, transparent version, monochrome inverse, and favicon can be derived after approval of the generated concept; the ivory-background PNG is the current deliverable.

### Typography and layout

Use a locally hosted sans-serif such as Inter, with a system sans-serif fallback. Body: 16px minimum, line height 1.5–1.65. Desktop headings: 40–56px; mobile: 30–36px. Prices: 24–28px and bold. Use an 8px spacing rhythm, 12px card radii, and restrained borders rather than heavy shadows.

Content maximum width: 1200px. Mobile gutters: 16px; desktop: 24–40px. Inventory uses one column on narrow phones, two where card width remains readable, and three on desktop. Avoid horizontal overflow at 320px. Controls have at least 44px touch targets and visible keyboard focus.

## Information architecture

| Route | Purpose |
| --- | --- |
| `/` | Introduce showroom, featured stock, trust facts, location and enquiry routes |
| `/vehicles` | Search and filter current inventory |
| `/vehicles/[slug]` | Photos, price, specifications, availability and enquiry/viewing actions |
| `/about` | Verified business story and buying experience |
| `/contact` | Confirmed contact details, opening hours, directions and general enquiry |
| `/privacy` | Explain collection, use and retention of enquiry information |
| `/admin` | Staff sign-in and vehicle management; excluded from search indexing |

## Public experience

### Home

Header: logo, Vehicles, About, Contact, and a “Browse cars” action. Mobile navigation must be compact and accessible. Hero: “Find your next car with Truxman Motors.” Supporting copy names the Nairobi location without unsupported claims. Place “Browse vehicles” first and “Contact showroom” second. Use a real supplied vehicle image, or a clean text-led hero until photos arrive.

Below: featured available vehicles, a short explanation of how to enquire and visit, confirmed business details, and location/directions. Show warranties, inspection promises, testimonials, financing partners or badges only if the business supplies verifiable content and authorizes their use.

### Vehicle inventory

Search make/model; filters for price, year, fuel, transmission and location. Start with the most useful filters visible and place the rest in an accessible mobile filter panel. Sort by newest, price ascending and price descending. Preserve filters in the URL. Display result count, “Clear filters”, and a helpful empty state.

Cards show a consistent 4:3 real photo, make/model, year, KES price, mileage in km, fuel type, transmission, location and textual availability. The card leads to its details page. Do not hide prices behind enquiry or invent missing specifications. Prevent sold stock appearing as available.

### Vehicle detail

Order: breadcrumb, photo gallery, title/year, price, availability, key specifications, short description, exact yard location, and actions. Support keyboard-operable gallery controls, useful image alt text and a fallback when images fail. Avoid an autoplay carousel.

Primary action: “Enquire about this car”. Secondary: “Book a viewing”. On mobile, use a compact sticky action bar that does not cover content or the focused field. Sold vehicles keep an informative page with a clear “Sold” notice and “Browse available vehicles”; disable viewing requests for sold vehicles. Do not imply a purchase or reservation.

### Enquiry and viewing forms

Enquiry fields: name, phone, optional email, message and linked vehicle when relevant. Viewing requests add preferred date and time. Explain that the requested slot needs staff confirmation; this MVP does not offer live scheduling. Use Nairobi local time and reject past requests.

Present a short privacy notice linked to `/privacy`. Keep optional marketing permission separate and unchecked if ever introduced. Labels remain visible; errors appear beside fields; submitted data remains on recoverable errors. Phone entry accepts local and international formats with server validation.

Show success only after the lead is saved durably: “Your enquiry has been received. Our team will contact you.” For viewing requests, add “Your preferred time will be confirmed by our team.” Prevent repeated taps and preserve an idempotency key on retries. If delivery to the business system is pending, do not claim a confirmed appointment.

Phone and WhatsApp links may be secondary contact channels using verified numbers. Clicking these links is not equivalent to recording a lead; forms provide guaranteed lead capture.

## Staff experience

Simple authenticated inventory list with search, status filters, last-updated time and actions to add, edit, preview, publish, unpublish and mark sold. Create listings as drafts. Require all public specification fields, price, location and at least one photo before publishing.

Editor sections: vehicle identity, specifications, price/location, description, photos and publication/availability. Support photo upload, ordering and cover selection. Warn on unsaved changes. Confirm marking sold; permit an audited correction. Clearly distinguish draft visibility from available/reserved/sold status. Staff can access a minimal captured-enquiry fallback inbox if the upstream business system is unavailable; it is not a CRM pipeline.

## Search, trust and performance

Use server-rendered public content, distinct page titles/descriptions, stable vehicle URLs, canonical URLs, an XML sitemap and robots rules. Index useful vehicle details; avoid indexing arbitrary filter combinations. Add appropriate business and vehicle/product structured data matching visible facts, without promising rich results.

Prepare a consistent business name, address, phone, hours, category and photo set for Google Business Profile. Profile claiming and verification require the business owner's participation; readiness is not a guarantee of verification or ranking.

Use responsive compressed images, explicit image dimensions and lazy loading below the fold. Prioritize only the first visible image. Minimize scripts and font weights. Targets at the 75th percentile on mobile: LCP ≤2.5s, INP ≤200ms and CLS ≤0.1; measure real users after launch, with lab checks before launch.

## Acceptance and handover

- All required listing facts remain readable on mobile; filters and forms work with keyboard and touch.
- Each accepted enquiry/viewing request is stored with its vehicle and source and can reach the business system.
- Staff can publish a vehicle, reorder photos, edit price and mark sold without developer help.
- Sold state updates the detail page and removes the vehicle from available results.
- No fabricated reviews, specifications, partnerships, contact numbers or availability.
- Domain, TLS, hosting, SEO foundations, staff training and a short maintenance guide are delivered for the agreed first project period.

Confirm before implementation: logo approval, authentic photos, business contact details, hours, yard locations, upstream integration access, and the exact hosting/domain coverage and renewal date. The proposal describes first-year renewals separately; record the final agreement rather than assume an indefinite subscription.
