# RideMate V2 QA checklist

## Auth
- Signup passenger
- Signup driver
- Email confirmation required
- Login after confirmation
- Logout

## Passenger
- Search custom route
- Search autocomplete suggestions
- Request seat with pickup point
- Duplicate request blocked
- Contact hidden until accepted
- Live trip visible after accepted
- Share live location
- Trip history visible

## Driver
- Driver cannot post ride before KYC verified
- Add vehicle
- Submit CNIC/license/vehicle/selfie docs
- After admin approval, post ride
- Accept/reject passenger pickup request
- Start live trip
- Close ride

## Admin
- Make admin via SQL
- Review documents
- Mark driver verified
- Manage users
- Close rides
- Resolve reports

## Expired rides
- Passenger search only shows future rides
- Run `select public.expire_old_rides();` in SQL to move old rides to history
