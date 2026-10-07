'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Fuel, Gauge, MapPin, ShieldCheck, Smartphone, SlidersHorizontal } from 'lucide-react';
import type { VehicleDetail } from '@/lib/services/vehicle-dto';
import type { PublicPayment } from '@/lib/services/payments';

type Payment = PublicPayment | { status: 'not_started'; message: string } | null;
const labels: Record<string,string> = { petrol:'Petrol', diesel:'Diesel', hybrid:'Hybrid', plug_in_hybrid:'Plug-in hybrid', electric:'Electric', other:'Other', automatic:'Automatic', manual:'Manual' };
const localTime = (ms:number) => new Date(ms + 3*3600000).toISOString().slice(0,16);
const amount = (n:number) => n.toLocaleString('en-KE');
export default function VehicleDetails({ vehicle: v, feeKes, paymentsEnabled }: { vehicle: VehicleDetail; feeKes: number; paymentsEnabled: boolean }) {
  const [photo,setPhoto] = useState(0), [busy,setBusy] = useState(false), [error,setError] = useState(''), [fields,setFields] = useState<Record<string,string>>({});
  const [booking,setBooking] = useState<{leadId:string;message:string;payment:Payment}|null>(null);
  const [pollError,setPollError] = useState('');
  const key = useRef('');
  useEffect(() => { key.current = crypto.randomUUID(); }, []);
  useEffect(() => {
    if (!booking?.payment || booking.payment.status !== 'pending' || !('paymentId' in booking.payment)) return;
    const id = booking.payment.paymentId;
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    async function poll() {
      try {
        const r = await fetch(`/api/payments/${id}`, {cache:'no-store'}), body = await r.json();
        if (r.ok && !stopped) { setBooking(old => old && ({...old,payment:body.payment}));setPollError(''); }
        else if (!stopped) setPollError('Payment status is temporarily unavailable. Your booking is saved.');
      } catch { if (!stopped) setPollError('Connection lost. Reconnecting to check your payment…'); }
      if (!stopped && Date.now()-started < 16*60000) timer = setTimeout(poll,5000);
    }
    timer = setTimeout(poll,5000);
    return () => {stopped=true;clearTimeout(timer);};
  }, [booking?.payment && 'paymentId' in booking.payment ? booking.payment.paymentId : null,booking?.payment?.status]);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(busy)return;setBusy(true);setError('');setFields({});
    const f = new FormData(event.currentTarget);
    const body = {idempotencyKey:key.current,type:'viewing',vehicleId:v.id,name:f.get('name'),phone:f.get('phone'),email:f.get('email'),preferredViewingTime:f.get('preferredViewingTime'),message:f.get('message'),website:f.get('website'),expectedViewingFeeKes:feeKes};
    try {
      const r = await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}), data = await r.json();
      if(!r.ok){setFields(data.error?.fields || {});setError(data.error?.message || 'Could not save your request. Please try again.');return;}
      setBooking({leadId:data.leadId,message:data.message,payment:data.payment});
    } catch {setError('Could not reach the showroom. Please retry; you will not be charged twice for the same request.');} finally {setBusy(false);}
  }
  async function retryPayment() {
    if(!booking || busy)return;setBusy(true);setError('');
    try {
      const r = await fetch(`/api/leads/${booking.leadId}/payment`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedViewingFeeKes:feeKes})}),data = await r.json();
      if(r.ok)setBooking({...booking,payment:data.payment});else setError(data.error?.message || 'Could not start payment.');
    }catch{setError('Could not reach M-Pesa. Please try again.');}finally{setBusy(false);}
  }
  const current = v.images[photo];
  const inputError=(name:string)=> fields[name] && <span className="field-error" role="alert">{fields[name]}</span>;
  return <main className="detail-page"><header className="detail-header"><a className="logo" href="/"><strong>Joy<span>Cars</span></strong></a><a href="/#vehicles"><ArrowLeft size={17}/>Back to vehicles</a></header><div className="detail-container"><div className="breadcrumbs"><a href="/">Home</a><span>/</span><a href="/#vehicles">Vehicles</a><span>/</span><span>{v.make} {v.model}</span></div><div className="detail-layout"><div className="detail-main"><div className="detail-gallery">{current ? <img src={current.url} alt={current.alt} width={current.width} height={current.height}/> : <div className="photo-fallback">Photo unavailable</div>}<span className={`detail-availability ${v.availability}`}>{v.availability}</span></div>{v.images.length>1 && <div className="detail-thumbnails">{v.images.map((image,i)=><button key={image.url} aria-label={`Show photo ${i+1}`} aria-pressed={i===photo} onClick={()=>setPhoto(i)}><img src={image.url} alt={image.alt}/></button>)}</div>}<p className="eyebrow">Your next journey starts here</p><h1>{v.title}</h1><p className="detail-location"><MapPin size={17}/>{v.location?.name || 'Nairobi'}</p><div className="detail-specs">{[{icon:CalendarDays,label:'Year',value:v.year},{icon:Gauge,label:'Mileage',value:`${amount(v.mileageKm)} km`},{icon:Fuel,label:'Fuel',value:labels[v.fuelType]},{icon:SlidersHorizontal,label:'Transmission',value:labels[v.transmission]}].map(({icon:Icon,label,value})=><div key={label}><Icon size={21}/><span>{label}</span><strong>{value}</strong></div>)}</div><section className="detail-description"><h2>About this vehicle</h2><p>{v.description}</p><a className="text-button" href="/photo-credits">Sample photo credits <ArrowRight size={14}/></a></section><section className="detail-visit"><h2>Visit the showroom</h2><p>{v.location?.address}</p>{v.location?.hours && <p>{v.location.hours}</p>}<p>Choose a preferred time and our team will confirm your appointment.</p></section></div><aside className="booking-panel"><p className="eyebrow">Vehicle price</p><h2>KES {amount(v.price.amount)}</h2><div className="booking-fee"><Smartphone size={24}/><div><strong>Viewing fee · KES {amount(feeKes)}</strong><span>Pay securely with M-Pesa</span></div></div>{v.availability === 'sold' ? <div className="info-note">This vehicle has been sold. <a href="/#vehicles">Browse available cars.</a></div> : booking ? <div className="booking-result" role="status"><CheckCircle2 className="booking-check"/><h3>Viewing request received</h3><p>{booking.message}</p><p className="booking-reference">Reference: {booking.leadId.slice(0,8).toUpperCase()}</p>{booking.payment && <div className={`payment-state ${booking.payment.status}`}><strong>{booking.payment.status==='paid' ? 'Payment received' : booking.payment.status==='pending' ? 'M-Pesa prompt sent' : 'Payment not completed'}</strong><p>{booking.payment.message}</p>{booking.payment.status==='paid' && <p>A payment receipt will be emailed to you.</p>}</div>}{(!booking.payment || ['failed','cancelled','expired','not_started'].includes(booking.payment.status)) && <button disabled={busy || !paymentsEnabled} className="button mpesa-button" onClick={retryPayment}>{busy?'Sending…':`Pay KES ${amount(feeKes)} via M-Pesa`}</button>}<p>{pollError}</p><p className="form-note">Your appointment time still needs confirmation from the showroom.</p></div> : <><h3>Book a viewing</h3><p className="form-description">See your next car in person. Choose a time that works for you.</p><form className="enquiry-form" onSubmit={submit}><label>Your name<input name="name" required minLength={2} maxLength={120} autoComplete="name" placeholder="Full name"/>{inputError('name')}</label><label>M-Pesa phone number<input name="phone" required type="tel" maxLength={32} autoComplete="tel" placeholder="0712 345 678"/>{inputError('phone')}</label><label>Email address<input name="email" required type="email" maxLength={254} autoComplete="email" placeholder="you@example.com"/>{inputError('email')}</label><label>Preferred date & time <small>(Nairobi)</small><input name="preferredViewingTime" required type="datetime-local" min={localTime(Date.now()+1800000)} max={localTime(Date.now()+90*86400000)}/>{inputError('preferredViewingTime')}</label><label>Message <small>(optional)</small><textarea name="message" maxLength={2000} rows={2} placeholder="Anything you’d like to ask?"/></label><label className="sr-only" aria-hidden="true">Leave empty<input name="website" tabIndex={-1} autoComplete="off"/></label><p className="form-note">We use your contact details to manage this viewing and email your confirmation. Your appointment requires staff confirmation.</p>{!paymentsEnabled && <p className="info-note">M-Pesa is being configured. You can save your request; the team will arrange payment with you.</p>}<button className="button mpesa-button" disabled={busy} type="submit">{busy?'Saving your request…':paymentsEnabled?`Book & pay KES ${amount(feeKes)}`:'Request a viewing'}<ArrowRight size={17}/></button></form></>}{error && <p className="field-error" role="alert">{error}</p>}<p className="booking-trust"><ShieldCheck size={16}/>Your request is saved before payment starts.</p></aside></div></div><footer className="detail-footer">© {new Date().getFullYear()} JoyCars · <a href="/#vehicles">Browse vehicles</a></footer></main>;
}
