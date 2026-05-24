// Global fallbacks for legacy module screens that were referenced but not defined.
// These prevent hard crashes while keeping the original full-feature main.js active.
window.bookingsView = window.bookingsView || function(){
  return `<div class="screenTitle"><div><div class="h1">My trips</div><p class="muted">Passenger trip requests, accepted rides and live trips appear here.</p></div></div><div class="card"><div class="h2">Trips loading</div><p class="small muted">Open Search to request a seat. Accepted rides can still be managed from Live and History. If this message remains after refresh, run the latest app patch.</p></div>`;
};
window.openRatingModal = window.openRatingModal || function(){
  alert('Rating screen is being prepared. Please refresh after the latest deploy.');
};
window.submitRating = window.submitRating || function(e){
  if(e) e.preventDefault();
  alert('Rating submit is being prepared. Please refresh after the latest deploy.');
};
