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


## Map/location production note

The app uses browser/mobile Geolocation for live driver location. No paid API is required for saving and sharing coordinates.
For an actual visual moving map at scale, add a proper tile provider such as MapTiler/Mapbox/Google Maps. Do not rely on public OpenStreetMap tiles for high-volume commercial production traffic.


## Google Maps link mode
Live location uses browser Geolocation and stores coordinates in Supabase. The app generates Google Maps links from the latest coordinates, so no Google Maps API key is required for link opening. A full in-app moving map later needs a map provider/API key.


## Final production audit
See `docs/FINAL-PRODUCTION-AUDIT.md` for the final QA and performance summary.
