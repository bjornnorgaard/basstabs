import { build, files, prerendered, version } from '$service-worker';

const worker = self as ServiceWorkerGlobalScope;

const CACHE_PREFIX = 'basstabs-app-shell';
const CACHE_NAME = `${CACHE_PREFIX}-${version}`;
const APP_SHELL = '/200.html';
const PRECOMPRESSED_ASSET = /\.(?:br|gz)$/;

const precacheUrls = Array.from(new Set([...build, ...files, ...prerendered])).filter(
	(url) => !PRECOMPRESSED_ASSET.test(new URL(url, worker.location.origin).pathname)
);
const precachePaths = new Set(
	[...precacheUrls, APP_SHELL].map((url) => new URL(url, worker.location.origin).pathname)
);

worker.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE_NAME);
			await cache.addAll(precacheUrls);
			await cacheAppShell(cache);
			await worker.skipWaiting();
		})()
	);
});

worker.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(
				keys
					.filter((key) => key.startsWith(`${CACHE_PREFIX}-`) && key !== CACHE_NAME)
					.map((key) => caches.delete(key))
			);
			await worker.clients.claim();
		})()
	);
});

worker.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== worker.location.origin) return;

	if (precachePaths.has(url.pathname)) {
		event.respondWith(cacheFirst(request));
		return;
	}

	if (request.mode === 'navigate') {
		event.respondWith(networkFirstNavigation(request));
	}
});

worker.addEventListener('message', (event) => {
	if (event.data?.type === 'SKIP_WAITING') {
		event.waitUntil(worker.skipWaiting());
	}
});

async function cacheFirst(request: Request) {
	const url = new URL(request.url);
	const cache = await caches.open(CACHE_NAME);
	const cached = await cache.match(url.pathname);
	if (cached) return cached;

	const response = await fetch(request);
	if (response.ok) {
		await cache.put(url.pathname, response.clone());
	}
	return response;
}

async function cacheAppShell(cache: Cache) {
	const shellResponse = await fetch(APP_SHELL, { cache: 'reload' });
	if (shellResponse.ok) {
		await cache.put(APP_SHELL, shellResponse);
		return;
	}

	const rootResponse = await fetch('/', { cache: 'reload' });
	if (!rootResponse.ok) {
		throw new Error('Could not precache the app shell.');
	}
	await cache.put(APP_SHELL, rootResponse);
}

async function networkFirstNavigation(request: Request) {
	const url = new URL(request.url);
	const cache = await caches.open(CACHE_NAME);

	try {
		const response = await fetch(request);
		if (response.ok && !url.search && isHtml(response)) {
			await cache.put(url.pathname, response.clone());
		}
		return response;
	} catch (error) {
		const cachedNavigation = await cache.match(url.pathname);
		if (cachedNavigation) return cachedNavigation;

		const shell = await appShellForPath(cache, url.pathname);
		if (shell) return shell;
		throw error;
	}
}

function isHtml(response: Response) {
	return response.headers.get('content-type')?.includes('text/html') ?? false;
}

async function appShellForPath(cache: Cache, pathname: string) {
	const shell = await cache.match(APP_SHELL);
	if (!shell) return undefined;

	const assetPrefix = '../'.repeat(Math.max(0, pathname.split('/').filter(Boolean).length - 1));
	if (!assetPrefix) return shell;

	const headers = new Headers(shell.headers);
	headers.delete('content-length');
	const body = (await shell.text())
		.replace('base: new URL(".", location).pathname.slice(0, -1)', 'base: ""')
		.replaceAll('./_app/', `${assetPrefix}_app/`);

	return new Response(body, {
		status: shell.status,
		statusText: shell.statusText,
		headers
	});
}
