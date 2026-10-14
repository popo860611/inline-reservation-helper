const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
require('../common.js');
const common = globalThis.InlineHelperCommon;
const source = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const flush = () => new Promise(setImmediate);

async function testFinalMode(autoSubmit, overrides = {}, stateOverrides = {}, expected = 'submit', options = {}) {
  let reservation = {
    enabled: true, autoSubmit, restaurantQuery: 'https://inline.app/booking/-company/-branch',
    contactName: '測試', contactPhone: '0912345678', dateStart: '2026-10-14', dateEnd: '2026-10-14',
    timeStart: '12:00', timeEnd: '12:30', ...overrides
  };
  let state = JSON.stringify({ selectedDate: '2026-10-14', selectedMinutes: 720, detailsReached: true, ...stateOverrides });
  let clicks = 0;
  const messages = [];
  const nodes = new Map();
  const button = {
    tagName: 'BUTTON', textContent: options.authorization ? '授權信用卡及確認訂位' : '確認訂位', disabled: Boolean(options.disabled),
    classList: { contains: () => false }, getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 100, height: 40 }),
    click: () => {
      assert.ok(reservation.submitAttemptedAt, 'Persist the attempt before clicking');
      assert.ok(JSON.parse(state).submitAttemptedAt);
      clicks++;
    }
  };
  const document = {
    documentElement: { dataset: {}, appendChild: (node) => nodes.set('#' + node.id, node) },
    body: { innerText: '' },
    querySelector: (selector) => nodes.get(selector) || null,
    querySelectorAll: (selector) => {
      if (selector === 'input[required], textarea[required], select[required]' && options.missingRequired) return [{
        checkValidity: () => false, getBoundingClientRect: () => ({ width: 100, height: 40 }),
        style: {}, scrollIntoView() {}, placeholder: '備註'
      }];
      return selector === 'button' || selector === 'button, [role="button"]' ? [button] : [];
    },
    createElement: () => ({ style: {}, addEventListener() {}, attachShadow: () => ({ querySelector: () => ({ addEventListener() {}, focus() {} }) }) })
  };
  const chrome = {
    runtime: { sendMessage: async (message) => { messages.push(message); return { active: true }; }, onMessage: { addListener() {} } },
    storage: { local: { get: async () => ({ reservation }), set: async (update) => { if (update.reservation) reservation = update.reservation; } }, onChanged: { addListener() {} } }
  };
  const context = {
    document, chrome, InlineHelperCommon: common,
    location: { href: reservation.restaurantQuery + '/form', search: '', pathname: '/booking/-company/-branch/form' },
    URLSearchParams, sessionStorage: { getItem: () => state, setItem: (_, value) => { state = value; } },
    MutationObserver: class { observe() {} disconnect() {} },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    setTimeout: () => 0, clearTimeout() {}
  };
  vm.runInNewContext(source('content.js'), context);
  await flush();
  const statuses = () => messages.filter((message) => message.type === 'FLOW_STATUS');
  if (expected === 'submit') {
    assert.equal(clicks, 1);
    // A new injected instance must also respect the task-wide attempt marker.
    document.documentElement.dataset.inlineHelperVersion = '';
    vm.runInNewContext(source('content.js'), context);
    await flush();
    assert.equal(clicks, 1);
    assert.equal(statuses().at(-1).status, '請確認');
  } else {
    assert.equal(clicks, 0);
    assert.equal(statuses().at(-1).status, expected);
    if (expected === '預演完成') assert.equal(reservation.enabled, false);
  }
}

