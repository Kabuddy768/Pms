# Property Management System (PMS)

Multi-tenant SaaS Property Management System built for the Kenyan real estate market (M-Pesa Paybill/STK Push reconciliation, bank/cash tracking, lease & deposit ledgers, maintenance, and reporting).

## Repository Structure

```text
pms/
  AGENTS.md           # Engineering guardrails and conventions
  README.md           # Setup and development commands
  .env.example        # Environment variable template
  backend/            # Django 5.2 LTS + DRF + PostgreSQL modular monolith
  web/                # Next.js + TypeScript + Tailwind (back-office web app)
  mobile/             # Expo + React Native + TypeScript (field & manager app)
  docs/               # Architecture, ERD, Open Decisions, Design System, ADRs
  infra/              # Docker Compose & deployment configs
  .github/            # CI workflows
```

## Quick Start

### 1. Backend (`backend/`)
```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate | Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

### 2. Web (`web/`)
```bash
cd web
npm install
npm run dev
```

### 3. Mobile (`mobile/`)
```bash
cd mobile
npm install
npx expo start
```

## Documentation
- [Architecture](docs/ARCHITECTURE.md)
- [Database ERD](docs/ERD.md)
- [Approved Decisions](docs/OPEN_DECISIONS.md)
- [Design System](docs/DESIGN_SYSTEM.md)
- [Security & Privacy Review](docs/SECURITY_AND_PRIVACY.md)
- [Backup & Restore Runbook](docs/BACKUP_AND_RESTORE.md)
- [Release & UAT Checklist](docs/RELEASE_CHECKLIST.md)
- [ADRs](docs/decisions/)
