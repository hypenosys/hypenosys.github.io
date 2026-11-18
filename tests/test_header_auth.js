const assert = require('assert');

console.log('--- RUNNING HEADER AUTH PRESENCE TESTS ---');

// Simulated tests verifying elements in HTML files
const fs = require('fs');

const indexHtml = fs.readFileSync('index.html', 'utf8');
const dashboardHtml = fs.readFileSync('dashboard.html', 'utf8');
const globalHeaderJs = fs.readFileSync('assets/javascript/global-header.js', 'utf8');
const authJs = fs.readFileSync('assets/javascript/auth.js', 'utf8');

// 1. Check index.html includes global-header.js and auth.js
assert(indexHtml.includes('global-header.js'), 'index.html must load global-header.js');
assert(indexHtml.includes('auth.js'), 'index.html must load auth.js');
console.log('✓ Home page loads header and auth scripts');

// 2. Check global-header.js contains auth-nav-container
assert(globalHeaderJs.includes('auth-nav-container'), 'global-header.js must render auth-nav-container');
assert(globalHeaderJs.includes('auth-nav-container-left'), 'global-header.js must render auth-nav-container-left');
console.log('✓ Global header renders auth containers');

// 3. Check auth.js contains defensive null checks
assert(authJs.includes('if (!window.githubApi) return'), 'auth.js must include null check for githubApi');
assert(authJs.includes('container.innerHTML ='), 'auth.js must update container innerHTML');
console.log('✓ auth.js contains defensive null guards');

console.log('ALL HEADER AUTH PRESENCE TESTS PASSED SUCCESSFULLY!');
