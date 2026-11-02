 ReClaim – Find Your Belongings

A Smart Digital Lost and Found Management Platform

ReClaim is a centralized digital Lost and Found Management Platform designed to help people reconnect with their lost belongings. It connects individuals who have lost items with those who have found them through structured item reporting, intelligent matching, notifications, ownership verification, and recovery management.

Instead of depending on traditional notice boards, manual announcements, or unorganized communication, ReClaim provides a systematic platform where users can report missing and found belongings, discover potential matches, initiate ownership claims, and complete the recovery process.

By combining intelligent matching with a structured verification workflow, ReClaim aims to make recovering lost belongings more organized, accessible, reliable, and efficient.

 1. Problem Statement

Losing personal belongings is a common problem in colleges, educational institutions, workplaces, public spaces, and other shared environments.

Traditional Lost and Found systems often depend on physical notice boards, verbal announcements, social media groups, or manually maintained registers. These approaches make it difficult to connect people who have lost belongings with those who have found them.

Some major challenges include:

- Disconnected Reporting: Lost and found information is scattered across different platforms and communication channels.
- Time-Consuming Searches: People must manually search through multiple announcements to identify their belongings.
- Lack of Intelligent Matching: Similar lost and found reports are not automatically identified.
- Delayed Communication: Owners and finders may struggle to communicate efficiently.
- Ownership Verification: There is no consistent process for establishing whether a person genuinely owns a reported item.
- Unorganized Recovery: Item-return activities may lack proper status tracking and confirmation.
- Limited Transparency: Users may not know whether an item has been reported, matched, verified, or successfully recovered.

These limitations create unnecessary delays and reduce the chances of successfully recovering lost belongings.

## 2. Our Solution

ReClaim addresses these challenges through a centralized digital platform that manages the complete Lost and Found lifecycle.

Users can submit structured LOST and FOUND reports containing item descriptions, categories, colours, locations, dates, and supporting images.

The Smart Matching System compares lost and found reports using multiple item-related attributes and calculates similarity scores to identify potential matches.

When a suitable match is identified, the platform creates a match record and notifies the relevant users.

The ownership verification workflow allows claimants to provide supporting information and evidence. Authorized verification processes help establish legitimate ownership before an item is marked as successfully recovered.

ReClaim brings reporting, discovery, matching, communication, verification, and recovery together in one organized platform.

 3. Project Objectives

The primary objectives of ReClaim are:

1. Develop a centralized platform for managing LOST and FOUND reports.
2. Simplify the process of reporting missing and found belongings.
3. Reduce manual searching through intelligent item matching.
4. Identify potential matches using multiple item attributes.
5. Notify relevant users when potential matches are identified.
6. Provide a structured ownership claim and verification process.
7. Maintain transparent claim and recovery statuses.
8. Prevent unauthorized ownership verification and recovery operations.
9. Maintain reliable records of reports, matches, and notifications.
10. Improve the overall experience of recovering lost belongings.

4. Key Features

1\. User Authentication

Provides secure access to the platform through user registration and login. Authenticated users can access their reports, matches, and other authorized operations.

2\. LOST Item Reporting

Allows users to report belongings they have lost by providing details such as:

- Item name
- Item category
- Colour
- Detailed description
- Last known location
- Date the item was lost
- Supporting image, where supported

3\. FOUND Item Reporting

Allows users to report belongings they have found by providing item details such as name, category, colour, description, found location, date, and supporting images.

4\. Smart Matching System

Automatically compares LOST and FOUND reports using multiple attributes to identify potential matches. The matching engine calculates similarity scores and applies a configured threshold to determine relevant matches.

5\. Match Management

Maintains structured match records containing references to the corresponding LOST and FOUND reports, similarity scores, score breakdowns, and match statuses.

6\. Notifications

Keeps relevant users informed about potential matches and important claim or recovery activities through the notification system.

7\. View Matches

Provides an interface where users can view potential matches, item details, similarity scores, and relevant status updates.

8\. Ownership Claim Initiation

