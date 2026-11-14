# Where the data sits

`current-implementation.svg` shows only two things: where the records are stored, and which calls move them. `current-implementation.png` is the same picture. Edit the SVG if the picture changes.

The records sit in Neon, in the EU. The staff browser does not keep them. Vercel does not keep them either. Vercel keeps the keys and the database address, and it runs the API in Frankfurt.

Three calls:

- The staff browser calls `/api` and sends the login cookie.
- The website server, which is not in this project, calls `/api/public/birthdays` and sends a secret key. The web page itself does not make that call.
- A timer would call `/api/cron/outbox`. That timer is not turned on.

The API is the only program that opens the database. It uses three logins on the same Neon database: `masulino_auth` for login data, `masulino_app` for the business records, and `masulino_worker` for waiting jobs. Table changes are run by hand. The live API cannot run them.

On a laptop, the same API uses a local database instead of Neon.
