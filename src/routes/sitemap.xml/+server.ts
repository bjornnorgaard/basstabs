import { site } from '$lib/site';

export const prerender = true;

export function GET() {
	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
	<url>
		<loc>${site.url}/</loc>
		<changefreq>weekly</changefreq>
		<priority>1.0</priority>
		<image:image>
			<image:loc>${site.image.url}</image:loc>
		</image:image>
	</url>
	<url>
		<loc>${site.url}/public</loc>
		<changefreq>daily</changefreq>
		<priority>0.8</priority>
	</url>
</urlset>
`;
	return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
}