Allows the person claiming a lost item to initiate an ownership claim against a potential match.

9\. Evidence Submission

Allows claimants to provide additional identifying information and supporting evidence, such as unique marks, brand details, distinctive characteristics, and photographs where supported.

10\. Ownership Verification

Provides an authorized verification process in which submitted claims and supporting evidence can be reviewed, approved, or rejected.

11\. Item Recovery Management

Supports the final stage of the Lost and Found lifecycle by recording successful item handovers and updating the relevant match and item records.

12\. Status Tracking

Maintains the progress of potential matches, ownership claims, and recovery activities through structured status updates.

## 5. How ReClaim Works

ReClaim follows a structured workflow:

1. Report an Item: A user submits a LOST or FOUND report with relevant item details.
2. Store the Report: The backend validates and stores the report in MongoDB.
3. Compare Reports: The Smart Matching Engine compares the new report against eligible reports of the opposite type.
4. Calculate Similarity: The engine evaluates item attributes and calculates a similarity score.
5. Generate Potential Matches: Reports satisfying the matching criteria are stored as match records.
6. Notify Relevant Users: The platform creates notifications for the relevant owner and finder.
7. Initiate an Ownership Claim: The claimant selects a potential match and submits an ownership claim.
8. Submit Supporting Evidence: The claimant provides identifying information and supporting evidence.
9. Verify Ownership: An authorized verifier reviews the claim and records an approval or rejection decision.
10. Complete Recovery: After successful verification and handover, the recovery workflow updates the relevant records.

## 6. Core Modules

ReClaim is organized into three major functional modules.

### Module 1 – Lost and Found Reporting

Responsibility: Member 1

This module handles the submission and management of lost and found item reports.

Main responsibilities:

- LOST report creation.
- FOUND report creation.
- Item information validation.
- Image handling, where supported.
- Report storage.
- Integration with the Smart Matching module.

### Module 2 – Smart Matching and Item Discovery

Responsibility: Member 2

This module identifies potential relationships between LOST and FOUND reports.

Main responsibilities:

- Compare LOST and FOUND reports.
- Calculate attribute-based similarity scores.
- Apply matching thresholds.
- Generate persistent match records.
- Prevent duplicate matches.
- Generate owner and finder notifications.
- Maintain View Matches functionality.
- Integrate matching and notification events with the reporting and verification modules.

### Module 3 – Ownership Verification and Item Recovery

Responsibility: Member 3

This module handles ownership claims, verification, and recovery.

Main responsibilities:

- Ownership claim initiation.
- Supporting evidence submission.
- Claim review dashboard.
- Claim approval and rejection.
- Authorized ownership verification.
- Claim status management.
- Verification history and audit trail.
- Item handover and recovery confirmation.
- Consistent status updates for matches and associated reports.
- Integration with the notification system.

## 7. Smart Matching System

The Smart Matching Engine is one of the central components of ReClaim.

Its purpose is to reduce manual searching by automatically comparing relevant LOST and FOUND reports.

The current matching engine evaluates six weighted criteria:

- Item Name – 20%
- Category – 15%
- Colour – 15%
- Description – 20%
- Location – 20%
- Date – 10%

The overall similarity score is calculated using the contribution of each attribute according to its assigned weight.

The existing matching threshold is 40%. Reports meeting the configured threshold can be considered potential matches.

The engine supports matching in both directions:

- A newly submitted LOST report is compared against existing eligible FOUND reports.
- A newly submitted FOUND report is compared against existing eligible LOST reports.

The matching engine also uses text normalization, stopword handling, controlled item-name synonyms, primary noun extraction, and colour-family normalization.

The similarity score indicates a potential relationship between reports. It does not establish ownership.

## 8. Ownership Verification and Recovery

Identifying a potential match is only the beginning of the recovery process.

ReClaim separates potential matching from ownership verification.

Ownership Claim: The owner initiates a claim against a potential match and provides additional identifying information.

Evidence Review: The authorized verifier examines the submitted information and supporting evidence.

Verification Decision: The verifier can approve or reject the claim. Decisions and rejection reasons should be recorded.

