import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { getApp } from 'firebase/app';
import {
	collection,
	connectFirestoreEmulator,
	deleteDoc,
	doc,
	getDocs,
	getFirestore,
	setDoc,
	setLogLevel
} from 'firebase/firestore';
import { cloudData, type CloudTab } from './model';
import { writeCloudTab } from './write';

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)(
	'cloud title uniqueness with Firestore',
	() => {
		let environment: RulesTestEnvironment;
		const now = Date.now();
		const tab: CloudTab = {
			id: 'original',
			title: 'Riff',
			artist: '',
			source: 'E0',
			tuningId: 'standard-4',
			syntaxVersion: 2,
			createdAt: now,
			updatedAt: now,
			visibility: 'private',
			shareId: null
		};
		const database = (uid = 'owner') => {
			const context = environment
				.authenticatedContext(uid, { firebase: { sign_in_provider: 'google.com' } })
				.firestore();
			const db = getFirestore(getApp(context.app.name));
			const emulator = environment.emulators.firestore;
			if (!emulator) throw new Error('Firestore emulator is required.');
			connectFirestoreEmulator(db, emulator.host, emulator.port, {
				mockUserToken: { sub: uid, firebase: { sign_in_provider: 'google.com' } }
			});
			return db;
		};

		beforeAll(async () => {
			setLogLevel('silent');
			environment = await initializeTestEnvironment({
				projectId: 'demo-basstabs',
				firestore: { rules: await readFile('firestore.rules', 'utf8') }
			});
		});
		beforeEach(async () => environment.clearFirestore());
		afterAll(async () => environment?.cleanup());

		it('accepts only one of two simultaneous same-title uploads from separate clients', async () => {
			const results = await Promise.allSettled([
				writeCloudTab(database(), tab, 'owner', null),
				writeCloudTab(database(), { ...tab, id: 'copy', title: ' riff ' }, 'owner', null)
			]);
			expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
			const rejected = results.find((result) => result.status === 'rejected');
			expect(rejected?.status === 'rejected' ? rejected.reason.message : '').toContain(
				'different title'
			);
			const library = await getDocs(collection(database(), 'users', 'owner', 'tabs'));
			expect(library.size).toBe(1);
			expect(library.docs[0].data().visibility).toBe('private');
		});

		it('allows the same title in different accounts and distinct versions in one account', async () => {
			await writeCloudTab(database(), tab, 'owner', null);
			await writeCloudTab(database('other'), tab, 'other', null);
			await writeCloudTab(database(), { ...tab, id: 'variation', title: 'Riff 2' }, 'owner', null);
			expect((await getDocs(collection(database(), 'users', 'owner', 'tabs'))).size).toBe(2);
			expect((await getDocs(collection(database('other'), 'users', 'other', 'tabs'))).size).toBe(1);
		});

		it('checks legacy titles without needing a migration and permits edits to the same tab', async () => {
			await environment.withSecurityRulesDisabled(async (context) => {
				await setDoc(doc(context.firestore(), 'users', 'owner', 'tabs', tab.id), cloudData(tab));
			});
			await expect(
				writeCloudTab(database(), { ...tab, id: 'copy' }, 'owner', null)
			).rejects.toThrow('different title');
			await writeCloudTab(database(), { ...tab, title: 'RIFF', source: 'E3' }, 'owner', null);
			expect((await getDocs(collection(database(), 'users', 'owner', 'tabs'))).size).toBe(1);
		});

		it('rejects a conflicting rename and permits reusing a title once renamed', async () => {
			await writeCloudTab(database(), tab, 'owner', null);
			const variation = { ...tab, id: 'variation', title: 'Riff 2' };
			await writeCloudTab(database(), variation, 'owner', null);
			await expect(
				writeCloudTab(database(), { ...variation, title: 'RIFF' }, 'owner', null)
			).rejects.toThrow('different title');
			await writeCloudTab(database(), { ...tab, title: 'Riff 3' }, 'owner', null);
			await writeCloudTab(database(), { ...variation, title: 'RIFF' }, 'owner', null);
			expect((await getDocs(collection(database(), 'users', 'owner', 'tabs'))).size).toBe(2);
		});

		it('allows reusing a deleted title', async () => {
			await writeCloudTab(database(), tab, 'owner', null);
			await deleteDoc(doc(database(), 'users', 'owner', 'tabs', tab.id));
			await writeCloudTab(database(), { ...tab, id: 'replacement' }, 'owner', null);
			const library = await getDocs(collection(database(), 'users', 'owner', 'tabs'));
			expect(library.docs.map((entry) => entry.id)).toEqual(['replacement']);
		});
	}
);