async function testPopupModes() {
  const stored = { reservation: {
    autoSubmit: true, restaurantQuery: 'https://inline.app/booking/-company/-branch',
    dateStart: '2026-10-14', dateEnd: '2026-10-14', timeStart: '12:00', timeEnd: '12:30',
    adults: 2, children: 0, contactName: '測試', contactPhone: '0912345678',
    releaseAt: '2099-01-01T12:00', prepMinutes: 5
  } };
  const elements = new Map();
  const messages = [];
  function element(selector) {
    if (!elements.has(selector)) elements.set(selector, {
      _value: '', get value() { return this._value; }, set value(value) { this._value = String(value); }, type: selector === '#live-mode' ? 'checkbox' : 'text', checked: false,
      textContent: '', listeners: {}, attributes: {}, classList: { remove() {}, add() {}, toggle() {} },
      addEventListener(type, handler) { this.listeners[type] = handler; },
      setAttribute(name, value) { this.attributes[name] = value; }, focus() {}
    });
    return elements.get(selector);
  }
  const chrome = {
    runtime: { sendMessage: async (message) => { messages.push(message); return { ok: true, version: '0.3.51', mode: 'url' }; } },
    storage: { local: { get: async () => stored, set: async (updates) => Object.assign(stored, updates), remove: async () => {} } },
    tabs: { query: async () => [] }, alarms: { get: async () => null }
  };
  const context = { chrome, InlineHelperCommon: common, performance: { now: () => 0 },
    document: { querySelector: element, addEventListener() {} }, window: { addEventListener() {} } };
  async function open() {
    elements.clear();
    vm.runInNewContext(source('popup.js'), { ...context });
    await flush();
  }
  const click = async (selector) => { await element(selector).listeners.click(); await flush(); };
  await open();
  assert.equal(element('#mode-toggle').textContent, '實際｜自動確認');
  await click('#mode-toggle');
  assert.equal(element('#mode-toggle').attributes['aria-pressed'], 'false');
  await click('#save-settings');
  assert.equal(stored.reservation.autoSubmit, false);
  await open();
  assert.equal(element('#mode-toggle').textContent, '預演｜不送出');
  await click('#mode-toggle');
  await click('#open-now');
  assert.equal(messages.find((message) => message.type === 'OPEN_NOW').reservation.autoSubmit, true);
  await click('#schedule');
  assert.equal(stored.reservation.autoSubmit, true);
  assert.ok(messages.some((message) => message.type === 'SCHEDULE'));
  await click('#resume-current-flow');
  assert.equal(stored.reservation.autoSubmit, true);
  stored.reservation = { ...stored.reservation, autoSubmit: undefined };
  await open();
  assert.equal(element('#live-mode').checked, false);
}

async function testUpdateStopsTask(reload) {
  const stored = { flowScopeMigration: reload ? '0.3.51' : '0.3.32',
    reloadInlineAfterExtensionRestart: reload, reservation: { enabled: true, autoSubmit: true } };
  const chrome = {
    storage: { local: {
      get: async () => stored, set: async (updates) => Object.assign(stored, updates), remove: async () => {}
    } },
    runtime: { onMessage: { addListener() {} }, onStartup: { addListener() {} }, onInstalled: { addListener() {} } },
    tabs: { query: async () => [] }, alarms: { onAlarm: { addListener() {} } }
  };
  vm.runInNewContext(source('background.js'), { chrome, InlineHelperCommon: common, importScripts() {} });
  await flush();
  assert.equal(stored.reservation.enabled, false);
  assert.equal(stored.reservation.autoSubmit, true);
}

Promise.all([
  testPopupModes(),
  testUpdateStopsTask(false),
  testUpdateStopsTask(true),
  testFinalMode(false, {}, {}, '預演完成'),
  testFinalMode(true),
  testFinalMode(true, {}, {}, '缺必填', { missingRequired: true }),
  testFinalMode(true, {}, {}, '等待頁面', { disabled: true }),
  testFinalMode(false, {}, {}, '待手動授權', { authorization: true }),
  testFinalMode(true, {}, {}, '待手動授權', { authorization: true }),
  testFinalMode(true, { manualPaymentRequired: true }, {}, '待手動授權'),
  testFinalMode(true, {}, { selectedDate: '2026-10-15' }, '請核對時段'),
  testFinalMode(false, {}, { selectedMinutes: 800 }, '請核對時段'),
  testFinalMode(true, {}, { selectedMinutes: undefined }, '請核對時段'),
  testFinalMode(true, { contactPhone: '' }, {}, '缺資料'),
  testFinalMode(true, { submitAttemptedAt: 1 }, {}, '請確認')
]).then(() => console.log('Run mode integration tests passed.')).catch((error) => { console.error(error); process.exitCode = 1; });
