export function isOfflineError(error: unknown) {
	const candidate = error as { code?: unknown; message?: unknown };
	return (
		candidate.code === 'unavailable' ||
		(typeof candidate.message === 'string' && /\boffline\b/i.test(candidate.message))
	);
}
