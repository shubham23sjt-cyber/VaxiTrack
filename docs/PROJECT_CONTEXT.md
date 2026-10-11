# VaxiTrack – Project Context

Condensed from "VaxiTrack Comprehensive Project Documentation" (PDF, May 2026, draft for review).
This is the requirements reference for the codebase. The "Implementation notes" section at the end records where the code currently differs from or extends the spec.

## 1. Overview

Cross-platform mobile app (Flutter or React Native) that digitises the newborn vaccination process for India (UIP / IAP schedule). It connects **Hospital Receptionists, Doctors and Parents**. Problem: paper-based scheduling leads to missed doses and low parent awareness. Solution: central digital records, automated 3-day advance notifications, online slot booking.

Planned stack: Node.js (Express) or Django REST + PostgreSQL, Redis (cache / queue), Firebase Cloud Messaging, AWS S3, Docker + GitHub Actions, hosting on AWS EC2 / GCP Cloud Run + RDS. Scheduler: node-cron / Celery Beat.

## 2. Requirements

### Roles and features
- **Doctor:** hospital-issued login; create baby profile (name, DOB, blood group, parent info, birth weight, gender, ward); auto-generate vaccination schedule from DOB; mark vaccines administered with notes; view upcoming appointments; PDF reports.
- **Receptionist:** dashboard of babies sorted by nearest vaccination date (red = today/overdue, amber = this week, green = upcoming); send manual in-app/SMS alerts to parents; acknowledge and notify doctor; manage daily slot schedule; check in arriving parents.
- **Parent:** credentials (username + temporary password) created by the doctor; view baby's schedule/history; push notification 3 days before each due date; book / reschedule / cancel slots; view doctor and hospital contacts; booking confirmations; baby health summary.

### Permission matrix
| Feature | Doctor | Receptionist | Parent |
|---|---|---|---|
| Create / edit baby profile | ✔ | ✘ | ✘ |
| View vaccination schedule | ✔ | ✔ | ✔ |
| Mark vaccine administered | ✔ | ✘ | ✘ |
| Book / cancel slots | ✘ | ✘ | ✔ |
| View upcoming appointments | ✔ | ✔ | ✔ |
| Send manual alerts | ✘ | ✔ | ✘ |
| Acknowledge doctor (alert) | ✘ | ✔ | ✘ |
| Receive push notifications | ✘ | ✘ | ✔ |
| Download PDF report | ✔ | ✔ | ✔ |
| Manage slot availability | ✔ | ✔ | ✘ |

### Non-functional
API < 2 s; 10,000 concurrent users; 99.5 % uptime; JWT + HTTPS/TLS + bcrypt + RBAC; WCAG 2.1 AA; English / Hindi / Gujarati (i18n); parent can view cached schedule offline; DPDP Act 2023 compliance.

## 3. Architecture
3-tier: mobile client → REST API → PostgreSQL / Redis / FCM / S3. JWT access token 1 h + refresh token 30 d (rotated on every use). Axios/Dio client. State: Provider/Riverpod (Flutter) or Redux Toolkit (RN).

## 4. Core database tables
- `users` (id, name, email, phone, password_hash, role, hospital_id, created_at)
- `babies` (id, full_name, date_of_birth, gender, blood_group, birth_weight_kg, ward_number, doctor_id, parent_id, created_at)
- `vaccines` – master list: vaccine, recommended age, dose info
- `vaccination_schedule` (id, baby_id, vaccine_id, due_date, status pending/administered/missed, administered_date, notes, notified_3day)
- `available_slots` – doctor/receptionist managed (date, time, capacity)
- `slot_bookings` (id, schedule_id, slot_id, parent_id, status confirmed/cancelled/completed, booked_at)
- `notifications` – log: type, sent_at, status sent/failed/read
- `hospitals` (see §16)

## 5. API (prefix `/api/v1`, Bearer JWT, envelope `{ success, data, message, errors }`)

**Auth:** POST `/auth/login` (public), POST `/auth/refresh` (public), POST `/auth/logout`, POST `/auth/change-password`.

**Babies:** POST `/babies` (Doctor), GET `/babies` (Doctor/Recept, paginated), GET `/babies/:id` (all), PUT `/babies/:id` (Doctor), GET `/babies/:id/report` (Doctor/Parent, PDF).

**Schedule:** GET `/babies/:id/schedule` (all), GET `/schedule/upcoming` (Doctor/Recept), PATCH `/schedule/:id/administer` (Doctor), GET `/schedule/due-soon` (Recept, next 7 days).

**Slots / bookings:** GET `/slots` (all, by date), POST `/slots` (Doctor/Recept), POST `/bookings` (Parent), GET `/bookings/mine` (Parent), PATCH `/bookings/:id/cancel` (Parent), PATCH `/bookings/:id/complete` (Doctor/Recept).

**Notifications:** GET `/notifications/mine`, PATCH `/notifications/:id/read`, POST `/notifications/alert` (Receptionist → parent).

