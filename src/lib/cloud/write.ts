import type * as FirebaseFirestore from 'firebase/firestore';
import { assertUniqueCloudTitle, cloudData, readCloudTab, type CloudTab } from './model';

type FirestoreApi = Pick<
	typeof FirebaseFirestore,
	'collection' | 'doc' | 'getDocsFromServer' | 'increment' | 'runTransaction' | 'writeBatch'
>;

export async function writeCloudTab(
	db: FirebaseFirestore.Firestore,
	tab: CloudTab,
	uid: string,
	oldShareId: string | null,
	createOnly = false,
	firestore?: FirestoreApi
) {
	firestore ??= await import('firebase/firestore');
	readCloudTab(tab.id, cloudData(tab));
	await firestore.runTransaction(db, async (transaction) => {
		const reference = firestore.doc(db, 'users', uid, 'tabs', tab.id);
		const previous = await transaction.get(reference);
		if (createOnly && previous.exists()) {
			throw new Error('This tab is already saved in the cloud. Reload and open the existing tab.');
		}
		if (!previous.exists() || previous.data().title !== tab.title) {
			// Every create/rename reads and advances this revision, so concurrent title
			// checks retry against the latest library rather than both accepting a name.
			const namesReference = firestore.doc(db, 'users', uid, 'cloudState', 'tabNames');
			await transaction.get(namesReference);
			const library = await firestore.getDocsFromServer(
				firestore.collection(db, 'users', uid, 'tabs')
			);
			assertUniqueCloudTitle(
				tab,
				library.docs.map((entry) => readCloudTab(entry.id, entry.data()))
			);
			transaction.set(namesReference, { revision: firestore.increment(1) }, { merge: true });
		}
		transaction.set(reference, cloudData(tab));
		if (oldShareId && oldShareId !== tab.shareId)
			transaction.delete(firestore.doc(db, 'publishedTabs', oldShareId));
		const { shareId, ...data } = cloudData(tab);
		if (shareId) {
			transaction.set(firestore.doc(db, 'publishedTabs', shareId), {
				...data,
				ownerId: uid,
				tabId: tab.id
			});
		}
	});
}

export async function queueCloudTabWrite(
	db: FirebaseFirestore.Firestore,
	tab: CloudTab,
	uid: string,
	oldShareId: string | null,
	firestore?: FirestoreApi
) {
	firestore ??= await import('firebase/firestore');
	readCloudTab(tab.id, cloudData(tab));
	const batch = firestore.writeBatch(db);
	batch.set(firestore.doc(db, 'users', uid, 'tabs', tab.id), cloudData(tab));
	if (oldShareId && oldShareId !== tab.shareId)
		batch.delete(firestore.doc(db, 'publishedTabs', oldShareId));
	const { shareId, ...data } = cloudData(tab);
	if (shareId) {
		batch.set(firestore.doc(db, 'publishedTabs', shareId), {
			...data,
			ownerId: uid,
			tabId: tab.id
		});
	}
	await batch.commit();
}
