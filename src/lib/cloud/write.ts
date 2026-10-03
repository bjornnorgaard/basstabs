import {
	collection,
	doc,
	getDocsFromServer,
	increment,
	runTransaction,
	type Firestore
} from 'firebase/firestore';
import { assertUniqueCloudTitle, cloudData, readCloudTab, type CloudTab } from './model';

export async function writeCloudTab(
	db: Firestore,
	tab: CloudTab,
	uid: string,
	oldShareId: string | null
) {
	readCloudTab(tab.id, cloudData(tab));
	await runTransaction(db, async (transaction) => {
		const reference = doc(db, 'users', uid, 'tabs', tab.id);
		const previous = await transaction.get(reference);
		if (!previous.exists() || previous.data().title !== tab.title) {
			// Every create/rename reads and advances this revision, so concurrent title
			// checks retry against the latest library rather than both accepting a name.
			const namesReference = doc(db, 'users', uid, 'cloudState', 'tabNames');
			await transaction.get(namesReference);
			const library = await getDocsFromServer(collection(db, 'users', uid, 'tabs'));
			assertUniqueCloudTitle(
				tab,
				library.docs.map((entry) => readCloudTab(entry.id, entry.data()))
			);
			transaction.set(namesReference, { revision: increment(1) }, { merge: true });
		}
		transaction.set(reference, cloudData(tab));
		if (oldShareId && oldShareId !== tab.shareId)
			transaction.delete(doc(db, 'publishedTabs', oldShareId));
		const { shareId, ...data } = cloudData(tab);
		if (shareId) {
			transaction.set(doc(db, 'publishedTabs', shareId), {
				...data,
				ownerId: uid,
				tabId: tab.id
			});
		}
	});
}
