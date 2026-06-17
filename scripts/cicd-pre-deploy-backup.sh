#!/usr/bin/env bash
# Pre-deploy pg_dump + email backup is disabled. RDS automated backups (7 days) remain enabled.
echo "SKIP  pre-deploy database backup (disabled)"
exit 0
