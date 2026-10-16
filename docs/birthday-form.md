# Birthday form API

Two calls. Your server holds the key. The browser form talks to your server, and your server talks to Masulino.

Base URL locally: `http://127.0.0.1:8787`

```
Authorization: Bearer <MASULINO_SITE_KEY>
```

Do not put that key in website JavaScript.

## 1. Which times are free?

```
GET /api/public/birthdays/times?date=2026-11-14&children=8&adults=4
```

`date` is `yyyy-mm-dd`. `children` and `adults` are optional. If you leave them out, the API uses 8 children and 4 adults, the same defaults as the form. Call again when those numbers change.

```json
{ "date": "2026-11-14", "closed": false, "times": ["10:00", "10:30", "11:00"] }
```

`closed: true` means the venue is shut that day. An empty `times` list means no table fits that group.

The form date `dd.mm.yyyy` converts like this:

```js
const [day, month, year] = dateField.split(".");
const date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
```

## 2. Save the form

```
POST /api/public/birthdays
Content-Type: application/json
```

Create `idempotencyKey` once, with `crypto.randomUUID()`, when the form opens. Send that same value again if the request fails and you retry. A double click then returns the original booking (`replayed: true`) instead of a second one.

```json
{
  "idempotencyKey": "8f1c0e2a-7b34-4e5d-9a10-6c2d0e1f4a77",
  "date": "2026-11-14",
  "time": "14:00",
  "package": "comfort",
  "childName": "Mia",
  "childAge": 7,
  "children": 8,
  "adults": 4,
  "adultFlatRate": true,
  "givenName": "Anna",
  "familyName": "Keller",
  "email": "anna@example.test",
  "phone": "015112345678",
  "message": "",
  "referral": ""
}
```

| Form | JSON |
| --- | --- |
| Datum | `date` |
| Zeitfenster | `time` (`HH:mm`, one of the times from call 1) |
| Comfort / Deluxe | `package`: `comfort` or `deluxe` |
| Name des Geburtstagskindes | `childName` |
| Alter | `childAge` |
| Anzahl Kinder | `children` |
| Anzahl Erwachsene | `adults` |
| Getränkeflat & Tischdeko | `adultFlatRate` (`true` or `false`) |
| Vorname / Nachname | `givenName` / `familyName` |
| E-Mail / Telefon | `email` / `phone` |
| Nachricht | `message` |
| Aufmerksam geworden | `referral` |

A saved booking looks like this:

```json
{
  "reference": "MS-AB12CD34EF",
  "date": "2026-11-14",
  "time": "14:00",
  "package": "comfort",
  "children": 8,
  "adults": 4,
  "adultFlatRate": true,
  "pricePerChildMinor": 1480,
  "adultFlatMinor": 1000,
  "totalMinor": 12840,
  "currency": "EUR",
  "payment": "on_site",
  "replayed": false
}
```

Money is in cents. `1480` is 14,80 € per child. `adultFlatMinor` is 2,50 € times the adults (here 4 × 250 = 1000). `totalMinor` is the sum. `payment` is always `on_site`: the family pays at the venue. Show `reference` on the thank-you page.

## Example

```js
const base = process.env.MASULINO_API_URL;
const headers = {
  Authorization: `Bearer ${process.env.MASULINO_SITE_KEY}`,
  "Content-Type": "application/json",
};

export async function freeTimes(date, children, adults) {
  const query = new URLSearchParams({ date, children: String(children), adults: String(adults) });
  const response = await fetch(`${base}/api/public/birthdays/times?${query}`, { headers });
  return response.json();
}

export async function reserveBirthday(form) {
  const response = await fetch(`${base}/api/public/birthdays`, {
    method: "POST",
    headers,
    body: JSON.stringify(form),
  });
  return response.json();
}
```

## When it does not save

| Status | `error` | What to do |
| --- | --- | --- |
| 400 | `validation` | A field is missing or in the wrong shape. Keep the form values. |
| 409 | `conflict` | That time was just taken. `times` lists others that still work. |
| 400 | `idempotency_mismatch` | The same `idempotencyKey` was sent with different answers. Use a new key. |
| 401 | `unauthorized` | The key is wrong. |
| 429 | `rate_limited` | Wait a minute, then retry with the same `idempotencyKey`. |

## Masulino setup

On the API, set `MASULINO_SITE_KEY` and `MASULINO_PUBLIC_VENUE_SLUG`. Give your colleague the key and the base URL through a secret, not through the page source.

Comfort is 1480 cents and Deluxe is 2180 cents, both 120 minutes. Local seed creates them for `masulino-berlin`. On the live database, once:

```sh
MASULINO_PUBLIC_VENUE_SLUG=your-slug pnpm db:birthday-packages
```

That adds the two packages if they are missing. It does not change prices already stored.
