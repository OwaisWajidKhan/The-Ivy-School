# School Attendance Management System – Required Fixes

## 1. Profile Picture Upload Issue

**Module:** Account Management

### Issue

The existing demo accounts are unable to upload profile pictures.

### Current Behavior

* Attempting to upload a picture results in an **Internal Server Error (500)**.

### Expected Behavior

* Users should be able to successfully upload and save profile pictures without any server errors.

---

## 2. Incorrect RFID Scan Time

**Module:** RFID Attendance

### Issue

The attendance timestamp recorded after scanning an RFID card is incorrect.

### Current Behavior

* The scan time is off by approximately **4–5 hours**.
* It appears the application is storing/displaying **UTC time** instead of the local timezone.

### Expected Behavior

* RFID scans should record and display the **current local server/application time**.

---

## 3. Attendance Data Export

**Module:** Attendance

### Issue

There is no visible option to download attendance records.

### Requirement

Provide a feature that allows users to:

* Download/export attendance records.
* Support common formats such as Excel (XLSX) and/or CSV.

---

## 4. Assign RFID Card – Person Dropdown Empty

**Module:** Assign RFID Card

### Issue

The **Select Person** dropdown contains no data.

### Current Behavior

* No users are displayed for selection.

### Expected Behavior

* The dropdown should list all eligible users/persons that can be assigned an RFID card.

---

## 5. Bulk Import Cards Feature

**Module:** RFID Cards

### Issue

The **Bulk Import Cards** feature lacks clarity.

### Requirement

Review and improve the feature by:

* Clearly defining the expected workflow.
* Providing a downloadable sample template (if applicable).
* Displaying validation rules and supported file formats.
* Showing meaningful success and error messages during import.

---

## 6. RFID Scan History Page

**Module:** RFID Attendance

### Issue

The client wants to know where RFID scan records can be viewed.

### Requirement

Provide a dedicated page where administrators can view:

* Every RFID scan.
* Card ID.
* Person details.
* Scan date and time.
* Entry/Exit status (if applicable).
* Device/Scanner information (if available).

If such a page already exists, ensure it is easily accessible from the navigation.

---

## 7. Picture Upload During Account Creation

**Module:** Account Creation

### Issue

The profile picture upload feature is not functioning correctly while creating a new account.

### Expected Behavior

* Users should be able to upload a profile picture during account creation successfully.

---

## 8. Timezone Issue in RFID Scan Results

**Module:** RFID Scan Results

### Issue

The displayed scan time appears to be in UTC instead of the application's local timezone.

### Expected Behavior

* Display all RFID scan timestamps using the configured local timezone.

---

## 9. Timezone Issue in Audit Logs

**Module:** Audit Logs

### Issue

Audit log timestamps also appear to be using UTC.

### Expected Behavior

* Audit log timestamps should use the application's configured local timezone for consistency across the system.

---

# Priority Summary

### High Priority

* Fix profile picture upload errors.
* Correct RFID scan timestamps/timezone.
* Fix audit log timestamps.
* Populate the "Assign RFID Card" person dropdown.

### Medium Priority

* Implement attendance data export.
* Add/verify RFID scan history page.
* Improve the Bulk Import Cards workflow and documentation.