Recovery Confirmation: Once ownership has been verified and the item has been handed over, the recovery workflow records the completed return.

The corresponding match, LOST item, and FOUND item records must be updated consistently.

## 9. Technology Stack

ReClaim uses a web application architecture with a TypeScript and Express backend and MongoDB-based data storage.

- HTML: Frontend structure.
- CSS: Styling and layout.
- JavaScript: Frontend functionality.
- TypeScript: Backend development and type safety.
- Node.js: Server-side JavaScript runtime.
- Express.js: Backend framework and API development.
- MongoDB Atlas: Cloud database.
- MongoDB Driver: Database communication.
- Git: Version control.
- GitHub: Source code management and collaboration.

## 10. System Architecture

ReClaim follows a frontend-backend-database architecture.

Frontend Layer

Provides interfaces for authentication, LOST and FOUND reporting, matches, notifications, claim initiation, evidence submission, verification, and recovery.

Backend Layer

The Express and TypeScript backend handles API requests, input validation, business logic, matching operations, notification operations, authorization, claim workflows, recovery workflows, and database communication.

Database Layer

MongoDB Atlas stores application information, including user records, LOST and FOUND reports, match records, notifications, and claim and verification information according to the implemented schema.

## 11. Database Design

MongoDB Atlas is used as the primary persistent database.

The application organizes information into logical data entities.

Users: Stores registered user information and authentication-related data.

Items: Stores LOST and FOUND reports, including item details, report type, user references, locations, dates, descriptions, and image references where applicable.

Matches: Stores potential relationships between LOST and FOUND reports, including item references, owner and finder references, similarity scores, score breakdowns, statuses, and timestamps.

Notifications: Stores user-specific notifications, including relevant match references, notification information, read status, and timestamps.

Claims and Verification Records: Support the ownership claim and verification workflow, including claimant information, evidence references, verification decisions, actors, timestamps, and status history according to the implemented schema.

## 12. Application Workflow

The overall workflow connects all three modules:

1. User submits a LOST or FOUND report.
2. The reporting module stores the item information.
3. The Smart Matching Engine compares relevant reports.
4. The engine calculates a similarity score.
5. Potential matches are stored.
6. Relevant users receive notifications.
7. The owner initiates a claim.
8. Supporting ownership evidence is submitted.
9. An authorized verifier reviews the claim.
10. The claim is approved or rejected.
11. Following approval and item handover, the recovery process is completed.
12. The relevant match and item records are updated.

## 13. Security and Reliability

ReClaim is designed with security and data reliability as important considerations.

- Authentication and Authorization: Protected operations require authenticated users and appropriate permissions.
- Input Validation: Submitted information is validated before processing and database storage.
- Database Reliability: MongoDB Atlas acts as the primary persistent storage system.
- Safe Image Handling: Uploaded files are validated and handled through the configured storage mechanism.
- Duplicate Prevention: Appropriate database constraints and atomic operations help prevent duplicate matches and notifications.
- Consistent Recovery Updates: Match and item updates should be handled atomically where supported, or through a reliable recovery and reconciliation mechanism.
- Audit History: Important claim, verification, and recovery actions should be traceable.
- Environment Configuration: Credentials and sensitive configuration values are stored in environment variables rather than committed to source control.

## 14. Installation and Setup

Prerequisites

Make sure the following are installed:

- Node.js
- npm
- Git
- MongoDB Atlas account or an appropriately configured MongoDB environment
- Visual Studio Code or another code editor

Step 1 – Clone the Repository

```
git clone <YOUR_REPOSITORY_URL>
```

Step 2 – Navigate to the Project Directory

```
cd <PROJECT_DIRECTORY>
```

Step 3 – Install Dependencies

```
npm install
```

Step 4 – Configure Environment Variables

Create a local `.env` file using `.env.example` as a reference.

On Windows Command Prompt:

```
copy .env.example .env
```

Step 5 – Configure MongoDB Atlas

