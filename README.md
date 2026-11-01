# ReClaim – Find Your Belongings

## About the Project
ReClaim is a web-based Lost and Found application that helps users report lost or found items and search for belongings reported by others.

## Technologies Used
- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Python, Flask
- **Database:** MongoDB Atlas
- **Tools:** VS Code, Git, GitHub
- **Environment:** Python Virtual Environment

## Project Structure

```text
reclaim_project/
│
├── backend/
│
├── frontend/
│   ├── css/
│   │   └── style.css
│   │
│   ├── js/
│   │   ├── api.js
│   │   ├── auth.js
│   │   ├── dashboard.js
│   │   ├── find-items.js
│   │   ├── my-reports.js
│   │   └── report.js
│   │
│   ├── index.html
│   ├── login.html
│   ├── register.html
│   ├── dashboard.html
│   ├── find-items.html
│   ├── my-reports.html
│   ├── report-lost.html
│   └── report-found.html
│
├── .env
├── .gitignore
├── requirements.txt
├── run.py
└── README.md
```

## How the Application is Connected

1. **Frontend:** HTML is used to create web pages, CSS for styling, and JavaScript for interactions.
2. **API Connection:** `api.js` handles communication between the frontend and backend through API requests.
3. **Backend:** Python Flask handles API requests and application logic.
4. **Database:** MongoDB Atlas stores user information and lost/found item reports.
5. **Configuration:** The `.env` file stores environment variables and database connection details.
6. **Dependencies:** `requirements.txt` contains the Python packages required to run the project.

## Steps to Clone and Run the Project

### 1. Clone the Repository

```bash
git clone https://github.com/haripriya333999/ReClaim-Find-Your-Belongings.git reclaim_project
```

### 2. Open the Project Folder

```bash
cd reclaim_project
```

### 3. Create a Virtual Environment

```bash
python -m venv .venv
```

### 4. Activate the Virtual Environment (Windows)

```bash
.venv\Scripts\activate
```

### 5. Install Required Packages

```bash
pip install -r requirements.txt
```

### 6. Configure Environment Variables

Create a `.env` file in the root directory and add the required configuration, including your MongoDB Atlas connection details.

### 7. Run the Application

```bash
python run.py
```

## Current Implementation

- User registration and login
- Dashboard
- Lost item reporting
- Found item reporting
- Item searching and filtering
- Viewing personal reports
- MongoDB Atlas integration

## Important Notes

- Python must be installed before setting up the project.
- Each person should create their own virtual environment.
- The `.env` file should be configured locally and should not contain publicly shared credentials.
- The `.venv` folder and sensitive environment files should not be uploaded to GitHub.

## Project Status

The basic application structure, frontend and backend integration, user authentication, item reporting, searching, and database connectivity have been implemented. This README will be updated as the project progresses.
