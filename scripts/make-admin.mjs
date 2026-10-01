// Grants admin.html access to a signed-in player, by email, without the manual steps in
// HOW-TO-UPDATE.txt (sign in, copy the UID out of the Firebase console, add it by hand).
//
// One-time setup:
//   Firebase console > Project settings > Service accounts > Generate new private key.
//   Save the file somewhere outside this repo (or as serviceAccountKey.json here - it's gitignored).
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json npm run make-admin -- someone@example.com
//
// The player must have signed in at least once already (guest, email or Google) - this looks
// their account up by email, it doesn't create one.
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const email = process.argv[2];
if (!email) {
  console.error('Usage: GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json npm run make-admin -- someone@example.com');
  process.exit(1);
}
const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!keyPath) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to your downloaded service account key first.');
  process.exit(1);
}

initializeApp({ credential: cert(keyPath) });
const user = await getAuth().getUserByEmail(email);
await getFirestore().collection('admins').doc(user.uid).set({ name: user.displayName || email.split('@')[0], email, addedAt: new Date() });
console.log(`${email} (${user.uid}) can now sign in to admin.html.`);
