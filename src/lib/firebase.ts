import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const app = initializeApp({
	apiKey: 'AIzaSyD0fKYg55eOfxm-_f5Qcut0MqMQAqJgfwg',
	authDomain: 'basstabs-by-bear.firebaseapp.com',
	projectId: 'basstabs-by-bear',
	appId: '1:727729220569:web:c7fa66d97d19bea9da07c8'
});

export const auth = getAuth(app);
export const db = getFirestore(app);
