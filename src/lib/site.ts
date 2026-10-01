// Single source of truth for site-wide metadata (SEO, social previews, manifest, sitemap).
export const site = {
	name: 'BassTabs by Bear',
	shortName: 'BassTabs',
	title: 'BassTabs by Bear – write bass tabs in shorthand',
	description:
		'Write bass lines in a quick shorthand like "E0 0 A2 2 |" and instantly get classic text bass tabs. Free, private and works offline in your browser.',
	keywords: [
		'bass tab',
		'bass tabs',
		'bass guitar',
		'tab editor',
		'tablature',
		'bass tab generator',
		'text tab',
		'shorthand'
	],
	url: 'https://basstabs.bybear.dk',
	author: 'bear',
	locale: 'en_US',
	language: 'en',
	icon: 'https://fav.farm/▶️',
	image: {
		url: 'https://picsum.photos/id/145/1200/630',
		alt: 'basstabs by bear',
		width: 1200,
		height: 630,
		type: 'image/jpeg'
	},
	themeColor: { light: '#e4e4e4', dark: '#171412' }
} as const;
