// Simple test to see if JavaScript is working
console.log('=== JAVASCRIPT LOADED ===');

// Basic functionality test
function testBasicFunctionality() {
  console.log('=== BASIC FUNCTIONALITY TEST ===');
  
  // Test if we can find buttons
  const checkGearBtn = document.getElementById('btn-check-gear');
  const addGearBtns = document.querySelectorAll('.add-gear-btn');
  
  console.log('Check Gear button found:', !!checkGearBtn);
  console.log('Add Gear buttons found:', addGearBtns.length);
  
  // Add simple click handlers
  if (checkGearBtn) {
    checkGearBtn.addEventListener('click', () => {
      console.log('Check Gear button clicked!');
      alert('Check Gear button is working!');
    });
  }
  
  if (addGearBtns.length > 0) {
    addGearBtns[0].addEventListener('click', () => {
      console.log('Add Gear button clicked!');
      alert('Add Gear button is working!');
    });
  }
}

// Run test when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', testBasicFunctionality);
} else {
  testBasicFunctionality();
}
