# HearthLedger (Backend-enabled)

This version includes a real backend persistence layer with:
- Accounts (register/login)
- Session token auth
- Family sharing (invite by email)
- SQLite database persistence across restarts/devices/users
- Transactions + recurring charges stored server-side

## Run
```bash
python3 server.py
```
Then open: `http://localhost:8000`

## Database
- SQLite file: `hearthledger.db`
- Data persists independently of browser localStorage.
