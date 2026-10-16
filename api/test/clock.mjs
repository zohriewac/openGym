/* The sample fixtures are dated July 2026 and the coach only reads the last 12 weeks, so on
 * the real clock they age out and every review comes back empty. Run the clock from 2026-07-27
 * instead: still ticking (timeouts and expiries behave), but the fixtures stay in the window. */
const RealDate = Date;
const CLOCK_OFFSET = RealDate.parse('2026-07-27T12:00:00Z') - RealDate.now();
globalThis.Date = class extends RealDate {
  constructor(...a) { super(...(a.length ? a : [RealDate.now() + CLOCK_OFFSET])); }
  static now() { return RealDate.now() + CLOCK_OFFSET; }
};
