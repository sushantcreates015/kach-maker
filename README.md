# Professional Secure Access Bundle

## What this version adds
- Professional user login page
- Separate professional admin login page
- Hidden admin route (not shown on user login page)
- SQLite database
- Hashed passwords with bcrypt
- Device limit per user
- Time limit that starts only after first successful login
- Admin dashboard to create / update users
- Remove device / reset timer / extend access / enable or disable user
- Anti-copy deterrents + watermark on protected pages

## Important truth
No website can be made **100% impossible to copy** once a user is allowed to view it in a browser.
This build makes copying **harder** by:
- requiring server-side login
- not exposing protected pages without auth
- adding watermark with user id
- blocking common copy shortcuts and right click
- disabling cache on protected routes

But a determined user can still use screenshots, devtools, or network inspection.

## Setup
```bash
npm install
cp .env.example .env
# edit .env and change all secrets / paths
npm start
```

## Open
- User login: `http://localhost:3000/`
- Admin login: use the secret `ADMIN_LOGIN_PATH` from `.env`

## How to create user IDs
1. Open your secret admin login URL
2. Log in with `ADMIN_USERNAME` and `ADMIN_PASSWORD`
3. In dashboard, fill:
   - User ID
   - Password
   - Max devices
   - Allowed hours
4. Save user
5. Share only that user ID and password with your client

## Time limit behavior
- Creating the user does **not** start the clock
- The clock starts only on the user's **first successful login**
- If you click **Reset Window**, the timer is cleared and will start again on the next login

## Your original files
Put your extra assets (images, css, fonts, js, icons, manifest, etc.) in the `public/` folder if your HTML needs them.
The protected HTML pages are in `protected/`.
