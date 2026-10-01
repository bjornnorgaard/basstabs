import { site } from './site';

const escapeAttr = (value: string | number) =>
	String(value)
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');

const meta = (key: 'name' | 'property', id: string, content: string | number) =>
	`<meta ${key}="${id}" content="${escapeAttr(content)}" />`;

export function structuredData() {
	return {
		'@context': 'https://schema.org',
		'@graph': [
			{
				'@type': 'WebSite',
				'@id': `${site.url}/#website`,
				name: site.name,
				alternateName: site.shortName,
				url: `${site.url}/`,
				description: site.description,
				inLanguage: site.language
			},
			{
				'@type': 'WebApplication',
				'@id': `${site.url}/#app`,
				name: site.name,
				url: `${site.url}/`,
				description: site.description,
				image: site.image.url,
				applicationCategory: 'MultimediaApplication',
				applicationSubCategory: 'Music',
				operatingSystem: 'Any',
				browserRequirements: 'Requires JavaScript',
				isAccessibleForFree: true,
				inLanguage: site.language,
				keywords: site.keywords.join(', '),
				offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
				author: { '@type': 'Person', name: site.author }
			}
		]
	};
}

/** Static head tags baked into the SPA shell so crawlers and link unfurlers see them without JS. */
export function seoHead() {
	const url = `${site.url}/`;
	const json = JSON.stringify(structuredData()).replace(/</g, '\\u003c');

	return [
		`<title>${escapeAttr(site.name)}</title>`,
		meta('name', 'description', site.description),
		meta('name', 'keywords', site.keywords.join(', ')),
		meta('name', 'author', site.author),
		meta('name', 'application-name', site.name),
		meta('name', 'apple-mobile-web-app-title', site.shortName),
		meta('name', 'robots', 'index, follow, max-image-preview:large'),
		`<meta name="theme-color" media="(prefers-color-scheme: light)" content="${site.themeColor.light}" />`,
		`<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${site.themeColor.dark}" />`,
		`<link rel="canonical" href="${escapeAttr(url)}" />`,
		`<link rel="manifest" href="/manifest.webmanifest" />`,
		`<link rel="sitemap" type="application/xml" href="/sitemap.xml" />`,
		meta('property', 'og:type', 'website'),
		meta('property', 'og:site_name', site.name),
		meta('property', 'og:locale', site.locale),
		meta('property', 'og:url', url),
		meta('property', 'og:title', site.title),
		meta('property', 'og:description', site.description),
		meta('property', 'og:image', site.image.url),
		meta('property', 'og:image:secure_url', site.image.url),
		meta('property', 'og:image:type', site.image.type),
		meta('property', 'og:image:width', site.image.width),
		meta('property', 'og:image:height', site.image.height),
		meta('property', 'og:image:alt', site.image.alt),
		meta('name', 'twitter:card', 'summary_large_image'),
		meta('name', 'twitter:url', url),
		meta('name', 'twitter:title', site.title),
		meta('name', 'twitter:description', site.description),
		meta('name', 'twitter:image', site.image.url),
		meta('name', 'twitter:image:alt', site.image.alt),
		`<script type="application/ld+json">${json}</script>`
	].join('\n\t\t');
}
