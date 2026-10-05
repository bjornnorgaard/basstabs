import { migrateLegacySource } from './migrate';
import { parse } from './parser';
import { DEFAULT_TUNING_ID, getTuning } from './tuning';

/** The parts of a tab that travel inside a share link. */
export interface SharedTab {
	title: string;
	artist: string;
	tuningId: string;
	source: string;
}

/**
 * Version 2 uses brackets for multi-digit frets; version 3 adds articulation, rhythm, repeat and tempo syntax.
 * Encoders still emit the lowest version that can represent the source.
 */
const CURRENT_VERSION = '3';
type ShareVersion = '2' | '3';
const SEPARATOR = '\n';

function toBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
	const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
	const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
	return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/**
 * Returns the lowest share-link version that can represent the source. Future unreleased
 * syntax tasks can extend this helper with their own parser feature flags while staying on v3.
 */
export function requiredShareVersion(source: string, tuningId = DEFAULT_TUNING_ID): ShareVersion {
	const features = parse(source, getTuning(tuningId)).features;
	return features.articulations || features.rhythm || features.repeats || features.tempo
		? '3'
		: '2';
}

/**
 * Packs a tab into a compact, URL-safe string. Fields are newline separated,
 * and only the source may contain newlines, so it always comes last.
 */
export function encodeSharedTab(tab: SharedTab): string {
	const fields = [
		requiredShareVersion(tab.source, tab.tuningId),
		tab.title,
		tab.artist,
		tab.tuningId,
		tab.source
	];
	return toBase64Url(new TextEncoder().encode(fields.join(SEPARATOR)));
}

/** Unpacks a payload produced by {@link encodeSharedTab}, or `null` if invalid. */
export function decodeSharedTab(payload: string): SharedTab | null {
	if (!payload) return null;
	try {
		const text = new TextDecoder().decode(fromBase64Url(payload));
		const [version, title, artist, tuningId, ...rest] = text.split(SEPARATOR);
		if ((version !== CURRENT_VERSION && version !== '2' && version !== '1') || rest.length === 0)
			return null;
		const source = rest.join(SEPARATOR);
		return {
			title: title ?? '',
			artist: artist ?? '',
			tuningId: tuningId || DEFAULT_TUNING_ID,
			source: version === '1' ? migrateLegacySource(source, getTuning(tuningId)) : source
		};
	} catch {
		return null;
	}
}

/**
 * Builds the link to share. The payload lives in the hash so it never reaches
 * the server and is not limited by request line length.
 */
export function buildShareUrl(base: string, tab: SharedTab): string {
	return `${base.replace(/\/+$/, '')}#${encodeSharedTab(tab)}`;
}

/** Reads the payload from a location hash such as `#abc123`. */
export function payloadFromHash(hash: string): string {
	return hash.replace(/^#/, '');
}
