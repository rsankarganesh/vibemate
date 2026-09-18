export type ExchangeRate = {base: string; quote: 'AUD'; rate: number; date: string; provider: 'ECB via Frankfurter'};

type RateResponse = {date?: string; base?: string; quote?: string; rate?: number};

export async function getAudExchangeRate(currency: string, date: string, signal?: AbortSignal): Promise<ExchangeRate> {
  if (currency === 'AUD') return {base: 'AUD', quote: 'AUD', rate: 1, date, provider: 'ECB via Frankfurter'};
  if (!/^[A-Z]{3}$/.test(currency) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Choose a valid currency and expense date');
  const url = new URL(`https://api.frankfurter.dev/v2/rate/${currency}/AUD`);
  url.searchParams.set('date', date);
  url.searchParams.set('providers', 'ecb');
  let response: Response;
  try { response = await fetch(url, {signal}); }
  catch { throw new Error('Couldn’t reach the exchange-rate service. Check your connection and try again.'); }
  if (!response.ok) throw new Error(`${currency} is not available from the ECB reference-rate feed for this date.`);
  const data = await response.json() as RateResponse;
  if (!Number.isFinite(data.rate) || Number(data.rate) <= 0 || !data.date) throw new Error('The exchange-rate service returned an invalid rate.');
  return {base: currency, quote: 'AUD', rate: Number(data.rate), date: data.date, provider: 'ECB via Frankfurter'};
}
