import { browser } from '$app/environment';
import { migrateLegacySource } from '$lib/tab/migrate';
import { DEFAULT_TUNING_ID, getTuning } from '$lib/tab/tuning';
import { DEFAULT_SOUND, normalizeSoundSettings, type SoundSettings } from './sound';

const STORAGE_KEY = 'basstabs:sound';
const TEST_STORAGE_KEY = 'basstabs:sound-test';

export const DEFAULT_TEST_SOURCE = `[Low end]
E0 0 0 0 | E3 3 A0 0 | E5 5 7 7 | A0 0 E7 5 |

[Repeated notes]
A2 2 2 2 2 2 2 2 | D0 0 0 0 0 0 0 0 |

[Up the neck]
G0 2 4 5 | G7 9 [12] 9 | D[12] [10] 9 7 | A[12] E[12] 0 |

[Sustain]
E0 | A0 | D0 | G0 |
`;

interface TestRiff {
	source: string;
	tuningId: string;
	syntaxVersion: 2;
}

function loadTest(): TestRiff {
	const fallback: TestRiff = {
		source: DEFAULT_TEST_SOURCE,
		tuningId: DEFAULT_TUNING_ID,
		syntaxVersion: 2
	};
	if (!browser) return fallback;
	try {
		const raw = JSON.parse(localStorage.getItem(TEST_STORAGE_KEY) ?? 'null');
		const tuningId = typeof raw?.tuningId === 'string' ? raw.tuningId : fallback.tuningId;
		const source =
			typeof raw?.source !== 'string'
				? fallback.source
				: raw.syntaxVersion === 2
					? raw.source
					: migrateLegacySource(raw.source, getTuning(tuningId));
		return { source, tuningId, syntaxVersion: 2 };
	} catch {
		return fallback;
	}
}

function load(): SoundSettings {
	if (!browser) return { ...DEFAULT_SOUND };
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return normalizeSoundSettings(raw ? JSON.parse(raw) : null);
	} catch {
		return { ...DEFAULT_SOUND };
	}
}

/** The current sound settings, saved in the browser so experiments survive a reload. */
class SoundStore {
	settings = $state<SoundSettings>(load());
	/** A/B switch: while on, playback uses the built-in defaults instead of `settings`. */
	compareDefault = $state(false);
	/** The settings playback should use right now. */
	active = $derived(this.compareDefault ? DEFAULT_SOUND : this.settings);
	/** The riff on the sound design page, kept apart from the settings that get shared. */
	test = $state<TestRiff>(loadTest());

	constructor() {
		if (!browser) return;
		$effect.root(() => {
			$effect(() => {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
			});
			$effect(() => {
				localStorage.setItem(TEST_STORAGE_KEY, JSON.stringify(this.test));
			});
		});
		window.addEventListener('storage', (e) => {
			if (e.key === STORAGE_KEY) this.settings = load();
		});
	}

	set<K extends keyof SoundSettings>(key: K, value: SoundSettings[K]) {
		this.settings = normalizeSoundSettings({ ...this.settings, [key]: value });
	}

	replace(settings: unknown) {
		this.settings = normalizeSoundSettings(settings);
	}
}

export const soundStore = new SoundStore();
