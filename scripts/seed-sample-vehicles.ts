import { config } from 'dotenv';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import sharp from 'sharp';

config({path:['.env.local','.env'],quiet:true});
const db = new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL!})});
const storage = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false}});
const bucket = process.env.SUPABASE_IMAGES_BUCKET || 'vehicle-images';
const stock = [
  {make:'Toyota',model:'Corolla',year:2018,price:1850000,mileage:62000,fuel:'petrol' as const,file:'2018 Toyota Corolla Altis 1.6 G 20221015.jpg'},
  {make:'Hyundai',model:'Tucson',year:2019,price:2950000,mileage:48000,fuel:'petrol' as const,file:'2019 Hyundai Tucson Front-Side.jpg'},
  {make:'BMW',model:'5 Series',year:2018,price:4250000,mileage:54000,fuel:'diesel' as const,file:'2018 BMW 5-Series 520d M Sport.jpg'},
  {make:'Ford',model:'Mustang',year:2020,price:5600000,mileage:31000,fuel:'petrol' as const,file:'2020 Ford Mustang GT 2.jpg'},
  {make:'Toyota',model:'RAV4',year:2019,price:3450000,mileage:45000,fuel:'petrol' as const,file:'2019 Toyota RAV4 XLE AWD, front 12.31.19.jpg'},
];
const clean = (s:string) => s.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&#39;/g,"'").trim();
async function main(){
  await mkdir('public/sample-vehicles',{recursive:true});
  const {data:existing} = await storage.storage.getBucket(bucket);
  if(!existing){const {error}=await storage.storage.createBucket(bucket,{public:true,allowedMimeTypes:['image/webp'],fileSizeLimit:'10MB'});if(error)throw new Error('Could not create vehicle image bucket');}
  let location = await db.location.findFirst({where:{name:'Sample showroom'}});
  location ??= await db.location.create({data:{name:'Sample showroom',address:'Ridgeways / Kiambu Road, Nairobi (sample location)'}});
  const credits: {file:string;author:string;license:string;licenseUrl:string;source:string}[]=[];
  for(const v of stock){
    const slug = `sample-${v.year}-${v.make}-${v.model}`.toLowerCase().replace(/[^a-z0-9]+/g,'-');
    const api = new URL('https://commons.wikimedia.org/w/api.php');
    api.search = new URLSearchParams({action:'query',format:'json',prop:'imageinfo',titles:`File:${v.file}`,iiprop:'url|extmetadata',iiurlwidth:'1400'}).toString();
    const metaResponse=await fetch(api,{headers:{'User-Agent':'JoyCarsSampleSeeder/1.0 (development showroom; attribution retained)'},signal:AbortSignal.timeout(30000)});
    if(!metaResponse.ok)throw new Error(`Image metadata unavailable for ${v.make} ${v.model}: HTTP ${metaResponse.status}`);
    const meta=await metaResponse.json();
    const info=Object.values(meta.query.pages).flatMap((p:any)=>p.imageinfo || [])[0] as any;
    if(!info)throw new Error(`Wikimedia file not found: ${v.file}`);
    const source=info.descriptionurl as string;
    const author=clean(info.extmetadata.Artist?.value || 'Wikimedia Commons contributor');
    const license=clean(info.extmetadata.LicenseShortName?.value || 'See source');
    const licenseUrl=info.extmetadata.LicenseUrl?.value || source;
    const imageResponse=await fetch(info.thumburl || info.url,{headers:{'User-Agent':'JoyCarsSampleSeeder/1.0'},signal:AbortSignal.timeout(45000)});
    if(!imageResponse.ok)throw new Error(`Photo unavailable: HTTP ${imageResponse.status}`);
    const {data,info:dimensions}=await sharp(Buffer.from(await imageResponse.arrayBuffer())).rotate().resize({width:1400,height:1000,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer({resolveWithObject:true});
    await writeFile(`public/sample-vehicles/${slug}.webp`,data);
    const storageKey=`samples/${slug}.webp`;
    const {error}=await storage.storage.from(bucket).upload(storageKey,data,{upsert:true,contentType:'image/webp',cacheControl:'3600'});
    if(error)throw new Error(`Sample image upload failed for ${slug}`);
    const description=`SAMPLE VEHICLE — this listing is for testing the showroom and booking experience. The price, mileage and specifications are illustrative, and this is not actual dealership stock.\n\nA ${v.year} ${v.make} ${v.model} with automatic transmission. Explore its details and request a viewing.\n\nRepresentative photo: ${author}, ${license}. Source: ${source}. Resized and converted to WebP.`;
    const vehicle=await db.vehicle.upsert({where:{externalId:`joycars-sample-${slug}`},update:{},create:{externalId:`joycars-sample-${slug}`,slug,make:v.make,model:v.model,year:v.year,priceAmount:BigInt(v.price)*100n,mileageKm:v.mileage,fuelType:v.fuel,transmission:'automatic',locationId:location.id,description,publicationState:'published',availability:'available',publishedAt:new Date(),images:{create:{storageKey,altText:`Sample ${v.year} ${v.make} ${v.model} — representative photograph`,position:0,width:dimensions.width,height:dimensions.height,bytes:data.length}}}});
    credits.push({file:v.file,author,license,licenseUrl,source});
    await writeFile('public/sample-image-credits.json',JSON.stringify(credits,null,2));
    console.log(`Sample ready: ${vehicle.slug}`);
  }
  console.log('Five sample vehicles added. Existing non-sample stock was preserved.');
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Seed failed');process.exitCode=1;}).finally(()=>db.$disconnect());
