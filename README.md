# ReClaim – Member 1 (Lost & Found Reporting)

A beginner-friendly project using HTML, CSS, Vanilla JavaScript, Python Flask and MongoDB Atlas.

## Features
- User registration and login with hashed passwords and JWT authentication.
- Create LOST and FOUND reports.
- Upload PNG/JPG/JPEG/WEBP item photographs (maximum 5 MB).
- Store photographs in MongoDB GridFS so teammates can retrieve them through the same backend.
- Browse open reports and filter by report type/search text.
- View the logged-in user's reports.
- Shared REST API for Member 2's matching module.

## 1. Requirements
- Python 3.10 or newer
- MongoDB Atlas account and database user
- Internet connection for Atlas access

## 2. Create and activate a virtual environment
Open a terminal in the `ReClaim` project root.

Windows PowerShell:
```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Windows Command Prompt:
```cmd
py -m venv .venv
.venv\Scripts\activate.bat
```

macOS/Linux:
```bash
python3 -m venv .venv
source .venv/bin/activate
```

## 3. Install packages
```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
```

## 4. Configure environment
Copy `.env.example` to `.env` in the project root. Put your Atlas connection URI in `MONGO_URI`, set `DB_NAME=reclaim_db`, and create a long random `JWT_SECRET` (at least 32 characters). URL-encode special characters in the Atlas database password (for example `@` becomes `%40`). Never commit `.env` to GitHub.

## 5. Configure Atlas network access
In Atlas, add the public IP address of the computer running the backend under Network Access. The Atlas database user must have read/write access to the database. Do not use the Atlas website login as the database username.

## 6. Run the app
From the project root, with `.venv` activated:
```bash
python run.py
```
Open http://127.0.0.1:5000 in your browser. Do not open the HTML files directly or use a separate static Live Server; Flask serves the frontend and API from the same origin.

Check http://127.0.0.1:5000/api/health to confirm the backend can reach Atlas.

## Member 2 API contract
All item API routes below require `Authorization: Bearer <JWT>`.

- `GET /api/items?reportType=LOST&status=OPEN` – get open lost reports.
- `GET /api/items?reportType=FOUND&status=OPEN` – get open found reports.
- `GET /api/items` – get reports (up to 200, newest first).
- `GET /api/items/<item_id>` – get one report.
- `GET /api/items/my-reports` – get the current user's reports.

The item response includes `_id`, `userId`, `reportType`, `itemName`, `category`, `description`, `color`, `location`, `date`, `imageUrl`, `status`, `createdAt`, and `updatedAt`. Member 2 must save the actual `_id` as `lostItemId` or `foundItemId` in a match document. Image URLs are served by this same Flask backend.

Create a report with `POST /api/items` using `multipart/form-data` fields `reportType`, `itemName`, `category`, `description`, `color`, `location`, `date`, and `image`.

## Important team integration notes
- Use one shared Atlas database and one deployed backend/API base URL for the team when you move beyond local development.
- Each teammate's computer must not run an independent copy of the database if the goal is shared live data.
- For local testing on different laptops, each developer needs their public IP allowed in Atlas and must point to the same database. For actual integrated use, deploy the Flask backend so teammates share one API URL.
- This module allows a user to update only their own report status. Before Member 3's recovery module is integrated, the team should agree on a trusted role/service authorization for recovery-driven status changes; do not expose an unauthenticated status update.
- Do not store real personal contact details or sensitive identifying information in item descriptions.

## Current scope
This is Member 1's reporting module. The `matches` and `claims` collections are intentionally left for Members 2 and 3 to implement using the shared item IDs and contract.
