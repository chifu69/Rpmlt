# RP IA Enterprise v9.7 — Clean Assets Release

This maintenance release removes obsolete project artifacts without changing the working application layout or business functions.

## Cleanup completed
- Removed the legacy blue-bird `icon.svg`.
- Removed obsolete architecture, validation, implementation-status, and stability documents from older releases.
- Renamed the active PWA icons to unique Eagle AI filenames so old icon references cannot be reused accidentally.
- Updated HTML, JavaScript, manifest, and service-worker references to the approved Eagle AI assets.
- Rebuilt the service-worker asset list and cache as `rp-ia-v9.7.0-clean-assets`.

## Current branding files
- `eagle-ai-logo.png`
- `rpia-eagle-180.png`
- `rpia-eagle-192.png`
- `rpia-eagle-512.png`

## Deployment
Replace the previous repository contents with every file in this package. An already installed iPhone PWA may retain its old Home Screen icon until the old installation is removed and RP IA is added to the Home Screen again.


## v9.8 Notification-to-Action Fix
- Notifications are generated from the same normalized corrective-action repository used by the Corrective Actions module.
- Every notification carries the exact corrective-action ID.
- Tapping a corrective-action notification opens that record directly for retraining, reassessment, and closure.
- Existing corrective actions missing IDs are repaired locally without deleting history.
