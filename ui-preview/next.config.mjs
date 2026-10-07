import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

// Keep development output separate from production assets so a dev server
// cannot remove the CSS/chunks being served by a production preview.
export default function config(phase) {
  return {
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-development' : '.next-production',
  };
}
