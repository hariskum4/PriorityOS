import { forward } from './_forward';

/**
 * 01:30 UTC — the daily batch, started by Vercel and run by the API.
 *
 * See `_forward.ts` for why the clock lives here and the work lives there.
 *
 * The hour is the interesting part, and it is set in `vercel.json`, which has
 * no room for a comment. It was 06:00 UTC, which is half past eleven in the
 * morning in Asia/Kolkata — where every account on this deployment lives — so
 * the first thing in the batch, a notification titled "Today's one thing",
 * would have arrived after the morning it was about. 01:30 UTC is 07:00 there.
 *
 * That number is a single timezone's, because the batch is: `morningRefresh`
 * schedules for every onboarded user at whatever hour it happens to run, and
 * this schedule is the only place the hour is decided. The timezone-aware
 * version runs hourly and notifies whoever is at 07:00 locally — which needs
 * an hourly cron, and Vercel's Hobby plan allows two cron jobs and only daily
 * schedules. So: correct for everybody today, and the thing to fix on the day
 * an account is opened outside India.
 */
export default forward('daily');
