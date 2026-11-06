# User guide

ClinicAssist writes **drafts** for you. A person must read every draft before it is used. It is not
a clinical tool: it never diagnoses or advises on treatment, and you should never paste patient
details into it.

## For everyone (Staff, Managers, Admins)

### Sign in

Open the site and sign in with the email and password an administrator gave you. Use **Sign out** (top right) when you leave a shared computer.

### Find a template

1. Choose **Templates**.
2. Type a word in **Search**, or pick a **Category** or **Audience**, then press **Apply**.
3. Tick **Favorites only** to see your starred templates. Use the star on a template to add it.

"Patient-facing" templates produce text a patient may see. "Internal" templates are for staff.

### Run a template

1. Open the template and fill in the form. Required fields are marked.
2. Use anonymized text only: no names, phone numbers, emails, ID numbers, birth dates or addresses.
3. If the app finds something that looks personal, it **highlights it and disables Generate**.
   Press **Redact all** to replace it with a marker such as `[REDACTED-PHONE]`, or edit it yourself.
4. Press **Generate**. The draft appears word by word. You can open **View full prompt** to see
   exactly what is sent.
5. To change it, type an instruction under **Refine this draft** (for example "make it shorter") and
   press **Refine**, or press **Regenerate**.

The counter under the draft shows words and characters, and warns if a limit is exceeded.

### Review before you use a patient-facing draft

For patient-facing templates, **Copy** and **Export** stay disabled until you read the draft and
tick **I have reviewed this**. If you refine the draft afterwards, the tick is cleared and you must
review again. Internal drafts can be copied straight away, but should still be read first.

### Copy and export

Press **Copy**, or export as **.md**, **.docx** or **.pdf**. Exports are recorded in the audit log.

### History

**History** lists past drafts. Staff see their own; managers and admins see everyone's. Open one to
see the inputs, the draft and any refinements, and to export it again.

### Limits

Each person can make a limited number of generations and refinements per hour (30 by default). If
you reach it, the message says when you can try again.

## For Managers

Everything above, plus:

- **Analytics:** pick a date range (the last 30 days by default). You see generations per day,
  template and user, how often personal details were blocked or overridden, how many patient-facing
  drafts were reviewed, the average length, token use and an **estimated** cost. The cost is a rough
  figure from a price table in the code, not a bill. Each chart has a **View as table** option.
- **Settings:** update the clinic details the templates use (name, city, phone, booking link,
  address notes, specialty). The emergency number is required.
- **History** for all users.

## For Admins

Everything above, plus:

- **Users:** create accounts (a temporary password of 12+ characters with upper case, lower case and
  a digit), change roles, deactivate and reactivate people. A deactivated person cannot sign in.
  You cannot deactivate your own account.
- **Settings:** also the brand tone, privacy regime and default reading level.
- **Manage templates:** edit a template or create a new one. Saving a change to the wording or the
  variables creates a **new version**; drafts already made keep the version they used. Archive a
  template to hide it from the library.
- **PHI override:** if the detector is wrong (a harmless number that looks like a phone number), you
  can generate anyway by entering a reason of at least 10 characters. It is recorded in the audit
  log. Do not use it to send real patient details.
- **Audit log:** filter by action, person and date; open a row to see its details; **Download CSV**
  exports the filtered rows (the export is itself logged). The log is append-only and never holds
  draft text or personal details.

## If something goes wrong

- **"Possible personal detail":** remove or redact it. The detector is cautious and sometimes flags
  harmless text.
- **"You have reached the hourly limit":** wait for the time shown.
- **A page says "Something went wrong":** press **Try again**. If it keeps happening, tell an
  administrator and quote the reference shown on the page.
- **You see "Forbidden":** your role does not include that page.