1. Create or access your MongoDB Atlas cluster.
2. Configure a database user.
3. Configure appropriate network access.
4. Obtain the MongoDB connection URI.
5. Add the URI to your local `.env` file.
6. Verify the database name and connection settings.

Never commit your populated `.env` file to GitHub.

## 15. Environment Configuration

The project uses environment variables for configuration.

Common configuration entries include:

```
NODE_ENV=development
PORT=3000

MONGODB_URI=your_mongodb_connection_string
DB_NAME=your_database_name

JWT_SECRET=your_long_random_secret
```

If supported by the current implementation, additional development controls may include:

```
ALLOW_MEMORY_FALLBACK=false
ENABLE_DEV_SEED=false
```

Replace placeholder values with valid local configuration. Never publish real credentials or enable development-only functionality in production.

## 16. Running the Application

Start the development server using the configured npm script:

```
npm run dev
```

If the application starts successfully, open the local frontend address shown in the terminal.

For example, if the application uses port 3000:

[http://localhost:3000](http://localhost:3000?utm_source=chatgpt.com)

Use the actual address and port printed by the running application.

## 17. Testing

Testing helps verify the correctness and reliability of individual modules and their integration.

Unit Testing

Individual functions and components can be tested, including:

- Similarity calculation.
- Attribute normalization.
- Matching thresholds.
- Duplicate prevention.
- Status transition validation.

Integration Testing

Verify communication between:

- Reporting and matching modules.
- Matching and notification modules.
- Matching and verification modules.
- Verification and recovery modules.
- Frontend and backend APIs.
- Backend and MongoDB Atlas.

End-to-End Testing

Test the complete Lost and Found lifecycle:

1. Submit a LOST report.
2. Submit a corresponding FOUND report.
3. Generate a potential match.
4. Verify match persistence.
5. Check owner and finder notifications.
6. Initiate an ownership claim.
7. Submit supporting evidence.
8. Review and verify the claim.
9. Complete the item-return process.
10. Confirm the final database statuses.

Testing should use isolated development or test data rather than the shared production database.

## 18. Team Responsibilities

ReClaim is developed collaboratively through three major functional modules.

Member 1 – Lost and Found Reporting

Responsible for report submission, item information management, validation, and report storage.

Member 2 – Smart Matching and Item Discovery

Responsible for similarity calculation, matching logic, match generation, notifications, View Matches, and integration with reporting and verification modules.

Member 3 – Ownership Verification and Recovery

Responsible for ownership claims, supporting evidence, claim review, verification decisions, audit history, and item recovery.

All three modules work together to manage the complete Lost and Found lifecycle.

## 19. Future Enhancements

ReClaim can be extended with additional capabilities to improve matching accuracy, usability, and accessibility.

Potential future enhancements include:

- Image-based item similarity using computer vision.
- Advanced semantic matching for item descriptions.
- Improved duplicate-report detection.
- Real-time notification delivery.
- Email and push notification integration.
- Advanced search and filtering.
- Interactive location-based item discovery.
- QR-code-based recovery confirmation.
- Analytics and reporting dashboards.
- Multilingual user interfaces.
- Mobile application support.
- Improved accessibility features.

These are proposed enhancements and should not be considered implemented unless they are added and verified.

## 20. Contributing

Contributions and improvements are welcome.

To contribute:

1. Fork or clone the repository.
2. Create a separate feature branch.
3. Make changes within the relevant module.
4. Follow the existing TypeScript and project coding conventions.
5. Test the changes locally.
6. Commit your changes with a clear commit message.
7. Push your branch.
8. Open a Pull Request for review.

Avoid committing `.env` files, database credentials, JWT secrets, personal user information, temporary sensitive backups, or unnecessary generated files.

## 21. Conclusion

ReClaim – Find Your Belongings aims to transform the traditional Lost and Found process into a structured, intelligent, and reliable digital experience.

By bringing together item reporting, smart matching, notifications, ownership verification, and recovery management, the platform provides a centralized approach to reconnecting people with their lost belongings.

ReClaim – Find Your Belongings

Report it. Match it. Verify it. Reclaim it.
