#!/usr/bin/env bash
set -o errexit

python -m pip install --upgrade pip
pip install -r requirements.txt
python manage.py collectstatic --no-input
python manage.py migrate

if [ "${SEED_DEV_DATA:-false}" = "true" ]; then
  python manage.py seed_dev
fi
