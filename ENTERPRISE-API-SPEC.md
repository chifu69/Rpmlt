# RP IA Enterprise API Contract v1

RP IA runs locally by default. To use shared company data, configure `storageMode: server` and provide an HTTPS REST API.

## Required endpoints

### GET `/health`
Returns HTTP 200 and JSON such as:
```json
{"ok":true,"message":"RP IA server ready","version":"1.0.0"}
```

### GET `/storage/{key}`
Returns the JSON value stored for the requested key.

### PUT `/storage/{key}`
Request:
```json
{"value": {}}
```
Returns HTTP 200 after durable storage.

### DELETE `/storage/{key}`
Soft-delete or archive the record. Production systems should preserve audit history.

### POST `/migration/import`
Accepts a local pilot export:
```json
{"exportedAt":"ISO date","mode":"local","records":{"key":{}}}
```
The server must validate permissions, record the migration in its audit log, and return a summary.

## Production requirements
- HTTPS only.
- Company authentication or Microsoft Entra ID.
- Server-side authorization for every write.
- Passwords must never be stored in the PWA or returned by the API.
- Central audit trail, backups, retention, and recovery.
- Validate employee numbers and unique record IDs server-side.
- Use attachment endpoints or company file storage for photos/evidence.

## Recommended database groups
Personnel, Users/Roles, METL Tasks, Subtasks, Assignments, Assessment Sessions, Assessment Results, Corrective Actions, Qualifications, Audit Events, Attachments, Notifications, RP Brain Preferences.
