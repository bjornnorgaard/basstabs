import { browser } from '$app/environment';
import { toaster } from '$lib/toaster';

let started = false;
let updateNotified = false;

export function registerServiceWorker() {
	if (started || !browser || !import.meta.env.PROD || !('serviceWorker' in navigator)) return;

	started = true;
	void setupServiceWorker();
}

async function setupServiceWorker() {
	const hadController = Boolean(navigator.serviceWorker.controller);

	try {
		const registration = await navigator.serviceWorker.register('/service-worker.js', {
			type: 'module'
		});

		watchForUpdates(registration, hadController);
		void registration.update().catch((error: unknown) => {
			console.warn('Could not check for a service worker update.', error);
		});
	} catch (error) {
		console.warn('Could not register the service worker.', error);
	}
}

function watchForUpdates(registration: ServiceWorkerRegistration, hadController: boolean) {
	navigator.serviceWorker.addEventListener('controllerchange', () => {
		if (hadController) notifyUpdateReady();
	});

	if (registration.waiting && hadController) {
		notifyUpdateReady();
		registration.waiting.postMessage({ type: 'SKIP_WAITING' });
	}

	registration.addEventListener('updatefound', () => {
		const worker = registration.installing;
		if (!worker) return;

		worker.addEventListener('statechange', () => {
			if (worker.state !== 'installed' || !navigator.serviceWorker.controller) return;
			notifyUpdateReady();
			worker.postMessage({ type: 'SKIP_WAITING' });
		});
	});
}

function notifyUpdateReady() {
	if (updateNotified) return;
	updateNotified = true;
	toaster.info({
		id: 'app-update-ready',
		title: 'Update ready',
		description: 'Refresh this page to load the newest version of basstabs.',
		duration: 15_000
	});
}
