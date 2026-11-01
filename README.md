\# ReClaim – Find Your Belongings



\*\*A Smart Digital Lost and Found Management Platform\*\*



ReClaim is a centralized digital Lost and Found platform designed to help people reconnect with their lost belongings. It connects people who have lost items with those who have found them through structured reporting, automated item matching, notifications, and an ownership verification workflow.



\## Problem Statement



Lost belongings are often difficult to recover because information about lost and found items is scattered across different platforms, notice boards, and informal communication channels.



ReClaim addresses this problem by providing a centralized platform where users can report lost or found items, discover potential matches, and coordinate the recovery process.



\## Key Features



\### 1. User Authentication

\- User registration and login.

\- Secure password hashing using bcrypt.

\- JWT-based authentication.

\- Role-based access for users and authorized verifiers.



\### 2. Lost and Found Item Reporting

\- Report lost and found belongings.

\- Add item name, category, description, colour, date, and location.

\- Upload item photographs.

\- Track submitted reports.



\### 3. Smart Item Matching

\- Automatically compares lost and found item reports.

\- Uses a weighted matching score based on item information.

\- Supports matching in both directions: lost-to-found and found-to-lost.

\- Identifies potential matches using a configurable score threshold.



\### 4. Match Notifications

\- Notifies both the owner and finder when a potential match is identified.

\- Supports notification status tracking.

\- Includes retry handling for failed notification delivery.



\### 5. Ownership Verification

\- Supports an authorized verifier workflow.

\- Allows ownership claims to be approved or rejected.

\- Maintains verification information and match activity history.



\### 6. Item Recovery Management

\- Tracks the recovery process through match statuses.

\- Supports claim initiation and verification.

\- Uses atomic recovery operations to help prevent inconsistent item and match updates.

\- Prevents duplicate recovery operations.



\### 7. My Reports and Match Tracking

\- View personal lost and found reports.

\- Explore potential matches.

\- Monitor report and recovery statuses.



\## How ReClaim Works



1\. \*\*Register or Log In:\*\* Users create an account or access their existing account.

2\. \*\*Report an Item:\*\* A user submits a lost-item or found-item report with relevant details and a photograph.

3\. \*\*Automatic Matching:\*\* The matching engine compares the new report with eligible existing reports.

4\. \*\*Match Notification:\*\* Potential matches are recorded and both parties are notified.

5\. \*\*Ownership Claim:\*\* The relevant user initiates an ownership claim.

6\. \*\*Verification:\*\* An authorized verifier reviews the claim and approves or rejects it.

7\. \*\*Successful Recovery:\*\* Once the recovery process is completed, the corresponding match and item records are updated.



\## Technology Stack



| Component | Technologies |

|---|---|

| Frontend | HTML5, CSS3, JavaScript |

| Backend | Node.js, Express.js, TypeScript |

| Database | MongoDB Atlas |

| Authentication | JWT, bcryptjs |

| File Uploads | Multer |

| Matching Engine | Custom weighted scoring algorithm |

| Development Tools | VS Code, Git, GitHub, npm |



\## Project Structure



```text

ReClaim-Find-Your-Belongings/

│

├── backend/                 # Existing backend files

│

├── db/

│   ├── mongo.ts             # MongoDB connection

│   └── repository.ts        # Data access and operations

│

├── frontend/

│   ├── css/

│   │   └── style.css

│   ├── js/

│   │   ├── api.js

│   │   ├── auth.js

│   │   ├── dashboard.js

│   │   ├── find-items.js

│   │   ├── matches.js

│   │   ├── notifications.js

│   │   └── report.js

│   ├── index.html

│   ├── login.html

│   ├── register.html

│   ├── dashboard.html

│   ├── find-items.html

│   ├── view-matches.html

│   ├── my-reports.html

│   ├── report-lost.html

│   └── report-found.html

│

├── matching/

│   └── engine.ts            # Smart matching algorithm

│

├── public/

│   └── assets/

│

├── src/                     # Frontend source files

│

├── test/                    # Test files

│

├── server.ts                # Express server and API routes

├── package.json

├── package-lock.json

├── bun.lock

├── tsconfig.json

├── vite.config.ts

├── .env.example

├── .gitignore

└── README.md

```



\## Getting Started



\### Prerequisites



Install the following before running the project:



\- Node.js

\- npm

\- MongoDB Atlas account

\- Git



\### 1. Clone the Repository



```bash

git clone https://github.com/haripriya333999/ReClaim-Find-Your-Belongings.git

```



\### 2. Navigate to the Project Directory



```bash

cd ReClaim-Find-Your-Belongings

```



\### 3. Install Dependencies



```bash

npm install

```



\### 4. Configure Environment Variables



Create a `.env` file in the root directory by copying the example file.



\*\*Windows:\*\*



```cmd

copy .env.example .env

```



Configure the following variables in `.env`:



```env

PORT=3000

MONGO\_URI=your\_mongodb\_connection\_string

DB\_NAME=reclaim\_db

JWT\_SECRET=your\_secure\_secret\_at\_least\_32\_characters\_long

```



\- `PORT`: Port on which the application runs.

\- `MONGO\_URI`: MongoDB Atlas connection string.

\- `DB\_NAME`: Database name.

\- `JWT\_SECRET`: Secret used for signing authentication tokens. Use a strong secret of at least 32 characters.



Never upload your actual `.env` file or expose database credentials and secrets publicly.



\### 5. Run the Application



```bash

npm run dev

```



Open the following address in your browser:



```text

http://localhost:3000

```



\### 6. Build Check



To run the configured TypeScript build check:



```bash

npm run build

```



\## Testing



The repository includes test files covering important application areas:



\- Matching functionality.

\- Atomic recovery operations.

\- Notification reliability.

\- Verification and permissions.



The test files are located in the `test/` directory. A dedicated npm test script is not currently configured in `package.json`.



\## Security and Reliability



\- Passwords are hashed before storage.

\- Authentication is handled using JWT tokens.

\- Protected API routes require authentication.

\- Ownership verification is restricted to authorized roles.

\- Uploaded item images have file-size and extension restrictions.

\- Recovery operations include safeguards against concurrent and duplicate updates.

\- Notification delivery includes retry and outbox handling.



\## Future Enhancements



\- Advanced item similarity and image-based matching.

\- Improved search and filtering.

\- Real-time notification improvements.

\- Enhanced administrative and verifier dashboards.

\- Deployment and production monitoring improvements.



\## Project Status



ReClaim is an actively developed project. Its current implementation includes user authentication, item reporting, automated matching, notifications, ownership verification, and recovery management.



\## Contributing



Contributions, suggestions, and improvements are welcome.



1\. Fork the repository.

2\. Create a feature branch.

3\. Make your changes.

4\. Commit your changes.

5\. Submit a pull request.



\## Repository



\*\*GitHub:\*\* https://github.com/haripriya333999/ReClaim-Find-Your-Belongings



\---



\*\*ReClaim – Helping lost belongings find their way home.\*\*

