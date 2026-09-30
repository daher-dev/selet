---
name: gcp-prod-access
description: Authenticate to the selet-prod GCP project from a Claude Code on the web session using the GCP_SA_KEY_B64 env var. Use when you need to read prod Firestore data, Cloud Run logs or revisions, Cloud Build history, or Firebase project info, or when the user mentions prod, production data, logs, or GCP credentials.
---

# Access selet-prod from Claude Code on the web

Web sessions have **no gcloud, no browser login, no ADC**. Instead two env vars are injected:

- `GCP_PROJECT_ID` = `selet-prod`
- `GCP_SA_KEY_B64` = base64 of a service-account JSON key (`claude-code-web@selet-prod.iam.gserviceaccount.com`)

Do not try `gcloud auth login`, `firebase login`, or `gcloud auth application-default login`. They can't work here. Decode the key and point Application Default Credentials at it.

## 1. Set up credentials (every new shell; env vars don't persist)

```bash
# Key goes in the session scratchpad, NEVER in the repo, never printed, never committed
KEY=<scratchpad-dir>/selet-prod-key.json
echo "$GCP_SA_KEY_B64" | base64 -d > "$KEY" && chmod 600 "$KEY"
export GOOGLE_APPLICATION_CREDENTIALS="$KEY"
```

Every Google client library (Python `google-auth`, Node `firebase-admin`) then picks it up automatically. Never `echo`/`cat` the key or the env var. To inspect it, print only `type`, `project_id`, `client_email`.

## 2. What the SA can and cannot do (verified)

Roles: `datastore.user`, `firebase.viewer`, `logging.viewer`, `run.viewer`, `cloudbuild.builds.viewer`.

| Works | Does NOT work |
|---|---|
| Firestore **read and write** (`datastore.user`) | Secret Manager (denied) |
| Cloud Logging read (Cloud Run `selet` service logs) | Firestore export/import |
| Cloud Run services/revisions read (`selet`, us-east4) | Deploying, changing Cloud Run, IAM |
| Cloud Build read | Creating/deleting Auth users, Storage writes |
| Firebase project/App Hosting metadata, Auth/Storage read-ish (`firebase.viewer`) | anything not listed at left |

**Writes hit real production data.** Never write/update/delete in prod Firestore unless the user explicitly asked for that specific change. Prefer read-only scripts (see `scripts/_check-vouchers-prod.ts`). Avoid dumping customer PII (names, phones) into chat; aggregate or count instead.

## 3. Recipes

### Firestore via the repo's Node stack (preferred; same code as `scripts/`)

`node_modules` is missing in a fresh web session: run `npm ci` first. Scripts must refuse `FIRESTORE_EMULATOR_HOST`.

```ts
// scripts/_something.ts  (underscore prefix = throwaway read-only check; delete when done)
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const db = getFirestore(initializeApp({ projectId: "selet-prod" }));
const c = await db.collection("stores/passos/orders").count().get();
console.log(c.data().count);
```
Run: `GOOGLE_APPLICATION_CREDENTIALS=$KEY npx tsx scripts/_something.ts`

Data layout: root `stores/{vila-velha|passos}/…` (orders, cartelas, customers, products, stockItems, finance, …) and `users`. Firestore rules deny all client access; only admin SDK/IAM works.

### Firestore via Python (python3 has google-cloud-firestore preinstalled)

```python
import google.auth
from google.cloud import firestore
creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
db = firestore.Client(project="selet-prod", credentials=creds)
print([c.id for c in db.collections()])
```

### REST APIs (logs, Cloud Run, Cloud Build) with a bearer token

```python
import google.auth, google.auth.transport.requests as r, requests
c, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"]); c.refresh(r.Request())
h = {"Authorization": "Bearer " + c.token}

# Recent errors from the app (Cloud Run service "selet")
requests.post("https://logging.googleapis.com/v2/entries:list", headers=h, json={
  "resourceNames": ["projects/selet-prod"], "pageSize": 20, "orderBy": "timestamp desc",
  "filter": 'resource.type="cloud_run_revision" AND resource.labels.service_name="selet" AND severity>=ERROR'}).json()

# Cloud Run service / latest revision
requests.get("https://run.googleapis.com/v2/projects/selet-prod/locations/-/services", headers=h).json()

# Builds
requests.get("https://cloudbuild.googleapis.com/v1/projects/selet-prod/builds?pageSize=5", headers=h).json()
```

Prod app: Firebase App Hosting → Cloud Run service `selet` in `us-east4`.

## 4. Gotchas

- **Permission checks**: `POST https://cloudresourcemanager.googleapis.com/v1/projects/selet-prod:testIamPermissions` with `{"permissions":[...]}` verifies access without touching data. An unknown permission name returns a 400 for the whole call. Use it instead of probing services blindly.
- **Stay in scope.** Probing services the SA has no role for (Secret Manager, listing Auth users, Storage) was blocked by the auto-mode classifier in testing. Test only what the roles above cover; if the user needs more, ask them to grant a role.
- Outbound traffic goes through the session proxy (`HTTPS_PROXY`); HTTPS and Firestore gRPC both work with no extra config. If TLS fails, see `/root/.ccr/README.md`; never disable verification.
- `403 PERMISSION_DENIED` = missing role, not a bad key. `invalid_grant`/`400` at token refresh = key decode problem (re-check the base64 decode; no trailing junk).
- The env var may be unset if the session's environment wasn't configured with it; say so rather than hunting for other credentials.
- Delete the decoded key when finished (`rm "$KEY"`). It lives only in the ephemeral scratchpad.
