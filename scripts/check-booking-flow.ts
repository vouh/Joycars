import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';

config({path:['.env.local','.env'],quiet:true});
const db = new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL!})});
async function main(){
  if(!process.env.RESEND_TEST_EMAIL)throw new Error('Set RESEND_TEST_EMAIL to your own test address first.');
  // This diagnostic never starts a payment; run only while callback setup is absent.
  if(process.env.MPESA_CALLBACK_BASE_URL)throw new Error('Do not use this diagnostic with live payments enabled.');
  const car=await db.vehicle.findUniqueOrThrow({where:{slug:'sample-2018-toyota-corolla'}});
  const idempotencyKey=randomUUID();
  const payload={idempotencyKey,type:'viewing',vehicleId:car.id,name:'JoyCars test booking',phone:'0700000000',email:process.env.RESEND_TEST_EMAIL,preferredViewingTime:new Date(Date.now()+48*3600000+3*3600000).toISOString().slice(0,16),message:'TEST BOOKING — verifies that viewing requests reach admin and the configured test-email inbox.',expectedViewingFeeKes:5};
  const send=()=>fetch('http://127.0.0.1:3004/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const first=await send(),body=await first.json();
  if(!first.ok)throw new Error(body.error?.message||'Booking submission failed');
  const second=await send(),replay=await second.json();
  if(!second.ok||replay.leadId!==body.leadId||!replay.duplicate)throw new Error('Booking retry was not idempotent');
  if(await db.lead.count({where:{idempotencyKey}})!==1)throw new Error('Expected one stored booking');
  let emailSent=false;
  for(let i=0;i<20;i++){
    const lead=await db.lead.findUniqueOrThrow({where:{id:body.leadId},include:{delivery:true}});
    if(lead.confirmationSentAt){emailSent=true;break;}
    if(lead.confirmationAttempts>=5)break;
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  console.log(JSON.stringify({bookingStored:true,adminInboxRecord:true,retryDeduplicated:true,emailSent,paymentStarted:Boolean(body.payment),reference:body.leadId.slice(0,8).toUpperCase()}));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Diagnostic failed');process.exitCode=1;}).finally(()=>db.$disconnect());