## 6. Screens
- **Doctor:** login, dashboard, baby registration, baby list, baby profile timeline, administer vaccine, slot management, reports.
- **Receptionist:** login, colour-coded dashboard, alert detail (notify doctor), daily appointments / check-in, manual notification.
- **Parent:** login, baby summary, schedule timeline (pending/done/missed), book slot (calendar), my appointments, notification centre, settings.

## 7. Notification system
- Daily cron at **08:00 local** selects `vaccination_schedule` rows with `due_date = today + 3` and `notified_3day = false`, fetches the parent's FCM token, queues a push, logs status `sent`, sets `notified_3day = true`.
- If FCM fails after 2 retries → SMS via Twilio / MSG91.
- Types: 3-day reminder (parent, push + SMS), slot booked / cancelled (parent, push), manual alert (parent, push + SMS), doctor alert (doctor, push), appointment check-in (receptionist, in-app).

## 8. Security
JWT 1 h + HTTP-only refresh 30 d with rotation; bcrypt ≥ 12 rounds; RBAC (doctors cannot access other hospitals' data); TLS 1.3 + certificate pinning; AES-256 at rest for phone/email; server-side validation + parameterised queries; rate limit 100 req/min per user and 20 login attempts/hr; audit log of all mutations; DPDP: minimal data, right to deletion, parental consent recorded at registration.

## 9. Timeline (original estimate 12–13 weeks)
1 Planning (1w) → 2 Backend + auth (1w) → 3 Baby & schedule module (1.5w) → 4 Slot booking (1w) → 5 Notification engine (1w) → 6 Mobile doctor/receptionist UI (2w) → 7 Mobile parent UI (1.5w) → 8 Testing (1.5w) → 9 Deployment & docs (1w).

## 10. Vaccination schedule reference (from the spec appendix)
Based on India's Universal Immunisation Programme; hospitals may customise the master list. Due dates are computed from DOB.

| Age | Vaccines (dose) |
|---|---|
| Birth | BCG; OPV-0; Hepatitis B (1 of 3) |
| 6 weeks | DTP-1; IPV-1; Hib-1; Rotavirus-1; PCV-1 |
| 10 weeks | DTP-2; IPV-2; Hib-2; Rotavirus-2 |
| 14 weeks | DTP-3; Hib-3; PCV-2 |
| 9 months | MCV-1 (measles); Meningococcal |
| 12 months | Hepatitis A (1 of 2) |
| 15 months | MMR (1 of 2); Varicella (1 of 2) |

## 11. Nearby Vaccination Centre (out-of-city)
Parent away from home city taps "Find centre near me" (from the 3-day reminder or schedule screen). GPS (fallback: city/pincode search) shows partner hospitals + govt PHC/CHC centres within 5/10/25/50 km (default 10). Pins: green = slots available, orange = limited, red = full. Parent books a slot → unique **Transfer Booking ID** and a secure read-only **transfer token** lets the visiting doctor view history; they mark the vaccine administered and the record syncs to the home hospital (shown as "Administered at [Centre]" / "Transferred"). Home doctor and receptionist are notified.

- Tables: `vaccination_centers` (name, address, city, pincode, phone, latitude, longitude, type partner_hospital/govt_phc/govt_chc/clinic, working_hours, is_active, vaccines_available[]); `transfer_bookings` (schedule_id, center_id, parent_id, slot_id, transfer_token unique, status pending/confirmed/administered/cancelled, booked_at, administered_at, notes); `vaccination_schedule.transfer_booking_id` (nullable FK).
- API: GET `/centers/nearby` (lat, lng, radius_km, vaccine_id), GET `/centers/search`, GET `/centers/:id`, GET `/centers/:id/slots`, POST `/transfer-bookings`, GET `/transfer-bookings/:token` (visiting doctor, read-only), PATCH `/transfer-bookings/:id/administer`, PATCH `/transfer-bookings/:id/cancel`, GET `/transfer-bookings/mine`.
- Tech: PostGIS (`ST_DWithin`, GIST index), Google Maps SDK + Geocoding, Google Maps deep-link for directions, NHM data / CSV import for govt centres, 24 h offline cache.

## 12. Baby Growth Tracker
Doctor logs weight, height/length, head circumference per visit; plotted on WHO growth standards with green / yellow / red alerts; parent sees charts; exportable in the PDF; milestone checkup reminders at 2, 4, 6, 9, 12, 18, 24 months.
- Table `baby_growth_records` (baby_id, recorded_by, recorded_at, weight_kg, height_cm, head_circumference_cm, percentile_weight, percentile_height, notes).
- API: POST `/babies/:id/growth` (Doctor), GET `/babies/:id/growth`, GET `/babies/:id/growth/chart`.

## 13. Multi-baby (twins / siblings)
One parent account links to many babies; baby switcher on the parent home; independent schedules / growth / bookings per baby; notifications name the baby ("Rohan's DTP-2 is due in 3 days"); doctor registers twins in one flow; parent can book several babies on the same day; view `parent_babies_summary` (name, DOB, next due vaccine, upcoming slot).

## 14. Doctor–Parent chat
Text-only in v1 (images in v2), linked to a baby profile; doctor unread badge; push on new message; doctor can mark a conversation resolved; receptionist can send informational messages; real-time via WebSocket (Socket.io) with 10 s HTTP polling fallback; content AES-256 encrypted.
- Table `messages` (baby_id, sender_id, receiver_id, content, is_read, sent_at, status sent/delivered/read).
- API: POST `/messages`, GET `/messages/conversations`, GET `/messages/conversations/:baby_id`, PATCH `/messages/:id/read`, PATCH `/messages/conversations/:baby_id/resolve` (Doctor).

## 15. Vaccine side-effect reporting
24 h after administration parent gets "How is your baby doing?"; chooses from fever, redness, swelling, irritability, loss of appetite, rash, vomiting; rates Mild / Moderate / Severe (severe shows an urgent warning and alerts the doctor); doctor reviews; Super Admin sees anonymised aggregates.
- Table `side_effect_reports` (schedule_id, baby_id, reported_by, reported_at, side_effects[], severity, notes, doctor_reviewed).
- API: POST `/side-effects` (Parent), GET `/side-effects/baby/:id` (Doctor), GET `/side-effects/severe` (Doctor/Admin), PATCH `/side-effects/:id/reviewed` (Doctor).

## 16. Super Admin panel (web)
Manage hospitals (approve / suspend / delete), view all doctors and receptionists, platform stats, monitor severe side effects, manage the vaccines master list and centres directory, platform-wide announcements, system health, CSV/PDF exports.
- Table `hospitals` (name, address, city, pincode, phone, email, registration_no, status pending/verified/active/suspended, onboarded_at, admin_notes).
- API: GET `/admin/hospitals`, PATCH `/admin/hospitals/:id/status`, GET `/admin/users`, GET `/admin/stats`, GET `/admin/side-effects/severe`, POST `/admin/vaccines`, PUT `/admin/vaccines/:id`, POST `/admin/announcements`.

## 17. Analytics
- **Doctor/hospital:** babies registered, on-time compliance %, upcoming 7/14/30 days, missed/overdue list, common side effects, slot utilisation.
- **Receptionist:** today's appointments and check-in rate, overdue babies by days overdue, transfer bookings, manual alerts this week.
- **Super Admin:** totals, 12-month vaccination trend, city/state coverage heatmap, top 10 hospitals by compliance, FCM vs SMS delivery rate, severe side-effect trend, new hospitals per month.
- Tech: PostgreSQL materialised views refreshed every 6 h; fl_chart / Victory Native on mobile; React + Recharts for admin.

## 18. Catch-up schedule for missed vaccines
A dose becomes `missed` 7 days after its due date. The system proposes a catch-up plan per IAP guidance (combined plan if several are missed), notifies doctor and parent, doctor can accept or adjust; catch-up doses are shown in orange on the timeline and kept in the health report.

Rules in the spec: BCG after 1 year – doctor decides; OPV under 5 y – resume, no restart; DTP gap > 6 months – continue, don't restart; MMR missed at 9 m – give ASAP, ≥ 4 weeks before dose 2; Hep B – resume, never restart; Rotavirus after 8 months – do not give; PCV – follow IAP interval table.
- API: GET `/babies/:id/catchup` (Doctor/Parent), POST `/babies/:id/catchup/accept`, PUT `/babies/:id/catchup`, GET `/schedule/missed` (Doctor/Recept).

## 19. Hospital onboarding & verification
Flow: hospital self-registers on web portal → uploads registration certificate, GST certificate, proof of address (S3) → Super Admin approves / requests info / rejects → hospital `verified`, welcome email with Hospital ID → hospital admin creates doctor and receptionist accounts (temporary credentials by email) → go live (appears in centre directory).
- Table `onboarding_requests` (hospital_name, registration_no, contact_email, contact_phone, address, documents_url JSONB, status submitted/under_review/approved/rejected, submitted_at, reviewed_by, reviewed_at, rejection_reason).
- API: POST `/onboarding` (public), GET `/onboarding/:id/status` (public), GET `/admin/onboarding`, PATCH `/admin/onboarding/:id/approve`, PATCH `/admin/onboarding/:id/reject`, POST `/admin/onboarding/:id/request-info`.

---

## Implementation notes (code vs spec)
Keep this section current as the code evolves.

- **Backend:** NestJS 11 + Prisma 6 + PostgreSQL in `backend/`. Mobile and admin web clients are not started.
- **Done:** Prisma schema for the core tables (hospitals, users, refresh/device tokens, babies, vaccines, schedule, slots, bookings, notifications); auth module (login by email *or* username, refresh-token rotation with replay detection, logout, change-password); global JWT + roles guards, response envelope, validation.
- **Additions beyond the spec's tables:** `Role` also has `SUPER_ADMIN` and `HOSPITAL_ADMIN`; `users.username`, `must_change_password`, `language`, `is_active`; `refresh_tokens` and `device_tokens` tables; `babies.hospital_id`; `slot_bookings.checked_in_at`; `vaccines` has dose number, age offset in days, min interval and max age; schedule status also has `TRANSFERRED`, plus `is_catch_up`.
- **Not started:** babies / schedule module and schedule generator, slots and bookings, notifications + cron, and sections 11–19.
