import { readFile } from 'node:fs/promises';
import path from 'node:path';
export default async function PhotoCredits() {
  let credits: {file:string;author:string;license:string;licenseUrl:string;source:string}[] = [];
  try { credits = JSON.parse(await readFile(path.join(process.cwd(),'public/sample-image-credits.json'),'utf8')); } catch {}
  return <main className="detail-container"><a href="/">← JoyCars showroom</a><h1>Sample vehicle photo credits</h1><p>These representative photographs illustrate sample listings, not actual stock. Images are resized and converted to WebP.</p>{credits.map(c=><section key={c.file}><h2>{c.file}</h2><p>Photo: {c.author} · <a href={c.licenseUrl}>{c.license}</a> · <a href={c.source}>Original source</a></p></section>)}</main>;
}
