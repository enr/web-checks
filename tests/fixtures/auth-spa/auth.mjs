export default {
  steps: [
    { setLocalStorage: { key: 'token', value: 'abc123' } },
    { goto: '/' },
  ],
  ready: { selector: '[data-testid=app-shell]' },
};
