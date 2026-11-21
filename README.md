<<<<<<< HEAD
# Alpha Sports Club — Sports Club Management System

A unified full-stack sports club platform combining a **Public Club Website**, **Member Portal**, **Staff Back-Office (Front Desk, Bar & KDS, Pro Shop POS/Inventory, CRM, HR & Payroll)**, and **Owner Financial & Executive Dashboard**.

---

## Quick Start

### Prerequisites
- **Python** >= 3.11 (`requirements.txt`)
- **Node.js** >= 20 & **npm** >= 10

### 1. Install, Migrate, Seed & Run
```bash
pip install -r requirements.txt
npm install
npm run setup
npm run dev
```
The Python FastAPI (`uvicorn` on `127.0.0.1:8001`) + Vite (`0.0.0.0:3000`) stack serves the unified app on **`http://localhost:3000`**.
- **Interactive API Docs (FastAPI OpenAPI / Swagger UI):** `http://localhost:3000/api/docs`
- **Health Check:** `http://localhost:3000/api/health`

### Useful Commands
| Command | Purpose |
|---|---|
| `npm run dev` | Start Python FastAPI Uvicorn + Vite dev server on port `3000` (auto-migrates & seeds if DB is empty) |
| `npm run setup` | Run SQLite migrations + deterministic rich seed (`python3 -m backend.seed`) |
| `npm run build` | Build production frontend bundle (`dist/`) |
| `npm start` | Run production FastAPI server serving `dist/` (`NODE_ENV=production python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 3000`) |
| `npm test` | Run `pytest` automated business-rule & FastAPI HTTP test suite |
| `npm run lint` | Run TypeScript type-check (`tsc --noEmit`) |

---

## Demo Login Accounts

All demo accounts use password **`Password@123`** (or click any 1-click role card on `/login`):

| Role | Email | Default Console |
|---|---|---|
| **Owner** | `owner@club.com` | `/staff/owner` (Full access across all consoles) |
| **Manager / HR** | `manager@club.com` | `/staff/owner` (Operations, HR, Payroll, Finance) |
| **Front Desk** | `frontdesk@club.com` | `/staff` (Members, Bookings, Check-In, POS, CRM) |
| **Bar Staff** | `bar@club.com` | `/staff/bar` (Tables, Member Tabs, KDS, Daily Closing) |
| **Shop Staff** | `shop@club.com` | `/staff/shop` (Stock Pool, Restocks, Online Orders) |
| **Member (Gold)** | `member@club.com` | `/member` (Bookings, QR Pass, Shop, Invoices & Tab) |

---

## Route & Module Map

### Public Website
- `/` — Landing page (Sports facilities, plans preview, live club highlights)
- `/plans` — Gold Premier, Silver Club, Junior Academy & Guest comparison + online sign-up
- `/availability` — Live 30-minute staggered court grid (shared across public, member, and staff)
- `/shop` — Pro Shop catalogue with variants, sizes, and pickup/delivery cart checkout
- `/enquiry` — Book a Trial Session (guest checkout) + Enquiry form (creates CRM Lead + Front Desk notification)
- `/login` — Sign in / Join Club / 1-click role demo logins
- `/report/:token` — Shareable read-only Executive Report link (valid 7 days)

### Member Portal (`/member/*`)
- `/member` — Dashboard (membership expiry status, daily booking quota, open bar tab, QR preview, renewal)
- `/member/bookings` — Interactive booking grid + upcoming/past bookings + 4h cancellation credit rule + Friday social play join
- `/member/card` — Printable Digital Membership Card with QR code (`CC-00001`)
- `/member/shop` — Member Pro Shop with automatic tier discount (15% Gold / 10% Silver / 10% Junior)
- `/member/history` — Invoices, bar spend, shop orders, and payment history

### Staff Back-Office & Owner Consoles (`/staff/*`)
- `/staff` — **Front Desk**: Fast member search (name, phone, ID, QR), photo registration with under-18 Junior enforcement, lifecycle freeze/renew, walk-in/phone court booking, attendance check-in, social session creator, counter POS
- `/staff/bar` — **Bar & Cafeteria + KDS**: Floor table management, Menu availability toggle, Kitchen Display System (`NEW → PREPARING → READY → SERVED`), automatic member discount tabs, cash/card/UPI & split payments, printable receipt, daily closing report
- `/staff/shop` — **Shop & Inventory**: Unified stock pool, low-stock threshold alerts, restock purchase orders (auto-records expense), stock movement ledger, online order fulfilment (`PLACED → CONFIRMED → READY → OUT_FOR_DELIVERY → COMPLETED`)
- `/staff/crm` — **Enquiries & CRM**: Kanban & List pipeline (`NEW → CONTACTED → QUOTE_SENT → WON → LOST`), follow-up reminders, notes log, membership quote generator, 1-click convert lead to member
- `/staff/hr` — **HR & Payroll**: Staff directory, shift roster, attendance log, leave request submission & Manager/Owner approval, monthly payroll run + printable payslips
- `/staff/owner` — **Owner Dashboard**: Today / Week / Month / Custom analytics, Recharts revenue/expenses, source & payment breakdown, court utilisation heatmap, top shop/bar items, alerts, CSV export, PDF print, shareable link generator
- `/staff/finance` — **Finance & Settings**: Unified ledger, corporate B2B clients & GST invoices, expenses & accounts payable, GST collected vs input credit, audit log, editable club settings

---

## Business Rules & Assumptions

1. **Currency & Precision:** Indian Rupees (`INR`), stored internally as integer minor units (`paise`, `100 paise = ₹1`) to avoid floating-point rounding errors.
2. **Timezone:** `Asia/Kolkata` (`+05:30` IST) across booking slots, daily quotas, attendance, and reporting windows.
3. **Taxes (GST):** `18%` on Memberships, Pro Shop gear, and Corporate Invoices; `5%` on Bar & Cafeteria food/drinks.
4. **Court Booking Integrity:**
   - 60-minute sessions starting every 30 minutes (`06:00` to `21:30`).
   - Database transaction (`BEGIN IMMEDIATE`) + partial unique index prevent concurrent double-bookings and 30-minute overlap collisions (e.g., `18:30` conflicts with `18:00–19:00`, `19:00–20:00`, and `19:30–20:30`? No, `18:30–19:30` overlaps `18:00–19:00` and `19:00–20:00`, and allows `19:30–20:30`).
   - Maximum `2` active bookings per member per day; cancelling frees the daily slot and issues credit if cancelled `>= 4 hours` before start.
   - Under-18 registrants are automatically restricted to the **Junior Academy** plan.
5. **Simulated Gateways:** Cash, Card, UPI, Online, and Bank Transfer payments are recorded immediately in the `payments` and `transactions` ledger; member reminders are logged to the `notifications` table.
=======
# Final_odoo_hackthon
Event: Odoo × LPU Hackathon 2026  Venue: Lovely Professional University, Jalandhar  Date: 21 November 2026
>>>>>>> 25413921c2c1f24a8219c9de6ae3f19280c20d5b
