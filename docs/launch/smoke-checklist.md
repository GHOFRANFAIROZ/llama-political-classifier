# Smoke Checklist - Pre-Launch

## A. Core health
- [x] Backend `/health` returns ok
- [x] Frontend loads without env/config errors

## B. Auth
- [x] Admin login works
- [x] Org user login works
- [x] Logout works

## C. Org onboarding
- [x] `/request-access` opens
- [x] Request submission works
- [x] Request appears in admin org requests
- [x] Approve works
- [x] `linked_user_uid` appears for a real Firebase Auth user
- [x] `user_profile_created = Yes` appears

## D. Access control
- [x] Org user cannot access `/dashboard/admin/org-requests`
- [x] Org user cannot access `/dashboard/organizations`
- [x] Admin can access admin pages

## E. Org workspace
- [x] Dashboard opens
- [x] Reports opens
- [x] Trends opens
- [x] Search opens
- [x] Wordcloud opens
- [x] Organization name displays correctly

## F. Data / analytics
- [x] Reports empty state or data state is valid
- [x] Trends empty state or chart state is valid
- [x] Search empty state or results state is valid
- [x] Wordcloud empty state or term state is valid

## G. UX sanity
- [x] No obvious broken layout
- [x] No unhandled backend error visible in validated web flow
- [x] Request Access wording is clear
- [x] Org Requests page wording is clear

## Notes
- This checklist reflects the validated web onboarding + org workspace flow before extension MVP.
- Validation used local frontend against the official deployed Render backend where appropriate.
- Reports org proxy blocker was fixed by adding the org-scoped reports route in Next API.