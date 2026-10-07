import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'JoyCars | Find Your Perfect Car', description: 'Explore the JoyCars online showroom. Find your next car and request a viewing.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
