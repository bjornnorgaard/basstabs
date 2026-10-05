import { beforeEach, vi } from 'vitest';

class SilentAudioContext {
	state = 'running';
	currentTime = 0;
	sampleRate = 44_100;
	destination = {};

	resume() {
		return Promise.resolve();
	}

	createBuffer(_channels: number, length: number, sampleRate: number) {
		return {
			length,
			sampleRate,
			copyToChannel: vi.fn()
		};
	}

	createBufferSource() {
		return {
			buffer: null,
			connect: vi.fn(),
			start: vi.fn(),
			stop: vi.fn()
		};
	}

	createGain() {
		return {
			connect: vi.fn(),
			disconnect: vi.fn(),
			gain: {
				setValueAtTime: vi.fn(),
				setTargetAtTime: vi.fn(),
				cancelScheduledValues: vi.fn()
			}
		};
	}

	createBiquadFilter() {
		return {
			connect: vi.fn(),
			type: 'lowpass',
			frequency: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
			Q: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
			gain: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() }
		};
	}

	createDynamicsCompressor() {
		return {
			connect: vi.fn(),
			threshold: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
			knee: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
			ratio: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
			attack: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
			release: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() }
		};
	}
}

beforeEach(() => {
	vi.restoreAllMocks();
	window.localStorage.clear();
	window.sessionStorage.clear();
	Object.defineProperty(window, 'AudioContext', {
		configurable: true,
		writable: true,
		value: SilentAudioContext
	});
	Object.defineProperty(window, 'webkitAudioContext', {
		configurable: true,
		writable: true,
		value: SilentAudioContext
	});
});
