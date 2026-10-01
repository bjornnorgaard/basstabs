import { site } from '$lib/site';

export const prerender = true;

export function GET() {
	const manifest = {
		name: site.name,
		short_name: site.shortName,
		description: site.description,
		lang: site.language,
		start_url: '/',
		scope: '/',
		display: 'standalone',
		background_color: site.themeColor.light,
		theme_color: site.themeColor.light,
		categories: ['music', 'utilities', 'productivity'],
		icons: [{ src: site.icon, sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
	};
	return new Response(JSON.stringify(manifest, null, '\t'), {
		headers: { 'Content-Type': 'application/manifest+json' }
	});
}
