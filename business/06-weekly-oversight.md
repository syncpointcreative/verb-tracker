# Weekly 2-Hour Oversight Protocol — Syncpoint AI

**When:** Every Monday, 8:00–10:00am  
**Total time:** ~2 hours (drops to 90 min by month 4 as systems mature)

---

## Your Monday Dashboard

Build this as a single Notion page or Google Sheet. One row per client. Review top-to-bottom.

| Client | Calls This Week | Bookings | Transfers | Flags | Monthly Revenue | Status |
|---|---|---|---|---|---|---|
| Practice A | 47 | 12 | 3 | 0 | $697 | ✅ |
| Practice B | 31 | 8 | 5 | 1 | $697 | ⚠️ Review flag |

**Pull this data from:** Bland AI dashboard → each agent → call logs

---

## The 2-Hour Block, Minute by Minute

### Block 1: Exception Review (0:00–0:30)

Review any call flagged by the agent. Bland AI flags calls when:
- Agent said "I don't know" or hit its limit
- Caller asked to speak to a human
- Call ended abruptly
- Caller described an emergency

**For each flag:**
1. Listen to the 60-second relevant portion (not the whole call unless needed)
2. Categorize: `Training Gap` | `Client Issue` | `No Action Needed`
3. Training gaps → add to that client's knowledge base (takes 2 min each)
4. Client issues (wrong transfer number, scheduling system changed) → email client

**Expected volume:** 0–3 flags per client per week when running smoothly

---

### Block 2: Client Messages + Email (0:30–0:50)

- Reply to any client emails or texts from the past week
- Standard replies take 2–3 minutes each
- If a client is upset: do not rush, use the de-escalation template below

**De-escalation template:**
> "Hi [name], thanks for flagging this. I've reviewed the call and here's what happened: [1-sentence explanation]. I've already updated the agent to handle this differently going forward. Let me know if you'd like to talk through it — happy to jump on a call."

---

### Block 3: Performance Review (0:50–1:10)

For each client, check:
- **Booking confirmation rate:** Are leads from the agent getting followed up by their staff? If a client reports "AI books but patients don't show" → the problem is their staff, not your agent. Address this diplomatically.
- **Call volume trend:** Increasing = practice is growing, agent is working. Decreasing = check if call forwarding is still set up correctly.
- **After-hours ratio:** What % of calls are after-hours? High ratio = your agent is most valuable. Use this in their monthly report as a win.

**Threshold alerts (investigate if you see these):**
- Calls drop >30% week-over-week: call forwarding may have been turned off
- Transfers spike >20% of calls: agent may have a knowledge gap, check flags
- Zero bookings for 3+ days: check if their scheduling link/calendar is broken

---

### Block 4: Weekly Performance Emails (1:10–1:25)

Send each client their weekly summary. Use this template — fill in the numbers (takes 3 min per client once you have the data):

---

**Subject:** {{practice_name}} — Weekly AI Agent Report (Week of {{date}})

Hi {{first_name}},

Here's your Syncpoint AI summary for the week:

📞 **Total Calls Handled:** {{total_calls}}  
📅 **Appointment Requests Captured:** {{bookings}}  
🌙 **After-Hours Calls Answered:** {{after_hours}} ({{after_hours_pct}}% of total)  
🔁 **Calls Transferred to Your Team:** {{transfers}}  

**Highlight this week:** {{one_sentence_win — e.g., "We captured 4 new patient requests on Saturday — your busiest after-hours day."}}

**Action for your team:** {{one_action — e.g., "3 patients are waiting for a callback from Friday evening — these are in your voicemail log."}}

Talk soon,  
Seth | Syncpoint AI

---

> **Automation option (Month 3+):** Use Make.com to auto-pull Bland AI call data into a Google Sheet, then auto-populate and send this email via Gmail. Eliminates this block entirely. Setup takes ~3 hours once.

---

### Block 5: Outreach Queue (1:25–2:00)

Check your Instantly.ai dashboard:
- [ ] Any replies? → Respond and book demo (10 min if any)
- [ ] Any demos this week? → Confirm or follow up
- [ ] Add 10–20 new prospects from your pre-built list → drag into sequence (10 min)
- [ ] Check open rate on last week's emails → if under 30%, swap subject line

**At 8 clients:** You likely don't need new outreach. Pause the sequence and focus on Phase 2 upsells.

---

## Monthly Client Report (Send End of Month, ~30 min total)

More detailed version of the weekly report. Send the Monday after month-end.

**Monthly report includes:**
- Total calls handled (month + trend vs. prior month)
- Estimated revenue recovered (calls handled × assumed conversion rate × avg patient value)
  - Use: 15% conversion rate × $1,500 average new patient value as default
  - Example: 40 after-hours calls × 15% × $1,500 = $9,000 in recovered revenue potential
- Top FAQ categories (shows what patients are asking most)
- Any agent updates made this month
- Optional: recommended upsell ("Based on your call volume, you're ready for the recall campaign add-on — here's what it would do")

---

## What to Do When Something Breaks

### Agent not answering calls
1. Check Bland AI status page (status.bland.ai) — is there a platform outage?
2. Log in, check if agent is still active and not paused
3. Call test number — does it ring through?
4. If all clear on Bland side → call client, check their call forwarding settings
5. If outage: notify client within 30 min with ETA from Bland, offer credit

### Client reports wrong information given
1. Pull the specific call recording (client gives you date/time)
2. Listen to the full call
3. Identify what knowledge was missing or wrong
4. Update the knowledge base or system prompt
5. Respond to client: "Fixed — here's what the agent will say now: [new response]"
6. Always within same business day

### Client wants to cancel
1. Don't panic — ask: "What would need to be different for this to keep working for you?"
2. Common fix: they think the agent is replacing their receptionist (it's not — it's supplementing)
3. Offer: 1 month at 50% while you troubleshoot, or downgrade to after-hours only
4. If they still want to cancel: honor it gracefully, offboard per SOP

---

## KPIs to Track Monthly (Your Business Health)

| Metric | Target (Month 3) | Target (Month 6) |
|---|---|---|
| Active clients | 4–5 | 8–12 |
| Monthly recurring revenue | $2,000–$3,500 | $5,500–$8,400 |
| Avg revenue per client | $697 | $750+ (upsells) |
| Client churn rate | <5%/month | <3%/month |
| Calls handled/client/week | 30–60 | 30–60 |
| Weekly time in business | <3 hours | <2 hours |
