# Rollback procedure

Rollback changes routing only. It must not delete the VPS database, backups,
containers, or the previous Railway/Worker production environment.

1. Declare the incident and stop nonessential writes if data divergence could occur.
2. Restore each affected hostname to the exact DNS/Worker state in the pre-cutover snapshot, in reverse cutover order: apex, `www`, API, admin, operations.
3. Confirm the old Railway `/healthz` endpoint and Worker frontends are serving.
4. Run login, read-only catalog, admin, and payment callback smoke tests against the restored environment.
5. Keep the VPS stack running but remove public tunnel routes, or stop only `cloudflared`:

   ```bash
   docker compose --env-file .env -f compose.yml --profile cutover stop cloudflared
   ```

6. Export and encrypt the VPS database before any reconciliation if it accepted writes.
7. Compare orders, payments, settlements, tickets, and account changes made after cutover. Reconcile explicitly; never overwrite either database blindly.
8. Record the cause, timestamps, affected transactions, and remediation before another cutover.

Do not delete Railway, existing Workers, DNS snapshots, migration dumps, or
encrypted backups as part of rollback.
