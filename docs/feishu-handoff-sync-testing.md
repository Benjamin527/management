# Feishu handoff sync transaction testing

The transaction integration test must run only against a dedicated, disposable MySQL database. Never point `HANDOFF_TEST_DATABASE_URL` or `DATABASE_URL` at a production, staging, or shared developer database: the test creates and deletes rows and resets the singleton handoff-sync lease.

## Create and migrate a temporary database

Create an isolated database with a MySQL account that has access only to test resources. Replace the host, user, password, and database name below with test-only values.

```sh
mysql -h 127.0.0.1 -u root -p -e "CREATE DATABASE handoff_sync_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
export HANDOFF_TEST_DATABASE_URL='mysql://test_user:test_password@127.0.0.1:3306/handoff_sync_test'
DATABASE_URL="$HANDOFF_TEST_DATABASE_URL" npm run prisma:migrate --workspace=api
```

## Run the integration test

From the repository root:

```sh
npm run test --workspace=api -- handoff-sync.transaction.int-spec.ts --runInBand
npm run test --workspace=api -- handoff-profiles.concurrent.int-spec.ts --runInBand
```

The concurrency suite verifies that two manual-link targets cannot overwrite
each other and that synchronization cannot overwrite a committed manual link
from a stale snapshot.

The suite stays skipped during local unit-test runs when `HANDOFF_TEST_DATABASE_URL` is absent. In CI, `CI=true` without that variable is a configuration error and the suite fails with an explicit message rather than silently skipping transaction coverage.

## Tear down

After the test completes, remove the disposable database:

```sh
mysql -h 127.0.0.1 -u root -p -e "DROP DATABASE handoff_sync_test;"
unset HANDOFF_TEST_DATABASE_URL
```
