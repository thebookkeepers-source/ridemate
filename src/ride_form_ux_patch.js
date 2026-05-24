// RideMate driver post form UX patch.
// Keeps database/RPC fields intact while simplifying the UI for drivers.
(function(){
  function findLabelFor(el){
    return el ? el.closest('label') : null;
  }
  function setLabelText(label, text){
    if(!label) return;
    for(const node of Array.from(label.childNodes)){
      if(node.nodeType === Node.TEXT_NODE){
        node.textContent = text;
        return;
      }
    }
    label.insertBefore(document.createTextNode(text), label.firstChild);
  }
  function syncHiddenRouteFields(){
    const from = document.getElementById('rFrom');
    const to = document.getElementById('rTo');
    const pickup = document.getElementById('rPickup');
    const dropoff = document.getElementById('rDropoff');
    if(pickup && from) pickup.value = from.value || pickup.value || '';
    if(dropoff && to) dropoff.value = to.value || dropoff.value || '';
  }
  function patchRideForm(){
    const form = document.getElementById('rideForm');
    if(!form || form.dataset.uxPatched === '1') return;
    form.dataset.uxPatched = '1';

    const from = document.getElementById('rFrom');
    const to = document.getElementById('rTo');
    const pickup = document.getElementById('rPickup');
    const dropoff = document.getElementById('rDropoff');
    const via = document.getElementById('rVia');

    setLabelText(findLabelFor(from), 'Pickup / start point');
    setLabelText(findLabelFor(to), 'Destination / drop-off point');
    setLabelText(findLabelFor(via), 'Route / via road (optional)');

    if(from) from.placeholder = 'Example: Barrier 3, Wah Cantt';
    if(to) to.placeholder = 'Example: Blue Area, Islamabad';
    if(via) via.placeholder = 'Example: GT Road to Taxila to Golra';

    const pickupLabel = findLabelFor(pickup);
    const dropoffLabel = findLabelFor(dropoff);
    if(pickupLabel) pickupLabel.style.display = 'none';
    if(dropoffLabel) dropoffLabel.style.display = 'none';

    const hint = document.createElement('p');
    hint.className = 'formHint';
    hint.textContent = 'Tip: sirf pickup aur destination fill karein. App database ke liye pickup/dropoff fields automatically set kar degi.';
    if(to && findLabelFor(to)) findLabelFor(to).insertAdjacentElement('afterend', hint);

    ['input','change','blur'].forEach(evt => {
      if(from) from.addEventListener(evt, syncHiddenRouteFields);
      if(to) to.addEventListener(evt, syncHiddenRouteFields);
    });
    form.addEventListener('submit', syncHiddenRouteFields, true);

    const template = document.getElementById('templateSelect');
    if(template){
      template.addEventListener('change', () => setTimeout(syncHiddenRouteFields, 0));
    }
    syncHiddenRouteFields();
  }

  const observer = new MutationObserver(patchRideForm);
  observer.observe(document.documentElement, {childList:true, subtree:true});
  document.addEventListener('DOMContentLoaded', patchRideForm);
  setInterval(patchRideForm, 1000);
})();
