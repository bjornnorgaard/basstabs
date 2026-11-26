import { site } from '#lib/site.ts';

export const prerender = true;

export function GET() {
	const body = `User-agent: *
Allow: /

Sitemap: ${site.url}/sitemap.xml
`;
	return new Response(body, { headers: { 'Content-Type': 'text/plain' } });
}
