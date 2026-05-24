# RideMate POV QA audit

## Passenger POV
- Search uses real searchable dropdown suggestions for From/To.
- Typing does not reset fields.
- Search rides filters related ride routes.
- Passenger can request a seat with pickup note.
- Passenger sees live driver location after ride starts.
- Passenger can rate driver after completed trip.

## Driver POV
- Driver post ride form uses searchable dropdowns for start, destination, pickup and dropoff.
- KYC/vehicle guard prevents unverified ride posting.
- Driver can accept requests, start ride, share live location, and end ride.
- End ride completes bookings, removes ride from search, and moves trip to history.

## Admin POV
- Admin can search KYC users, open driver documents, approve/reject docs and verify driver.
- Admin can manage rides/users/reports.
- Production scaling needs paid/stable map tile provider for 10k users if live map visualization is required.
