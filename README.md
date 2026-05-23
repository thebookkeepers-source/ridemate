# RideMate V2 Final App

Production-oriented mobile-first carpool app package for Netlify + Supabase + Capacitor Android.

## Included

- Mobile app UI in English only
- New app-style logo
- Passenger custom route search
- Wah Cantt / Islamabad / Rawalpindi autocomplete suggestions
- Passenger pickup request before driver accepts
- Driver KYC: CNIC front/back, license, vehicle registration, selfie
- Admin KYC approval
- Driver verification required before public ride posting
- Live location sharing for accepted/active trips
- Trip history
- Expired ride auto-hide from passenger search
- Capacitor-ready Android setup

## Deploy

1. Run `supabase/schema_v2.sql` in Supabase SQL Editor.
2. Add Netlify env variables:
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_PUBLISHABLE_KEY
   - VITE_APP_NAME=RideMate
   - VITE_SUPPORT_PHONE=03000000000
3. Deploy to Netlify.

## Android

See `docs/ANDROID-BUILD-STEPS.md`.


## V2 Admin/KYC fix included

- Admin KYC tab now shows driver users first.
- Admin can search users and open a driver to view submitted documents.
- Driver document submission uses image upload instead of URL input.
- KYC image storage bucket: `kyc-documents`.
- Admin can approve driver when at least 3 documents are approved.
- Passenger search typing is fixed; fields no longer reset while typing.
- Service worker/cache cleanup added to reduce second-launch white screen.
