# Client Onboarding SOP — Syncpoint AI

**Goal: Client live within 48 hours of payment. Total your time: 3–4 hours per client.**
*(Drops to 2 hours by your 4th client once you've run the process a few times.)*

---

## Payment & Kickoff (Day 0, ~15 min)

- [ ] Send invoice via Stripe or Wave (setup fee + first month)
- [ ] On payment confirmation, send **Welcome Email** (template below)
- [ ] Create client folder in Notion: `/clients/[practice-name]/`
- [ ] Copy the onboarding intake form link into the welcome email

---

## Welcome Email Template

**Subject:** You're in — here's what happens next

---

Hi {{first_name}},

Welcome to Syncpoint AI! We're excited to get your practice answering every call.

Here's what happens in the next 48 hours:

**Step 1 — Your Intake Form (takes 10 minutes)**
Please fill out this form so we can configure your AI agent correctly:
[Notion form or Typeform link]

**Step 2 — Our Setup Call (30–45 minutes)**
Once we have your intake form, I'll send you a calendar invite for our setup call. On that call we'll:
- Review your agent's script and FAQ responses
- Set up the call transfer to your front desk
- Do a live test call together

**Step 3 — Go Live**
After the setup call, your agent will be live and answering calls. I'll send you the new forwarding number to add to your phone system.

**Your weekly report** will arrive every Monday morning with call volume, bookings, and any calls flagged for your review.

Questions before we get started? Just reply here.

— Seth  
Syncpoint AI

---

## Intake Form (Typeform or Notion — embed these fields)

1. Practice name (as you want the agent to say it)
2. Full address + parking/directions notes
3. Office hours (all days, including holiday hours if known)
4. Services offered (list top 6–8)
5. Insurance plans accepted
6. Practice management software (Dentrix / Eaglesoft / Open Dental / Curve / Other)
7. Name to use for the AI agent ("our front desk assistant" or a name)
8. Transfer number for "speak to a human" requests
9. Emergency after-hours number
10. First appointment time each day
11. Average wait for a callback ("we call back within ___")
12. Anything the agent should NEVER say or promise
13. Any common questions not covered above

---

## Agent Build (Day 1, ~90 min)

- [ ] Log in to Bland AI → duplicate "Dental Practice — Base Template"
- [ ] Rename: "[Practice Name] — Live"
- [ ] Fill in all `{{variables}}` from intake form
- [ ] Build FAQ knowledge base from their website (scrape their services page)
- [ ] Set call hours to match their office schedule
- [ ] Configure transfer numbers
- [ ] Set voicemail script
- [ ] Configure call recording ON
- [ ] Run all 8 test calls from the testing protocol (see doc 04)
- [ ] Note any issues → fix before setup call

---

## Setup Call (Day 1 or 2, 30–45 min)

**Agenda:**

1. **(5 min)** Confirm intake details — any changes or additions?
2. **(15 min)** Live test call together — call the agent, walk through scenarios
   - "New patient booking"
   - "Question about hours"
   - "I have a toothache"
   - Client picks one random scenario they're worried about
3. **(10 min)** Phone system setup — how to forward calls to the Bland AI number
   - Most VoIP systems (RingCentral, Grasshopper, Google Voice): forward to Bland number after X rings OR after hours
   - Traditional landline: client calls their phone provider, sets up call forwarding
   - If they use a dental-specific phone system: provide the Bland number and step-by-step
4. **(5 min)** Walk through their weekly report format
5. **(5 min)** How to reach you if something's wrong

**Call forwarding options to discuss:**
- **Full forward:** All calls go to AI agent first (agent answers, transfers to human if needed) — best option
- **Overflow forward:** Calls forward to AI only when front desk doesn't answer in 3–4 rings — good entry point for hesitant clients
- **After-hours only:** AI only handles calls outside office hours — easiest sell, lowest disruption

---

## Go-Live Checklist (Day 2)

- [ ] Client has confirmed call forwarding is set up
- [ ] Make one "mystery caller" test call from an outside line to confirm the live path works
- [ ] Send client their **Go-Live Confirmation** email (template below)
- [ ] Set up Monday morning automated report (see doc 06 for format)
- [ ] Add client to your weekly oversight dashboard

---

## Go-Live Confirmation Email Template

**Subject:** Your AI agent is live — here's what to expect

---

Hi {{first_name}},

Your AI agent is officially live and answering calls for {{practice_name}}. 

**What's happening now:**
- Every [after-hours / overflow / all] call is being handled by your agent
- Calls are being recorded and logged
- You'll get your first weekly report this Monday

**If you need to reach me:**
- Urgent issue (agent down, wrong behavior): [your cell or direct email]
- Normal questions: reply to this email — I respond within 4 hours on business days

**Your agent's log:** [Link to Bland AI client dashboard or your reporting sheet]

Looking forward to showing you the results next week!

— Seth  
Syncpoint AI

---

## Ongoing Client Management (Monthly, ~20 min/client)

- [ ] Review call logs for any flagged calls (unusual behavior, complaints)
- [ ] Check booking confirmation rate — are schedulers actually following up?
- [ ] Send monthly summary (see doc 06 for template)
- [ ] Note any FAQ gaps (calls where agent said "I don't know") → update knowledge base
- [ ] Look for upsell signal: high call volume → pitch Tier upgrade or recall campaign add-on

---

## Offboarding (If Client Cancels)

- [ ] Give 30-day notice (built into your terms)
- [ ] Turn off forwarding on their end (client action)
- [ ] Archive call logs to their folder
- [ ] Send "we're sorry to see you go" email with summary of calls handled
- [ ] Deactivate their Bland agent (do not delete — keep 90 days for dispute resolution)
