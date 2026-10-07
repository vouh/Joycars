'use client';
import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { ArrowRight, BadgeDollarSign, CalendarDays, CarFront, Check, ChevronDown, Clock, Cog, Facebook, Fuel, Gauge, Headphones, Instagram, Mail, MapPin, Menu, Phone, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';

type FuelType = 'petrol' | 'diesel' | 'hybrid' | 'plug_in_hybrid' | 'electric' | 'other';
type Transmission = 'automatic' | 'manual';
type Availability = 'available' | 'reserved' | 'sold';
type PublicImage = { url: string; alt: string; width: number; height: number };
type Crop = { x: number; y: number; w: number; h: number };
type PublicLocation = { id: string; name: string; address: string; phone: string | null; hours: string | null; latitude: number | null; longitude: number | null };
/** Public vehicle card from GET /api/vehicles (lib/services/vehicle-dto.ts). `crop` exists only on preview sample data. */
type VehicleCard = { id: string; slug: string; title: string; make: string; model: string; year: number; price: { amount: number; currency: string }; mileageKm: number; fuelType: FuelType; transmission: Transmission; availability: Availability; location: { id: string; name: string } | null; coverImage: PublicImage | null; publishedAt: string | null; updatedAt: string; crop?: Crop };
type VehicleDetail = Omit<VehicleCard, 'location'> & { description: string; soldAt: string | null; images: PublicImage[]; location: PublicLocation | null; actions: { enquire: boolean; requestViewing: boolean } };
type SearchResult = { items: VehicleCard[]; page: number; pageSize: number; total: number; totalPages: number };
type Facets = { makes: { make: string; count: number }[]; price: { min: number | null; max: number | null }; year: { min: number | null; max: number | null } };
/** Mirrors the allowlisted query parameters of GET /api/vehicles (publicSearchSchema). */
type Filters = { q: string; fuel: string; transmission: string; maxPrice: string; minYear: string; location: string; sort: string; page: string };
type Source = 'loading' | 'live' | 'sample' | 'error';
type Modal = { kind: 'vehicle' | 'enquiry' | 'viewing' | 'about'; vehicle?: VehicleCard } | null;
type Fetched<T> = { ok: true; data: T } | { ok: false; status: number; message?: string; fields?: Record<string, string> };

const FUEL_LABELS: Record<FuelType, string> = { petrol: 'Petrol', diesel: 'Diesel', hybrid: 'Hybrid', plug_in_hybrid: 'Plug-in hybrid', electric: 'Electric', other: 'Other' };
const TRANSMISSION_LABELS: Record<Transmission, string> = { automatic: 'Automatic', manual: 'Manual' };
const AVAILABILITY_LABELS: Record<Availability, string> = { available: 'Available', reserved: 'Reserved', sold: 'Sold' };
const SORTS = [['newest', 'Newest'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low']] as const;
const BUDGETS = [['2000000', 'Under KES 2M'], ['4000000', 'Under KES 4M'], ['6000000', 'Under KES 6M']] as const;
const EMPTY_FILTERS: Filters = { q: '', fuel: '', transmission: '', maxPrice: '', minYear: '', location: '', sort: 'newest', page: '1' };
const FILTER_KEYS = Object.keys(EMPTY_FILTERS) as (keyof Filters)[];
const isWhole = (v: string) => /^\d{1,10}$/.test(v);
const VALID_FILTER: Record<keyof Filters, (v: string) => boolean> = {
  q: () => true,
  fuel: v => v in FUEL_LABELS,
  transmission: v => v in TRANSMISSION_LABELS,
  maxPrice: isWhole,
  minYear: isWhole,
  location: v => /^[0-9a-f-]{36}$/i.test(v),
  sort: v => SORTS.some(([s]) => s === v),
  page: isWhole,
};
const UTM_FIELDS = { utm_source: 'utmSource', utm_medium: 'utmMedium', utm_campaign: 'utmCampaign', utm_content: 'utmContent', utm_term: 'utmTerm' } as const;
const PAGE_SIZE = 12;
const VIEWING_MIN_LEAD_MS = 30 * 60 * 1000;
const VIEWING_MAX_AHEAD_MS = 90 * 86_400_000;
// Africa/Nairobi is UTC+3 with no daylight saving time.
const nairobiLocal = (ms: number) => new Date(ms + 3 * 60 * 60 * 1000).toISOString().slice(0, 16);

const SAMPLE_LOCATION: PublicLocation = { id: '00000000-0000-4000-8000-0000000000a1', name: 'Ridgeways showroom', address: 'Kiambu Road, Ridgeways, Nairobi', phone: null, hours: null, latitude: null, longitude: null };
function sampleVehicle(n: number, v: Pick<VehicleCard, 'make' | 'model' | 'year' | 'mileageKm' | 'fuelType' | 'availability' | 'crop'> & { priceKes: number }): VehicleCard {
  const { priceKes, ...fields } = v;
  return { ...fields, id: `00000000-0000-4000-8000-00000000000${n}`, slug: `${v.year}-${v.make}-${v.model}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'), title: `${v.year} ${v.make} ${v.model}`, price: { amount: priceKes, currency: 'KES' }, transmission: 'automatic', location: { id: SAMPLE_LOCATION.id, name: SAMPLE_LOCATION.name }, coverImage: null, publishedAt: `2026-10-0${n}T09:00:00.000Z`, updatedAt: `2026-10-0${n}T09:00:00.000Z` };
}
const SAMPLE_VEHICLES: VehicleCard[] = [
  sampleVehicle(1, { make: 'Toyota', model: 'Corolla', year: 2018, priceKes: 1850000, mileageKm: 62000, fuelType: 'petrol', availability: 'available', crop: { x: 60, y: 387, w: 109, h: 77 } }),
  sampleVehicle(2, { make: 'Hyundai', model: 'Tucson', year: 2019, priceKes: 2950000, mileageKm: 48000, fuelType: 'petrol', availability: 'available', crop: { x: 176, y: 387, w: 110, h: 77 } }),
  sampleVehicle(3, { make: 'BMW', model: '5 Series', year: 2018, priceKes: 4250000, mileageKm: 54000, fuelType: 'diesel', availability: 'available', crop: { x: 293, y: 387, w: 109, h: 77 } }),
  sampleVehicle(4, { make: 'Ford', model: 'Mustang', year: 2020, priceKes: 5600000, mileageKm: 31000, fuelType: 'petrol', availability: 'reserved', crop: { x: 410, y: 387, w: 109, h: 77 } }),
];

/** Same rules as lib/services/public-inventory.ts, applied to the sample stock. */
function searchSamples(f: Filters): SearchResult {
  const terms = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  const items = SAMPLE_VEHICLES.filter(v => v.availability !== 'sold'
    && terms.every(t => v.make.toLowerCase().includes(t) || v.model.toLowerCase().includes(t))
    && (!f.maxPrice || v.price.amount <= Number(f.maxPrice))
    && (!f.minYear || v.year >= Number(f.minYear))
    && (!f.fuel || v.fuelType === f.fuel)
    && (!f.transmission || v.transmission === f.transmission)
    && (!f.location || v.location?.id === f.location));
  items.sort((a, b) => (f.sort === 'price_asc' ? a.price.amount - b.price.amount : f.sort === 'price_desc' ? b.price.amount - a.price.amount : (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')) || a.id.localeCompare(b.id));
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const page = Math.min(Number(f.page) || 1, totalPages);
  return { items: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), page, pageSize: PAGE_SIZE, total: items.length, totalPages };
}
function sampleFacets(): Facets {
  const listable = SAMPLE_VEHICLES.filter(v => v.availability !== 'sold');
  const prices = listable.map(v => v.price.amount), years = listable.map(v => v.year);
  const makes = [...new Set(listable.map(v => v.make))].sort().map(make => ({ make, count: listable.filter(v => v.make === make).length }));
  return { makes, price: { min: Math.min(...prices), max: Math.max(...prices) }, year: { min: Math.min(...years), max: Math.max(...years) } };
}
function sampleDetail(v: VehicleCard): VehicleDetail {
  return { ...v, description: 'Sample listing for the UI preview. Staff add the real description before a car is published.', soldAt: null, images: [], location: SAMPLE_LOCATION, actions: { enquire: true, requestViewing: v.availability !== 'sold' } };
}

function readFilters(): Filters {
  const params = new URLSearchParams(window.location.search);
  const filters = { ...EMPTY_FILTERS };
  for (const key of FILTER_KEYS) {
    const value = params.get(key)?.trim().slice(0, 80);
    if (value && VALID_FILTER[key](value)) filters[key] = value;
  }
  return filters;
}
function toQuery(f: Filters) {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) if (f[key] && f[key] !== EMPTY_FILTERS[key]) params.set(key, f[key]);
  return params.toString();
}
async function fetchJson<T>(url: string, init?: RequestInit): Promise<Fetched<T>> {
  try {
    const res = await fetch(url, init);
    const body = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: body as T };
    return { ok: false, status: res.status, message: body?.error?.message, fields: body?.error?.fields };
  } catch {
    return { ok: false, status: 0 };
  }
}
/** Local development without a database, or the standalone ui-preview app: show labelled sample data instead. */
const backendMissing = (status: number) => status === 404 || process.env.NODE_ENV !== 'production';
// crypto.randomUUID needs a secure context; plain-http LAN previews don't have one.
const newIdempotencyKey = () => typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16));

function Photo({ x, y, w, h, className = '', label }: { x: number; y: number; w: number; h: number; className?: string; label: string }) {
  return <div className={`reference-photo ${className}`} role="img" aria-label={label} style={{ '--crop-width': `${592 / w * 100}%`, '--crop-left': `${-x / w * 100}%`, '--crop-top': `${-y / h * 100}%`, '--crop-height': `${802 / h * 100}%` } as CSSProperties}><img src="/reference.png" alt="" aria-hidden="true" draggable="false" /></div>;
}
function VehiclePhoto({ vehicle, className = '' }: { vehicle: VehicleCard; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (vehicle.crop) return <Photo {...vehicle.crop} label={vehicle.title} className={className} />;
  if (vehicle.coverImage && !failed) return <img className={`vehicle-img ${className}`} src={vehicle.coverImage.url} alt={vehicle.coverImage.alt} width={vehicle.coverImage.width} height={vehicle.coverImage.height} loading="lazy" onError={() => setFailed(true)} />;
  return <div className={`photo-fallback ${className}`} role="img" aria-label={`${vehicle.title}: photo not available`}><CarFront /></div>;
}
function Logo() { return <a className="logo" href="#home" aria-label="JoyCars home"><span className="logo-icon"><Gauge size={48} strokeWidth={1.6} /><CarFront size={21} /></span><span><strong>Joy<span>Cars</span></strong><small>YOUR NEXT JOURNEY</small></span></a>; }
const money = (n: number) => new Intl.NumberFormat('en-KE').format(n);
const km = (n: number) => `${money(n)} km`;
const specLine = (v: Pick<VehicleCard, 'year' | 'mileageKm' | 'fuelType' | 'transmission'>) => `${v.year} · ${km(v.mileageKm)} · ${FUEL_LABELS[v.fuelType]} · ${TRANSMISSION_LABELS[v.transmission]}`;

export default function Home() {
  const [source, setSource] = useState<Source>('loading');
  const [locations, setLocations] = useState<PublicLocation[]>([]);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [resultsError, setResultsError] = useState('');
  const [attribution, setAttribution] = useState<Partial<Record<(typeof UTM_FIELDS)[keyof typeof UTM_FIELDS], string>>>({});
  const [modal, setModal] = useState<Modal>(null);
  const [detail, setDetail] = useState<VehicleDetail | null>(null);
  const [detailFailed, setDetailFailed] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [sent, setSent] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    const initial = readFilters();
    setDraft(initial);
    setApplied(initial);
    const params = new URLSearchParams(window.location.search);
    const utm: typeof attribution = {};
    for (const [param, field] of Object.entries(UTM_FIELDS)) {
      const value = params.get(param)?.trim().slice(0, 100);
      if (value) utm[field] = value;
    }
    setAttribution(utm);
    (async () => {
      const load = () => Promise.all([fetchJson<{ items: PublicLocation[] }>('/api/locations'), fetchJson<Facets>('/api/search-facets')]);
      let [loc, fac] = await load();
      // One retry, so a single failed request (e.g. a dev server recompiling) doesn't switch the page to sample data.
      if (!loc.ok || !fac.ok) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        [loc, fac] = await load();
      }
      const failure = !loc.ok ? loc : !fac.ok ? fac : null;
      if (!failure && loc.ok && fac.ok) {
        setLocations(loc.data.items);
        setFacets(fac.data);
        setSource('live');
      } else if (failure && backendMissing(failure.status)) {
        setLocations([SAMPLE_LOCATION]);
        setFacets(sampleFacets());
        setSource('sample');
      } else {
        setSource('error');
      }
    })();
  }, []);

  useEffect(() => {
    if (source === 'loading' || source === 'error') return;
    const query = toQuery(applied);
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    if (source === 'sample') { setResult(searchSamples(applied)); return; }
    let cancelled = false;
    setLoadingResults(true);
    setResultsError('');
    fetchJson<SearchResult>(`/api/vehicles?${query}`).then(r => {
      if (cancelled) return;
      setLoadingResults(false);
      if (r.ok) setResult(r.data);
      else { setResult(null); setResultsError(r.message ?? 'We could not load vehicles right now. Please try again.'); }
    });
    return () => { cancelled = true; };
  }, [source, applied]);

  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('.modal');
    const controls = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not([tabindex="-1"]), textarea, select, a[href]') || []);
    controls()[0]?.focus();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModal(null);
      if (event.key === 'Tab') {
        const items = controls(), first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); document.body.style.overflow = oldOverflow; previous?.focus(); };
  }, [modal, sent]);

  const showroom = locations[0];
  const hasFilters = FILTER_KEYS.some(k => k !== 'page' && k !== 'sort' && applied[k]);
  const years = facets?.year.min && facets.year.max ? Array.from({ length: facets.year.max - facets.year.min + 1 }, (_, i) => facets.year.max! - i) : [];
  const scrollToVehicles = () => document.getElementById('vehicles')?.scrollIntoView({ behavior: 'smooth' });
  function applyNow(patch: Partial<Filters>) {
    const next = { ...draft, ...patch, page: patch.page ?? '1' };
    setDraft(next);
    setApplied(next);
  }
  function clearFilters() { setDraft(EMPTY_FILTERS); setApplied(EMPTY_FILTERS); }
  function search(e: FormEvent) { e.preventDefault(); setApplied({ ...draft, page: '1' }); scrollToVehicles(); }

  function open(next: Exclude<Modal, null>) {
    setSent(null); setFieldErrors({}); setFormError(''); setSubmitting(false); setMobileMenu(false);
    if (next.kind === 'enquiry' || next.kind === 'viewing') setIdempotencyKey(newIdempotencyKey());
    if (next.kind === 'vehicle' && next.vehicle) loadDetail(next.vehicle);
    setModal(next);
  }
  async function loadDetail(v: VehicleCard) {
    setDetail(null);
    setDetailFailed(false);
    if (source === 'sample') { setDetail(sampleDetail(v)); return; }
    const r = await fetchJson<{ vehicle: VehicleDetail }>(`/api/vehicles/${encodeURIComponent(v.slug)}`);
    if (r.ok) setDetail(r.data.vehicle); else setDetailFailed(true);
  }

  async function submitLead(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!modal || submitting) return;
    const form = new FormData(e.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '').trim() || undefined;
    const viewing = modal.kind === 'viewing';
    const payload = {
      idempotencyKey,
      type: viewing ? 'viewing' : 'enquiry',
      vehicleId: modal.vehicle?.id,
      name: text('name'),
      phone: text('phone'),
      email: text('email'),
      message: text('message'),
      preferredViewingTime: viewing ? text('preferredViewingTime') : undefined,
      website: text('website'),
      ...attribution,
    };
    setFieldErrors({});
    setFormError('');
    setSubmitting(true);
    // Always try the real endpoint: showing sample cars must never stop a genuine enquiry from being sent.
    const r = await fetchJson<{ message: string }>('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    setSubmitting(false);
    if (r.ok) { setSent({ title: viewing ? 'Viewing request received' : 'Enquiry received', message: r.data.message }); return; }
    if (source === 'sample' && r.status === 404) {
      try {
        const { website: _honeypot, ...lead } = payload;
        const saved = JSON.parse(localStorage.getItem('joycars-demo-enquiries') || '[]');
        localStorage.setItem('joycars-demo-enquiries', JSON.stringify([...saved, { ...lead, createdAt: new Date().toISOString() }]));
        setSent({ title: 'Demo request saved', message: 'Your request was saved in this browser only. This preview is not connected to the showroom, so nobody will contact you and no viewing is confirmed.' });
      } catch {
        setFormError('Your browser could not save this demo request. Please try again.');
      }
      return;
    }
    setFieldErrors(r.fields ?? {});
    setFormError(r.message ?? 'We could not send your request. Please try again, or call the showroom.');
  }

  const field = (name: string) => ({ name, id: `lead-${name}`, 'aria-invalid': fieldErrors[name] ? true : undefined, 'aria-describedby': fieldErrors[name] ? `lead-${name}-error` : undefined });
  const errorFor = (name: string) => fieldErrors[name] && <span className="field-error" id={`lead-${name}-error`}>{fieldErrors[name]}</span>;

  function vehicleModal(card: VehicleCard) {
    const shown = detail?.id === card.id ? detail : null;
    const availability = shown?.availability ?? card.availability;
    const canView = availability !== 'sold' && (shown?.actions.requestViewing ?? true);
    return <>
      <VehiclePhoto vehicle={card} className="modal-photo" />
      <p className="eyebrow">{specLine(shown ?? card)}</p>
      <h2 id="modal-title">{card.make} {card.model}</h2>
      <p className="modal-price">KES {money((shown ?? card).price.amount)}</p>
      <p className="availability-note"><span className={`availability ${availability}`}>{AVAILABILITY_LABELS[availability]}</span>{availability === 'reserved' && ' · You can still enquire. A viewing needs availability confirmation from our team.'}{availability === 'sold' && ' · This car has been sold.'}</p>
      {shown ? <>
        {shown.description && <p>{shown.description}</p>}
        {shown.location && <p className="detail-location"><MapPin /><span>{shown.location.name}, {shown.location.address}{shown.location.hours && ` · ${shown.location.hours}`}</span></p>}
      </> : <p className="form-note">{detailFailed ? 'Full details could not be loaded. You can still enquire about this car.' : 'Loading details…'}</p>}
      <div className="modal-actions">
        <button className="button" onClick={() => open({ kind: 'enquiry', vehicle: card })}>Enquire about this car</button>
        <button className="button button-secondary" disabled={!canView} onClick={() => open({ kind: 'viewing', vehicle: card })}>Book a viewing</button>
      </div>
      {!canView && <p className="form-note">Viewing requests are closed for sold cars. <button className="text-link" onClick={() => { setModal(null); clearFilters(); scrollToVehicles(); }}>Browse available vehicles</button></p>}
    </>;
  }

  function leadForm(kind: 'enquiry' | 'viewing', vehicle?: VehicleCard) {
    const viewing = kind === 'viewing';
    const now = Date.now();
    return <>
      {vehicle && <p className="eyebrow">{vehicle.title} · KES {money(vehicle.price.amount)}</p>}
      <h2 id="modal-title">{viewing ? 'Book a viewing' : vehicle ? 'Enquire about this car' : 'Let’s talk about your next car'}</h2>
      <p className="form-description">{viewing ? 'Choose your preferred date and time. This is a request, not a confirmed booking: our team will confirm it with you.' : 'Leave your details and our team will contact you.'}</p>
      {viewing && vehicle?.availability === 'reserved' && <p className="info-note">This car is currently reserved, so we will confirm it is still available before your viewing.</p>}
      {!vehicle && showroom && <p className="form-note">{showroom.name}, {showroom.address}{showroom.phone && ` · ${showroom.phone}`}{showroom.hours && ` · ${showroom.hours}`}</p>}
      <form className="enquiry-form" onSubmit={submitLead}>
        <label htmlFor="lead-name">Your name<input {...field('name')} required minLength={2} maxLength={120} autoComplete="name" placeholder="Full name" />{errorFor('name')}</label>
        <label htmlFor="lead-phone">Phone number<input {...field('phone')} type="tel" required maxLength={32} autoComplete="tel" placeholder="e.g. 0712 345 678 or +254 712 345 678" />{errorFor('phone')}</label>
        <label htmlFor="lead-email">Email {viewing ? <span className="optional">(we will email you a confirmation)</span> : <span className="optional">(optional, for a copy of your enquiry)</span>}<input {...field('email')} type="email" required={viewing} maxLength={254} autoComplete="email" placeholder="you@example.com" />{errorFor('email')}</label>
        {viewing && <label htmlFor="lead-preferredViewingTime">Preferred date and time <span className="optional">(Nairobi time)</span><input {...field('preferredViewingTime')} type="datetime-local" required min={nairobiLocal(now + VIEWING_MIN_LEAD_MS)} max={nairobiLocal(now + VIEWING_MAX_AHEAD_MS)} />{errorFor('preferredViewingTime')}</label>}
        <label htmlFor="lead-message">Message <span className="optional">(optional)</span><textarea {...field('message')} rows={3} maxLength={2000} placeholder="What would you like to know?" />{errorFor('message')}</label>
        <div className="hp" aria-hidden="true"><label>Leave this field empty<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
        <p className="form-note">We use these details only to respond to your request.{source === 'sample' && ' Demo only: your details stay in this browser and are not sent to the showroom.'}</p>
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <button className="button" type="submit" disabled={submitting}>{submitting ? 'Sending…' : viewing ? 'Request viewing' : 'Send enquiry'}<ArrowRight size={17} /></button>
      </form>
    </>;
  }

  const statusText = source === 'loading' || loadingResults ? 'Loading vehicles…' : result ? `${result.total} vehicle${result.total === 1 ? '' : 's'} found` : '';
  const page = result?.page ?? 1;

  return <main id="home" className="site-shell">
    <div className="topbar"><div><Headphones /> <span>Customer-first support</span></div><div><ShieldCheck /><span>Transparent pricing</span></div><div><BadgeDollarSign /><span>Find your perfect car</span></div><div className="top-location"><MapPin /><span>Nairobi, Kenya</span><span className="currency">Prices in KES</span></div></div>
    <header><Logo /><button className="menu-toggle" aria-label="Toggle navigation" onClick={() => setMobileMenu(!mobileMenu)}>{mobileMenu ? <X /> : <Menu />}</button><nav className={mobileMenu ? 'open' : ''}><a className="active" href="#home" onClick={() => setMobileMenu(false)}>Home</a><a href="#vehicles" onClick={() => setMobileMenu(false)}>Vehicles</a><a href="#contact" onClick={() => setMobileMenu(false)}>Locations</a><a href="#deals" onClick={() => setMobileMenu(false)}>Deals</a><a href="#benefits" onClick={() => setMobileMenu(false)}>Services</a><button onClick={() => open({ kind: 'about' })}>About us</button><button onClick={() => open({ kind: 'enquiry' })}>Contact us</button></nav><button className="button header-cta" onClick={() => open({ kind: 'viewing' })}>Book a viewing</button></header>
    <section className="hero"><Photo x={34} y={74} w={514} h={201} label="Dark BMW on a scenic road beside a lake and mountains" /><div className="hero-shade" /><div className="hero-content"><p>Find The Perfect Car</p><h1>For Every <span>Journey</span></h1><p className="hero-description">Explore our wide range of vehicles and enjoy the<br className="desktop-break" /> freedom to travel your way.</p><a className="button" href="#vehicles">Find your ride <ArrowRight size={18} /></a></div></section>
    <section className="search-wrap" aria-label="Find a vehicle">
      <div className="search-tabs">{([['', 'All vehicles', CarFront], ['automatic', 'Automatic', SlidersHorizontal], ['manual', 'Manual', Cog]] as const).map(([value, name, Icon]) => <button className={applied.transmission === value ? 'selected' : ''} aria-pressed={applied.transmission === value} key={name} onClick={() => applyNow({ transmission: value })}><Icon size={18} />{name}</button>)}</div>
      <form className="search-panel" onSubmit={search}>
        <label><span>Make or model</span><div><input value={draft.q} maxLength={80} list="search-makes" onChange={e => setDraft({ ...draft, q: e.target.value })} placeholder="e.g. Toyota Corolla" /><CarFront /></div></label>
        <label><span>Fuel type</span><div><select value={draft.fuel} onChange={e => setDraft({ ...draft, fuel: e.target.value })}><option value="">Any fuel</option>{Object.entries(FUEL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown /></div></label>
        <label><span>Your budget</span><div><select value={draft.maxPrice} onChange={e => setDraft({ ...draft, maxPrice: e.target.value })}><option value="">Any budget</option>{BUDGETS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown /></div></label>
        <label><span>Location</span><div><select value={draft.location} disabled={!locations.length} onChange={e => setDraft({ ...draft, location: e.target.value })}><option value="">{locations.length ? 'All locations' : 'Nairobi'}</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select><MapPin /></div></label>
        <button className="button" type="submit">Search cars</button>
        <datalist id="search-makes">{facets?.makes.map(m => <option key={m.make} value={m.make} />)}</datalist>
      </form>
    </section>
    <section id="benefits" className="benefits">{[{ icon: BadgeDollarSign, title: 'Best Price Confidence', text: 'Clear prices. A better way to find your next car.' }, { icon: CalendarDays, title: 'Easy Viewings', text: 'Choose a preferred time to see your favourite car.' }, { icon: CarFront, title: 'Wide Selection', text: 'Choose from a wide range of vehicles.' }, { icon: Headphones, title: 'Personal Support', text: 'A friendly team to help you along the way.' }].map(({ icon: Icon, title, text }) => <div className="benefit" key={title}><Icon /><div><h3>{title}</h3><p>{text}</p></div></div>)}</section>
    <section id="vehicles" className="inventory content">
      <div className="section-heading"><div><p className="eyebrow">Available vehicles</p><h2>Choose Your Perfect Car</h2></div>{hasFilters && <button className="text-button" onClick={clearFilters}>Clear filters <X size={15} /></button>}</div>
      <div className="inventory-toolbar">
        <p aria-live="polite">{statusText}</p>
        <label>Year from<select value={applied.minYear} onChange={e => applyNow({ minYear: e.target.value })}><option value="">Any year</option>{years.map(y => <option key={y} value={y}>{y}</option>)}</select></label>
        <label>Sort by<select value={applied.sort} onChange={e => applyNow({ sort: e.target.value })}>{SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      {source === 'error' ? <div className="empty"><CarFront size={40} /><h3>Vehicles are temporarily unavailable</h3><p>Please try again shortly, or send us an enquiry and our team will help.</p><button className="button" onClick={() => open({ kind: 'enquiry' })}>Send an enquiry</button></div>
        : resultsError ? <div className="empty"><CarFront size={40} /><h3>Something went wrong</h3><p>{resultsError}</p><button className="button" onClick={clearFilters}>Reset search</button></div>
        : result && result.items.length > 0 ? <div className="vehicle-grid">{result.items.map(v => <article className="vehicle-card" key={v.id}>
          <button className="vehicle-photo-button" aria-label={`View details for ${v.title}`} onClick={() => open({ kind: 'vehicle', vehicle: v })}><VehiclePhoto vehicle={v} /></button>
          <div className="vehicle-info">
            <span className="category"><span className={`availability ${v.availability}`}>{AVAILABILITY_LABELS[v.availability]}</span>{v.location && ` · ${v.location.name}`}</span>
            <button className="vehicle-title" onClick={() => open({ kind: 'vehicle', vehicle: v })}>{v.make} {v.model}</button>
            <div className="specs"><span><CalendarDays />{v.year}</span><span><Gauge />{km(v.mileageKm)}</span><span><SlidersHorizontal />{TRANSMISSION_LABELS[v.transmission]}</span><span><Fuel />{FUEL_LABELS[v.fuelType]}</span></div>
            <div className="vehicle-bottom"><strong><small>{v.price.currency} </small>{money(v.price.amount)}</strong>{v.availability === 'sold' ? <button onClick={() => open({ kind: 'enquiry', vehicle: v })}>Enquire</button> : <button onClick={() => open({ kind: 'viewing', vehicle: v })}>Book viewing</button>}</div>
          </div>
        </article>)}</div>
        : result ? <div className="empty"><CarFront size={40} />{hasFilters ? <><h3>No cars match your search</h3><p>Try a different make, fuel type, year or a larger budget.</p><button className="button" onClick={clearFilters}>Clear filters</button></> : <><h3>No vehicles are listed right now</h3><p>New stock is added regularly. Send us an enquiry and we will let you know.</p><button className="button" onClick={() => open({ kind: 'enquiry' })}>Send an enquiry</button></>}</div>
        : null}
      {result && result.totalPages > 1 && <div className="pagination" role="navigation" aria-label="Vehicle results pages"><button disabled={page <= 1} onClick={() => { applyNow({ page: String(page - 1) }); scrollToVehicles(); }}>Previous</button><span>Page {page} of {result.totalPages}</span><button disabled={page >= result.totalPages} onClick={() => { applyNow({ page: String(page + 1) }); scrollToVehicles(); }}>Next</button></div>}
      {source === 'sample' && <p className="demo-stock">Preview inventory · Sample vehicles are shown until the showroom database is connected.</p>}
    </section>
    <section id="deals" className="promotion content"><Photo x={60} y={534} w={459} h={97} label="Friends enjoying a road trip in a convertible" /><div className="promotion-shade" /><div className="promotion-intro"><h2>Save More on<br />Your Next Adventure</h2><p>A car you love. A price that feels right.<br />Find your next journey here.</p><button className="button" onClick={() => { applyNow({ maxPrice: '2000000' }); scrollToVehicles(); }}>Explore our cars</button></div><div className="promotion-features">{[{ icon: CalendarDays, title: 'Clear Pricing', text: 'See the price before you enquire.' }, { icon: Gauge, title: 'Everyday Freedom', text: 'Find the right car for your next chapter.' }, { icon: ShieldCheck, title: 'View Before You Buy', text: 'Get to know your car in person.' }, { icon: CalendarDays, title: 'Easy Booking', text: 'Request a time in just a few steps.' }].map(({ icon: Icon, title, text }) => <div key={title}><Icon /><h3>{title}</h3><p>{text}</p></div>)}</div></section>
    <footer id="contact"><div className="footer-grid"><div className="footer-brand"><Logo /><p>Your journey, our priority. Find the<br />perfect car and enjoy the road<br />with JoyCars.</p><div className="socials"><button aria-label="Social links information" onClick={() => open({ kind: 'enquiry' })}><Facebook /></button><button aria-label="Instagram information" onClick={() => open({ kind: 'enquiry' })}><Instagram /></button><button aria-label="Email contact" onClick={() => open({ kind: 'enquiry' })}><Mail /></button></div></div><div><h4>Company</h4><button onClick={() => open({ kind: 'about' })}>About Us</button><a href="#vehicles">Our Cars</a><a href="#benefits">Our Services</a><button onClick={() => open({ kind: 'enquiry' })}>Contact Us</button></div><div><h4>Information</h4><button onClick={() => open({ kind: 'about' })}>Buying Guide</button><button onClick={() => open({ kind: 'viewing' })}>Book a Viewing</button><button onClick={() => open({ kind: 'enquiry' })}>Help & Support</button><a href="#vehicles">Available Vehicles</a></div><div><h4>Browse by fuel</h4>{(['petrol', 'diesel', 'hybrid', 'electric'] as const).map(fuel => <button key={fuel} onClick={() => { applyNow({ fuel }); scrollToVehicles(); }}>{FUEL_LABELS[fuel]}</button>)}</div><div><h4>Contact Us</h4><p className="footer-contact"><MapPin />{showroom ? `${showroom.name}, ${showroom.address}` : 'Nairobi, Kenya'}</p>{showroom?.phone && <a className="footer-contact" href={`tel:${showroom.phone.replace(/\s+/g, '')}`}><Phone />{showroom.phone}</a>}<p className="footer-contact"><Clock />{showroom?.hours ?? 'Viewings by appointment'}</p><button className="footer-contact" onClick={() => open({ kind: 'enquiry' })}><Mail />Send an enquiry</button></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} JoyCars. All rights reserved.</span><span>We drive your journey.</span></div></footer>
    {modal && <div className="modal-backdrop" onClick={() => setModal(null)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={e => e.stopPropagation()}>
      <button className="modal-close" aria-label="Close dialog" onClick={() => setModal(null)}><X /></button>
      {sent ? <div className="success" role="status"><span><Check size={30} /></span><h2 id="modal-title">{sent.title}</h2><p>{sent.message}</p><button className="button" onClick={() => setModal(null)}>Done</button></div>
        : modal.kind === 'about' ? <><p className="eyebrow">Welcome to JoyCars</p><h2 id="modal-title">Your next journey starts here.</h2><p>Explore our showroom, compare vehicles, and request a viewing with a simple, personal experience.</p>{source === 'sample' && <div className="info-note">This is a showroom UI preview. Business details and live vehicle stock will be added before launch.</div>}</>
        : modal.kind === 'vehicle' && modal.vehicle ? vehicleModal(modal.vehicle)
        : leadForm(modal.kind === 'viewing' ? 'viewing' : 'enquiry', modal.vehicle)}
    </section></div>}
  </main>;
}
