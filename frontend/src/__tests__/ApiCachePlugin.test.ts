/** @jest-environment node */
import { apiCachePlugin, cachedResponseTime } from '@/utils/apiCachePlugin';

test('cache fallback preserves pagination headers and marks data with its acquisition time', async () => {
  const response = new Response('[{"id":1}]', { headers: { 'X-Total-Count': '6001', 'X-Has-More': 'true' } });
  const stored = await apiCachePlugin.cacheWillUpdate({ response });
  const fallback = await apiCachePlugin.cachedResponseWillBeUsed({ cachedResponse: stored! });
  expect(fallback!.headers.get('X-Data-Source')).toBe('cache');
  expect(fallback!.headers.get('X-Total-Count')).toBe('6001');
  expect(fallback!.headers.get('X-Has-More')).toBe('true');
  expect(cachedResponseTime(fallback!)).toBe(stored!.headers.get('X-Data-Fetched-At'));
  expect(await fallback!.json()).toEqual([{ id: 1 }]);
  expect(cachedResponseTime(response)).toBeNull();
});

test('server failure triggers fallback and unsuccessful responses are never cached', async () => {
  await expect(apiCachePlugin.fetchDidSucceed({ response: new Response('unavailable', { status: 503 }) })).rejects.toThrow();
  for (const status of [302, 404, 429, 500]) {
    expect(await apiCachePlugin.cacheWillUpdate({ response: new Response('', { status }) })).toBeNull();
  }
});

test('unknown timestamps, expired data and future timestamps cannot be returned as fallback', async () => {
  for (const fetchedAt of ['', new Date(Date.now() - 86400001).toISOString(), new Date(Date.now() + 60000).toISOString()]) {
    const cachedResponse = new Response('[]', { headers: { 'X-Data-Fetched-At': fetchedAt } });
    expect(await apiCachePlugin.cachedResponseWillBeUsed({ cachedResponse })).toBeNull();
  }
});
