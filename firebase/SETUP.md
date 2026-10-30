# Firebase setup for PERFORMATRACK

## 1. Create the Firebase project

1. Open [Firebase Console](https://console.firebase.google.com/) and sign in.
2. Select **Add project** and follow the steps to create a project.
3. In the project overview, select the web icon (`</>`) to register a web app.
4. Give the app a name such as `PERFORMATRACK`; Firebase Hosting is optional.
5. Open **Project settings** (gear icon) > **General** > **Your apps** and
   find the app's **SDK setup and configuration**.
6. Copy `apiKey`, `authDomain`, `projectId`, and `appId` into the matching
   fields in `firebase/firebase-config.js`. Keep the quotes and commas. The web
   config is meant to be public; never paste a service account private key here.

## 2. Enable email and password sign-in

1. Open **Build > Authentication**.
2. Select **Get started** if shown.
3. Open **Sign-in method**.
4. Enable **Email/Password** and save.

## 3. Create the Firestore database

1. Open **Build > Firestore Database**.
2. Select **Create database**.
3. Choose **Standard edition**.
4. Leave the Database ID empty to create the `(default)` database.
5. Choose `asia-east1 (Taiwan)` as the location.
6. Select production mode and finish creating the database. Do not use test
   mode as a substitute for security rules.

## 4. Publish the security rules

1. In VS Code, open `firebase/firestore.rules`.
2. Copy the entire file.
3. In Firebase Console, open **Firestore Database > Rules**.
4. Replace the editor contents with the copied rules and select **Publish**.

The rules keep new accounts in a pending state. A registration request cannot
promote itself to teacher or parent, and parents can read only their assigned
student. A parent-submitted Student ID is a request detail, not proof of
guardianship and not an access credential.

## 5. Run the app locally

Firebase's JavaScript modules need the app to be served over HTTP; opening
`index.html` directly as a `file://` URL will not work.

1. In VS Code, install the **Live Server** extension if it is not installed.
2. Right-click `index.html` and select **Open with Live Server**.
3. Register a teacher with an email address, or choose **Continue with Google**
   from the teacher login page. For a first-time Google teacher request, select
   every subject the teacher is assigned to teach after Google sign-in. The
   account will initially be pending approval.
4. In Firestore's **Data** tab, open the `teachers` collection and the document
   whose ID matches the new user's UID. New teacher requests are stored here.
5. Confirm the `teacherSubjects` field contains the requested subjects, then
   change its `role` field from `pending` to `teacher`. Do not allow users to
   edit either field from the app. Existing accounts stored in the legacy
   `users` collection continue to work; manage those profiles there until you
   migrate them.
6. Sign in again. The teacher dashboard and data should now use Firebase.
   The Add Student subject checklist is limited to the teacher's assigned
   subjects. Roster imports with unassigned subjects are flagged for correction,
   and Firestore rules enforce assigned subjects when creating student records.

### Parent access requests

Parents can register with email/password or request access through Google.
They submit the school-issued Student ID, but the account remains pending and
cannot read student data until a school administrator verifies the parent's
relationship and links the account. A Student ID by itself is not proof of
guardianship; follow the school's normal identity-verification process.

To approve a new parent, open the `parents` document for the request and verify
the parent and requested Student ID with the school. Then set `role` to
`parent`, set `studentId` to the student's displayed ID, and set `studentDocId`
to that student's exact Firestore document ID from `students`. Student
document IDs begin with the teacher's Firebase UID followed by `__` and the
URL-encoded student ID. Keep one linked child per parent account. Do not show
parents a student directory or let them edit these profile fields.

New accounts are stored separately as `teachers/{uid}` and `parents/{uid}`.
The app still reads the older `users/{uid}` profiles for compatibility, so
existing accounts do not lose access. To move an existing profile, copy the
complete document to the matching role collection with the same UID, verify
the app can sign in and read it, then delete the old `users` document in the
Firebase Console. Do not create duplicate profile documents across collections.

## Student performance risk model

The Teacher Dashboard includes an interactive **ML Sample Prediction Demo**
using 20 fictional students and generated sample grades. Select a student and
choose Q2, Q3, or Q4 to estimate the chance of a grade below 75 in that
quarter. Q2 uses Q1 grades, Q3 uses Q2 grades, and Q4 uses Q3 grades. The chart
shows only grade history available before the selected forecast quarter. This
preview also uses synthetic attendance aligned to each sample quarter as a
model feature and displays the inputs and their average log-odds contributions.
Demo data is generated in memory and is not added to the real roster or
written to Firebase or local class records.
This attendance input is specific to the sample preview; the live Student
Dashboard model still excludes attendance until real attendance can be aligned
to grading quarters.

The Student Dashboard includes an experimental Logistic Regression estimate
for whether a student's next available quarter grade may fall below 75. It is
trained from completed quarter-to-quarter grade transitions across the
teacher's roster, using the previous quarter grade and its trend when an
earlier quarter exists. The percentage shown for a student is the average of
the estimated risks for subjects with a grade in the latest completed
quarter. The model is shared through that teacher's
`teacherSettings/{uid}` document so a linked parent can receive an estimate
without access to other students' records.

The estimate is shown only when the class has at least 30 completed
transitions from at least 10 students, with at least five below-75 outcomes
and five outcomes at or above 75. Otherwise, the dashboard explains that
there is not enough data.

Attendance is deliberately not a model feature yet because attendance records
are not aligned to grading-quarter cutoffs; using full-year attendance to
predict an earlier quarter could leak future information. The probability is
an experimental, in-sample support signal and has not been independently
validated. Do not use it as the sole basis for educational decisions. For
research reporting, evaluate it on a separate later term or cohort before
describing its accuracy or using it to guide interventions.

## 6. Publish the website with Firebase Hosting

The hosting configuration is already set to publish this project folder to
the `performatrack-4228a` Firebase project.

1. Install Node.js LTS from [nodejs.org](https://nodejs.org/en/download/) if it
   is not already installed, then restart VS Code.
2. In VS Code, open **Terminal > New Terminal**. Confirm Node.js is available
   by running `node --version`.
3. Install the Firebase command-line tool by running
   `npm install -g firebase-tools`.
4. Sign in by running `firebase login` and complete Google's sign-in in the
   browser window that opens.
5. In the terminal, make sure the current folder is the PERFORMATRACK project
   folder, then run `firebase deploy --only hosting`.
6. Open the `Hosting URL` printed by the command on another device. Sign in
   there with the same Firebase account.

When the app's files change, run `firebase deploy --only hosting` again to
publish the updates.


## Data and account migration

On a teacher's first Firebase sign-in in a browser, the app attempts to copy
the existing local student, attendance, grade, and category data into that
teacher's Firebase account after removing the built-in demo students and their
sample grades and attendance. Only add real class data after signing in with an
approved teacher account. Student IDs `STU-001` through `STU-010` are reserved
for the legacy demo records and are removed by this cleanup; newly added real
students therefore begin at `STU-011`. After the first successful Firebase
initialization, the cloud student collection is authoritative, including when
it is empty, so a student deleted from Firestore is not copied back from an
old browser cache on refresh.

Old locally stored accounts used plaintext passwords and are not migrated.
Those legacy account entries are removed when the Firebase app starts; users
must register again with email and password.

Never put a Firebase Admin SDK private key in this project. The web app config
is intended for the browser; Firestore rules are what restrict database access.
