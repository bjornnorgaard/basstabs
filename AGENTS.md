# Repository agent instructions

## Firestore changes are the agent's deployment responsibility

GitHub Actions builds and releases the web client but does **not** deploy
Firestore rules or indexes. Do not add Google federation or CI deployment
credentials unless explicitly requested. The agent implementing a change must
ensure the required Firebase updates are validated, deployed, and applied
**before pushing changes that depend on them**. Do not leave this as a reminder
for the user after pushing.

The app uses Firebase project `basstabs-by-bear`, database `(default)`.
Test and production clients share this project, so rules deployments affect
both immediately. Use `demo-basstabs` only for emulator tests, never as the
deployment target.

Before pushing a change to cloud storage, sharing, permissions, document
schemas/paths, queries, or Firestore rules/indexes:

1. Review [firestore.rules](./firestore.rules),
   [firestore.indexes.json](./firestore.indexes.json), and the affected client
   operations. Determine whether the deployed rules/indexes need updating.
   If they do, update the repository definitions and relevant tests together.
2. Check compatibility with the currently running test and production clients.
   Do not deploy restrictive rules that break them before the new client exists.
   Use a staged backward-compatible rollout; if that is not possible, stop and
   explain the required rollout decision.
3. Run `npm run test:rules` for rules-dependent changes. This runs Firestore
   rules and cloud integration tests using an emulator; Java 21 or newer is
   required. Also run the relevant client tests and type checks.
4. Deploy only the required Firebase surfaces using the authenticated local
   Firebase CLI:

   ```sh
   npx --no-install firebase deploy --project basstabs-by-bear --only firestore:rules --non-interactive
   ```

   If indexes also changed, use `--only firestore:rules,firestore:indexes`
   (or `--only firestore:indexes` for index-only changes). Review index removals
   before deploying; do not force destructive changes.

5. Verify the command succeeded and Firebase explicitly confirmed rules were
   compiled and released to `cloud.firestore`. For changed indexes, verify
   they have finished building before releasing queries that require them.
   A local edit, passing emulator test, or Git push is **not** proof that rules
   are applied. If unchanged definitions are already deployed, confirm that
   rather than claiming a deployment occurred.
6. Only then push the dependent client changes. Include the Firebase target and
   deployment verification in the completion summary.

If authentication is missing, run `npx firebase login` only when an interactive
login is available; otherwise ask the user to authenticate securely. If tests,
deployment, or application verification fail, **do not push rules-dependent
changes**. Report the blocker explicitly. Never commit credentials, expose
login tokens, or relax rules to blanket public access to bypass failures.

For example: adding a new owner-only coordination document requires updating
and deploying its access rules before pushing the client that writes it.
Deploying that client first and asking the user to fix permission errors later
is not acceptable.
