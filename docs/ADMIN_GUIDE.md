# Blossom Square admin — staff guide

The admin is at **https://blossomsquare.online/admin**. Sign in with your email and password. Owners, super admins, managers and finance also enter a 6-digit code from their authenticator app.

You only see the menu items your role allows. If something you need is missing, ask a manager to change your role. Nobody can change their own.

| Role | What it's for |
| ---- | ------------- |
| Owner / Super admin | Everything, including appointing staff and approving refunds |
| Manager | Runs the hotel: bookings, rooms, rates, offers, website, team (not refund approval) |
| Finance | Payments, refunds (request and approve), reports |
| Receptionist | Bookings, guests, desk payments, housekeeping, enquiries |
| Content editor | Website text and photos, room descriptions and photos, reviews |
| Housekeeping | Room status, cleaning tasks, repair reports |

## Every morning (front desk)

1. Open **Today**: arrivals, departures, in-house guests and requests waiting.
2. **New website bookings** arrive as *pending*. Call the guest, then press **Confirm** on the booking. They receive a confirmation email.
3. **Payments → To verify**: guests who reported a bank, bKash or Nagad transfer. For each:
   - check that the money is in the bank statement or merchant app (same amount and transaction ID);
   - then **Confirm received**, which issues a receipt and emails the guest;
   - or **Not received**, with a reason the guest will see.
4. **Guest messages → Needs attention**: emails that failed or weren't sent. Fix the guest's email on the booking if needed, then **Resend**.

## Taking a walk-in or phone booking

**Bookings → New booking:**

1. Choose the dates and the room type. You'll see how many are free.
2. Enter the guest's name and phone.
3. Choose *Walk-in* or *Phone*.
4. Tick *Confirm now* if they've agreed.
5. Press **Create booking**.

The price comes from Rooms & rates, including any season, offer, VAT and service charge.

## Check-in

1. Open the booking.
2. In **Room**, choose a room. Only free, in-service rooms of the right type are allowed.
3. Press **Check in**. This works from the arrival date onwards.

## Payments at the desk

On the booking, press **Record payment**. The amount defaults to the balance. Choose the method (cash, card, bKash, Nagad, bank) and add the slip or transaction number.

- A receipt number is issued straight away: **Payments → Receipt** prints it.
- **Invoice** (top of the Payments panel) prints the full itemised invoice.
- *Void* is only for a payment entered by mistake.
- **Refunds:**
  1. Someone asks for one with **Request refund**.
  2. A different person with refund approval approves or rejects it.
  3. After paying it back, they press **Mark paid out**.

## Check-out

1. Record any balance.
2. Press **Check out**. You're warned if money is still due.

The room turns *Dirty* and an urgent cleaning task appears for housekeeping.

## Housekeeping

Open **Housekeeping**:

- **Room cards:** tap *Cleaning* when you start a room, then *Clean*. A supervisor taps *Inspected* when it's ready to sell. Marking a room clean or inspected also ticks off its cleaning task.
- **Tasks:** *Mine & unassigned*, with **Start** and **Done** buttons. Front desk can assign tasks to a person.
- **Report a problem:** describe the fault and tick *Urgent* if the room can't be used. Maintenance managers are told straight away. A manager can then block the room or take it out of service in Rooms & rates.

## Rooms, rates and offers (managers)

- **Rooms & rates:**
  - weekday and weekend prices, and *Bookable online*;
  - add or rename rooms (room numbers);
  - take a room out of service;
  - maintenance blocks by date.
- **Room type → Details:** name, beds, occupancy, features, description, photos. Seasonal rates are on the same page.
- **Offers:** percentage or fixed-amount discounts. Choose the room types and dates, with or without a promo code. *Combinable* offers add up; the hotel-wide maximum discount is in Settings.
- **Settings:**
  - VAT %, service charge %, advance %, cancellation and children policies;
  - **Ways to pay** (pay at hotel, bank transfer, bKash or Nagad send-money, and online gateways once connected).

## Website content (content editors and managers)

- **Website content:** each page section.
  1. Edit the text, then **Save draft**.
  2. Use **Preview** to check how it looks.
  3. Press **Publish** to make it live.
  **History** brings back an earlier version.
- **Photos:**
  - upload in **Media** or on a page section;
  - photos are resized automatically;
  - **Replace** swaps an image everywhere it's used;
  - an image still in use can't be deleted.
- **Room descriptions and photos:** open **Rooms & rates → Details** for a room type.
  - Content editors can change the one-line description, full description, features, view and photo order. Name, beds, occupancy and prices are set by a manager.
  - Use the arrows to reorder photos; the first is the cover.

## Team (managers and owners)

**Team:**

- **Invite** someone by email with a role. They set their own password from the email.
- **Change role** of anyone below your own rank.
- **Revoke access** signs the person out at once.

**Activity log** shows who changed what and when.

## Reports and reconciliation (managers, finance, owner)

- **Reports:** occupancy, revenue, ADR and RevPAR by period and channel, with export.
- **Payments → Reconciliation:**
  - for a date range, the money received per method (compare with the bank statement, merchant apps and cash drawer);
  - a list of things to look into: unchecked transfers, refunds owed on cancelled bookings, overpayments, refused online notifications.

## If something goes wrong

| You see | Do this |
| ------- | ------- |
| "Your role doesn't allow this" | Ask a manager |
| "Confirm it's you with your authenticator app" | Sign out and in again, then enter the code |
| "That room is already given to another guest…" | Choose another room; the system prevents double-booking |
| "The price for these dates has just changed" (guest) | The guest reviews the new total and confirms again |
| A guest says they paid but it isn't showing | Check **Payments → To verify**; if it's not there, ask for the transaction ID and record it at the desk |
| Emails show *Not set up* | Email delivery isn't connected yet. Call or WhatsApp the guest; resend once it's connected |
