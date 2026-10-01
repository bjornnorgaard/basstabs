import type { Handle } from '@sveltejs/kit';
import { seoHead } from '$lib/seo';

const head = seoHead();

// Runs when the SPA shell is generated at build time (and in dev), baking SEO tags into app.html.
export const handle: Handle = ({ event, resolve }) =>
	resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%basstabs.seo%', head)
	});
