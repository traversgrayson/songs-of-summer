// ====== SIMPLE PASSWORD GATE ======
// Note: this is a light deterrent, not real security — anyone who opens
// dev tools/view-source can read the password below. Fine for keeping
// the page out of casual/search traffic; don't use it to protect
// anything sensitive.
//
// To set the password: just edit the line below.

const PASSWORD = "summer2026";
const UNLOCK_KEY = "sots_unlocked_v1";

function showGate() {
  document.getElementById('gate-overlay').style.display = 'flex';
}
function hideGate() {
  document.getElementById('gate-overlay').style.display = 'none';
}

function checkPassword() {
  const input = document.getElementById('gate-input');
  const errorEl = document.getElementById('gate-error');

  if (input.value === PASSWORD) {
    localStorage.setItem(UNLOCK_KEY, '1');
    hideGate();
  } else {
    errorEl.style.display = 'block';
    input.value = '';
    input.focus();
  }
}

if (localStorage.getItem(UNLOCK_KEY) === '1') {
  hideGate();
} else {
  showGate();
  document.getElementById('gate-form').addEventListener('submit', (e) => {
    e.preventDefault();
    checkPassword();
  });
}
