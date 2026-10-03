import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, test } from 'node:test';
import {
	assertFails,
	assertSucceeds,
	initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import {
	collection,
	deleteDoc,
	doc,
	getDoc,
	getDocs,
	orderBy,
	query,
	setDoc,
	setLogLevel,
	updateDoc,
	where,
	writeBatch
} from 'firebase/firestore';

const projectId = 'demo-basstabs';
const ownerId = 'owner';
const otherId = 'other';
const tabId = 'tab-1';
const shareId = '0123456789abcdef0123456789abcdef';
const nextShareId = 'fedcba9876543210fedcba9876543210';
const now = Date.now();
let environment;

function authenticated(uid = ownerId, provider = 'google.com') {
	return environment
		.authenticatedContext(uid, { firebase: { sign_in_provider: provider } })
		.firestore();
}

function canonical(database, uid = ownerId, id = tabId) {
	return doc(database, 'users', uid, 'tabs', id);
}

function published(database, token = shareId) {
	return doc(database, 'publishedTabs', token);
}

function tab(overrides = {}) {
	return {
		title: 'Bass line',
		artist: 'Artist',
		tuningId: 'standard-4',
		source: '@4/4\nG|----|\nD|----|\nA|----|\nE|0---|',
		syntaxVersion: 2,
		createdAt: now,
		updatedAt: now,
		visibility: 'private',
		shareId: null,
		...overrides
	};
}

function mirror(data, uid = ownerId, id = tabId) {
	const content = { ...data };
	delete content.shareId;
	return { ...content, ownerId: uid, tabId: id };
}

async function coordinateTitle(batch, database, uid, id, data) {
	const previous = await getDoc(canonical(database, uid, id));
	if (previous.exists() && previous.data().title === data.title) return;
	const reference = doc(database, 'users', uid, 'cloudState', 'tabNames');
	const state = await getDoc(reference);
	batch.set(reference, { revision: (state.data()?.revision ?? 0) + 1 });
}

async function writeCanonical(database, data, uid = ownerId, id = tabId) {
	const batch = writeBatch(database);
	await coordinateTitle(batch, database, uid, id, data);
	batch.set(canonical(database, uid, id), data);
	return batch.commit();
}

async function writeShared(database, data, uid = ownerId, id = tabId) {
	const batch = writeBatch(database);
	await coordinateTitle(batch, database, uid, id, data);
	batch.set(canonical(database, uid, id), data);
	batch.set(published(database, data.shareId), mirror(data, uid, id));
	return batch.commit();
}

before(async () => {
	setLogLevel('silent');
	assert.ok(
		process.env.FIRESTORE_EMULATOR_HOST,
		'Run with npm run test:rules (a Firestore emulator is required).'
	);
	environment = await initializeTestEnvironment({
		projectId,
		firestore: {
			rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8')
		}
	});
});

beforeEach(async () => {
	await environment.clearFirestore();
});

after(async () => {
	await environment?.cleanup();
});

test('guests cannot read, list or write canonical tabs, including shared canonical tabs', async () => {
	const owner = authenticated();
	const guest = environment.unauthenticatedContext().firestore();
	await assertSucceeds(writeCanonical(owner, tab()));
	await assertFails(getDoc(canonical(guest)));
	await assertFails(getDocs(collection(guest, 'users', ownerId, 'tabs')));
	await assertFails(setDoc(canonical(guest), tab()));
	await assertFails(updateDoc(canonical(guest), { title: 'Changed' }));
	await assertFails(deleteDoc(canonical(guest)));
	await assertFails(setDoc(published(guest), mirror(tab({ visibility: 'public', shareId }))));
	await assertSucceeds(writeShared(owner, tab({ visibility: 'public', shareId })));
	await assertFails(getDoc(canonical(guest)));
});

test('owners can create, read, list, update and delete private tabs', async () => {
	const owner = authenticated();
	await assertSucceeds(writeCanonical(owner, tab()));
	await assertSucceeds(getDoc(canonical(owner)));
	const result = await assertSucceeds(getDocs(collection(owner, 'users', ownerId, 'tabs')));
	assert.equal(result.size, 1);
	await assertSucceeds(writeCanonical(owner, tab({ title: 'Updated', updatedAt: now + 1 })));
	await assertSucceeds(deleteDoc(canonical(owner)));
});

test('nonowners and non-Google sign-ins cannot access or mutate owner tabs', async () => {
	const owner = authenticated();
	const other = authenticated(otherId);
	const password = authenticated(ownerId, 'password');
	await assertSucceeds(writeShared(owner, tab({ visibility: 'public', shareId })));
	for (const database of [other, password]) {
		await assertFails(getDoc(canonical(database)));
		await assertFails(getDocs(collection(database, 'users', ownerId, 'tabs')));
		await assertFails(setDoc(canonical(database, ownerId, 'new-tab'), tab()));
		await assertFails(updateDoc(canonical(database), { title: 'Changed' }));
		await assertFails(deleteDoc(canonical(database)));
		await assertFails(updateDoc(published(database), { title: 'Changed' }));
		await assertFails(deleteDoc(published(database)));
	}
	await assertFails(setDoc(canonical(other), tab()));
});

test('unlisted projections allow direct guest reads, but never list queries', async () => {
	const owner = authenticated();
	const guest = environment.unauthenticatedContext().firestore();
	await assertSucceeds(writeShared(owner, tab({ visibility: 'unlisted', shareId })));
	assert.equal((await assertSucceeds(getDoc(published(guest)))).data().visibility, 'unlisted');
	for (const database of [guest, owner]) {
		await assertFails(getDocs(collection(database, 'publishedTabs')));
		await assertFails(
			getDocs(query(collection(database, 'publishedTabs'), where('visibility', '==', 'unlisted')))
		);
		await assertFails(
			getDocs(
				query(
					collection(database, 'publishedTabs'),
					where('visibility', 'in', ['public', 'unlisted'])
				)
			)
		);
	}
});

test('public visibility queries can list public tabs and do not reveal unlisted tabs', async () => {
	const owner = authenticated();
	const guest = environment.unauthenticatedContext().firestore();
	await assertSucceeds(writeShared(owner, tab({ visibility: 'public', shareId })));
	await assertSucceeds(
		writeShared(owner, tab({ visibility: 'unlisted', shareId: nextShareId }), ownerId, 'unlisted')
	);
	const result = await assertSucceeds(
		getDocs(
			query(
				collection(guest, 'publishedTabs'),
				where('visibility', '==', 'public'),
				orderBy('updatedAt', 'desc')
			)
		)
	);
	assert.equal(result.size, 1);
	assert.equal(result.docs[0].id, shareId);
	await assertSucceeds(getDoc(published(guest)));
	await assertFails(getDocs(collection(guest, 'publishedTabs')));
});

test('publishing requires the matching canonical and projection in the same batch', async () => {
	const owner = authenticated();
	const data = tab({ visibility: 'public', shareId });
	await assertFails(setDoc(canonical(owner), data));
	await assertFails(setDoc(published(owner), mirror(data)));
	const mismatched = writeBatch(owner);
	mismatched.set(canonical(owner), data);
	mismatched.set(published(owner), { ...mirror(data), source: 'Not the canonical content' });
	await assertFails(mismatched.commit());
	await assertSucceeds(writeShared(owner, data));
});

test('shared edits and visibility changes must update the projection atomically', async () => {
	const owner = authenticated();
	const original = tab({ visibility: 'public', shareId });
	await assertSucceeds(writeShared(owner, original));
	await assertFails(updateDoc(canonical(owner), { title: 'New title', updatedAt: now + 1 }));
	await assertFails(updateDoc(published(owner), { title: 'New title', updatedAt: now + 1 }));
	await assertFails(updateDoc(canonical(owner), { visibility: 'unlisted' }));
	await assertFails(updateDoc(published(owner), { visibility: 'unlisted' }));
	const updated = { ...original, title: 'New title', visibility: 'unlisted', updatedAt: now + 1 };
	await assertSucceeds(writeShared(owner, updated));
	assert.deepEqual((await getDoc(published(owner))).data(), mirror(updated));
});

test('revoking sharing requires deleting the projection in the same batch', async () => {
	const owner = authenticated();
	const original = tab({ visibility: 'unlisted', shareId });
	await assertSucceeds(writeShared(owner, original));
	await assertFails(updateDoc(canonical(owner), { visibility: 'private', shareId: null }));
	await assertFails(deleteDoc(published(owner)));
	const batch = writeBatch(owner);
	batch.update(canonical(owner), { visibility: 'private', shareId: null, updatedAt: now + 1 });
	batch.delete(published(owner));
	await assertSucceeds(batch.commit());
	assert.equal((await getDoc(canonical(owner))).data().visibility, 'private');
	assert.equal((await getDoc(published(owner))).exists(), false);
	await assertFails(setDoc(published(owner), mirror(original)));
});

test('deleting a shared tab requires deleting both documents atomically', async () => {
	const owner = authenticated();
	await assertSucceeds(writeShared(owner, tab({ visibility: 'public', shareId })));
	await assertFails(deleteDoc(canonical(owner)));
	await assertFails(deleteDoc(published(owner)));
	const batch = writeBatch(owner);
	batch.delete(canonical(owner));
	batch.delete(published(owner));
	await assertSucceeds(batch.commit());
	assert.equal((await getDoc(published(owner))).exists(), false);
});

test('rotating a share token requires removing the previous projection', async () => {
	const owner = authenticated();
	const original = tab({ visibility: 'public', shareId });
	await assertSucceeds(writeShared(owner, original));
	const updated = { ...original, shareId: nextShareId, updatedAt: now + 1 };
	await assertFails(writeShared(owner, updated));
	const batch = writeBatch(owner);
	batch.set(canonical(owner), updated);
	batch.delete(published(owner));
	batch.set(published(owner, nextShareId), mirror(updated));
	await assertSucceeds(batch.commit());
	assert.equal((await getDoc(published(owner))).exists(), false);
	assert.equal((await getDoc(published(owner, nextShareId))).exists(), true);
});

test('createdAt and projection identity are immutable, even in otherwise consistent batches', async () => {
	const owner = authenticated();
	const original = tab({ visibility: 'public', shareId });
	await assertSucceeds(writeShared(owner, original));
	await assertFails(writeShared(owner, { ...original, createdAt: now - 1 }));
	await assertFails(updateDoc(published(owner), { ownerId: otherId }));
	await assertFails(updateDoc(published(owner), { tabId: 'different-tab' }));
	const moved = writeBatch(owner);
	moved.delete(canonical(owner));
	moved.set(canonical(owner, ownerId, 'different-tab'), original);
	moved.set(published(owner), mirror(original, ownerId, 'different-tab'));
	await assertFails(moved.commit());
});

test('tokens cannot be stolen or attached to a different owner canonical tab', async () => {
	const owner = authenticated();
	const other = authenticated(otherId);
	const original = tab({ visibility: 'public', shareId });
	await assertSucceeds(writeShared(owner, original));
	await assertFails(writeShared(other, original, otherId));
	await assertFails(writeShared(owner, original, ownerId, 'different-tab'));
});

test('canonical schema rejects missing, extra, invalid or out-of-range fields', async () => {
	const owner = authenticated();
	const invalid = [
		{ id: tabId },
		{ ownerId },
		{ title: 1 },
		{ title: 'x'.repeat(201) },
		{ artist: null },
		{ artist: 'x'.repeat(201) },
		{ tuningId: 'unknown' },
		{ source: 7 },
		{ source: 'x'.repeat(200001) },
		{ syntaxVersion: 1 },
		{ syntaxVersion: '2' },
		{ createdAt: 'today' },
		{ createdAt: 0 },
		{ createdAt: now + 1 },
		{ createdAt: now + 0.5 },
		{ updatedAt: now - 1 },
		{ updatedAt: now + 0.5 },
		{ updatedAt: now + 3600000 },
		{ visibility: 'unknown' },
		{ shareId },
		{ visibility: 'public', shareId: null },
		{ visibility: 'unlisted', shareId: 'guessable' },
		{ visibility: 'public', shareId: shareId.toUpperCase() }
	];
	for (const overrides of invalid) {
		await assertFails(writeCanonical(owner, tab(overrides)));
	}
	for (const field of Object.keys(tab())) {
		const data = tab();
		delete data[field];
		await assertFails(writeCanonical(owner, data));
	}
	for (const tuningId of ['standard-4', 'standard-5', 'standard-6']) {
		await assertSucceeds(writeCanonical(owner, tab({ tuningId })));
	}
	await assertSucceeds(
		writeCanonical(
			owner,
			tab({ title: 'x'.repeat(200), artist: 'x'.repeat(200), source: 'x'.repeat(200000) })
		)
	);
});

test('published projections reject extra, missing and invalid fields, including shareId', async () => {
	const owner = authenticated();
	const data = tab({ visibility: 'public', shareId });
	for (const overrides of [{ shareId }, { id: tabId }, { visibility: 'private' }, { ownerId: 1 }]) {
		const batch = writeBatch(owner);
		batch.set(canonical(owner), data);
		batch.set(published(owner), { ...mirror(data), ...overrides });
		await assertFails(batch.commit());
	}
	for (const field of Object.keys(mirror(data))) {
		const projection = mirror(data);
		delete projection[field];
		const batch = writeBatch(owner);
		batch.set(canonical(owner), data);
		batch.set(published(owner), projection);
		await assertFails(batch.commit());
	}
});

test('updatedAt cannot go backwards and unrelated collections are denied', async () => {
	const owner = authenticated();
	await assertSucceeds(writeCanonical(owner, tab({ updatedAt: now + 10 })));
	await assertFails(updateDoc(canonical(owner), { updatedAt: now + 1 }));
	await assertFails(setDoc(doc(owner, 'users', ownerId), { name: 'Owner' }));
	await assertFails(setDoc(doc(owner, 'otherCollection', 'document'), { title: 'No' }));
	await assertFails(getDoc(doc(owner, 'otherCollection', 'document')));
});

test('title coordination is owner-only and required for creates and renames', async () => {
	const owner = authenticated();
	const reference = doc(owner, 'users', ownerId, 'cloudState', 'tabNames');
	await assertFails(setDoc(canonical(owner), tab()));
	await assertSucceeds(writeCanonical(owner, tab()));
	assert.equal((await getDoc(reference)).data().revision, 1);
	await assertFails(updateDoc(canonical(owner), { title: 'Renamed' }));
	await assertSucceeds(writeCanonical(owner, tab({ title: 'Renamed' })));
	assert.equal((await getDoc(reference)).data().revision, 2);
	await assertSucceeds(updateDoc(canonical(owner), { source: 'E3' }));
	await assertFails(setDoc(reference, { revision: 2 }));
	await assertFails(setDoc(reference, { revision: 4 }));
	await assertFails(setDoc(reference, { revision: 3, extra: true }));
	await assertFails(deleteDoc(reference));
	for (const database of [
		authenticated(otherId),
		environment.unauthenticatedContext().firestore()
	]) {
		const otherReference = doc(database, 'users', ownerId, 'cloudState', 'tabNames');
		await assertFails(getDoc(otherReference));
		await assertFails(setDoc(otherReference, { revision: 3 }));
	}
	await assertSucceeds(writeCanonical(authenticated(otherId), tab(), otherId));
});
