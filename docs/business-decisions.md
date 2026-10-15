# Business decisions required before a live venue

Production confirmation refuses a fixture rule. `assertCanUsePublishedRule` requires `businessDecisionsConfirmed`, a cancellation policy, and `fixture = false` when `NODE_ENV=production`. Until the rows below are filled in by the operator, the seeded venue stays a demonstration.

Do not invent these values in the client. Write them down here, then publish a new rule through the reservations service.

| Decision | Status | Confirmed value |
| --- | --- | --- |
| Legal name and location of the venue | Open | |
| IANA timezone | Proposed `Europe/Berlin` | |
| Opening hours per weekday | Proposed in seed data | |
| Party sizes, table combinations, and adult seating | Proposed | |
| Package names, durations, and prices in euro cents | Proposed | |
| Deposits | Not collected. No card data exists | |
| Cancellation wording and deadline | Open | |
| Guest edits | Phone and notes only. Date, party size, package, email, and cancellation stay with staff | |
| Marketing consent | Separate from a booking. Withdrawal wins | |
| Campaign pause and inactivity window | Not approved. The 14-day and 60-day figures are copy | |
| Weather or discount campaigns | Not approved. No forecast is connected | |
| Loyalty earn and redeem rates | Proposed. No euro value and no retention period | |
| Working-time and break rules | Fixture warnings are not a statement of German working-time law | |
| Payments and Ready2Order | Not connected. Booked value, payments, sales, and refunds stay separate | |

`businessDecisionsConfirmed` may be set only after this table is filled by someone who can speak for the venue. A coding agent must not set it to make a screen succeed.
