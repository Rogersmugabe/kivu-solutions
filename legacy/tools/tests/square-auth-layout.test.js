const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

test('A01: index.html has Square-inspired split-screen auth structure', () => {
  const html = fs.readFileSync('index.html', 'utf8');

  // Verify key layout containers
  assert.ok(html.includes('square-auth-screen'), 'Contains square-auth-screen class');
  assert.ok(html.includes('square-auth-layout'), 'Contains square-auth-layout grid');
  assert.ok(html.includes('square-auth-form-col'), 'Contains form column');
  assert.ok(html.includes('square-auth-hero-col'), 'Contains right hero column');

  // Verify hero elements
  assert.ok(html.includes('authHeroSignup'), 'Contains authHeroSignup');
  assert.ok(html.includes('authHeroLogin'), 'Contains authHeroLogin');
  assert.ok(html.includes('Join the 4,000+ businesses running with Kivu'), 'Contains signup hero headline');
  assert.ok(html.includes("See what's possible with Kivu Business"), 'Contains signin hero headline');

  // Verify password toggles
  assert.ok(html.includes('togglePasswordVisibility'), 'Contains togglePasswordVisibility triggers');
  assert.ok(html.includes('btn-password-toggle'), 'Contains password toggle buttons');

  // Verify locale dropdown & terms
  assert.ok(html.includes('square-locale-field'), 'Contains Square-style locale selector');
  assert.ok(html.includes('termsAgreementCheckbox'), 'Contains terms agreement checkbox');
});

test('A02: All 15 required baseline auth DOM IDs are present', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const requiredIds = [
    'authScreen',
    'loginTab',
    'signupTab',
    'loginForm',
    'signupForm',
    'ownerLoginMode',
    'staffLoginMode',
    'ownerLoginFields',
    'staffLoginFields',
    'ownerSignupMode',
    'staffSignupMode',
    'ownerSignupFields',
    'staffSignupFields',
    'forgotPasswordBtn',
    'authMsg'
  ];

  requiredIds.forEach(id => {
    assert.ok(html.includes(`id="${id}"`), `Must contain baseline ID: id="${id}"`);
  });
});

test('A03: All required form input names are preserved for Supabase auth flow', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const requiredInputs = [
    'name="email"',
    'name="password"',
    'name="phone"',
    'name="pin"',
    'name="ownerFullName"',
    'name="shopName"',
    'name="ownerEmail"',
    'name="ownerPassword"',
    'name="staffFullName"',
    'name="inviteCode"',
    'name="staffPhone"',
    'name="staffPin"'
  ];

  requiredInputs.forEach(inputAttr => {
    assert.ok(html.includes(inputAttr), `Must contain input attribute: ${inputAttr}`);
  });
});
