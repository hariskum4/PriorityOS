import { forward } from './_forward';

/**
 * 06:00 UTC — the daily batch, started by Vercel and run by the API.
 * See `_forward.ts` for why the clock lives here and the work lives there.
 */
export default forward('daily');
