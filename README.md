# HearthLedger (Personal/Family Finance Manager)

A lightweight, extensible personal finance web app for individuals and families.

## What it includes
- Multi-profile setup for family members.
- Personal vs merged family spending toggle.
- Expense logging by date, category, and person.
- Built-in essential categories (groceries, rent, insurance, etc.).
- Recurring/autopay charge management (daily/weekly/monthly/yearly).
- Dashboard comparing current month, previous month, and two months ago.
- Category-based spend breakdown and six-month trend view.
- Future roadmap ideas built into the app.

## Run locally
### Option 1: Open directly in browser
Open `index.html` in your browser.

### Option 2: Run with a Python virtual environment (recommended)
Use this option if you want to serve files over `http://localhost`.

1. Create a virtual environment:
   ```bash
   python3 -m venv .venv
   ```
2. Activate the virtual environment:
   - macOS/Linux:
     ```bash
     source .venv/bin/activate
     ```
   - Windows (PowerShell):
     ```powershell
     .venv\Scripts\Activate.ps1
     ```
3. Start the local server:
   ```bash
   python server.py
   ```
4. Open the app in your browser:
   - <http://localhost:8000>

To stop the server, press `Ctrl + C`.

To deactivate the virtual environment when done:
```bash
deactivate
```

Data is stored in `localStorage` under `hearth-ledger-v1`.
