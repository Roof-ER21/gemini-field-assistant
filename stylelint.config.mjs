export default {
  extends: ['stylelint-config-standard'],
  rules: {
    'declaration-property-value-disallowed-list': {
      color: ['var(--roof-red)', 'var(--roof-red-dark)', 'var(--roof-red-light)'],
    },
  },
};
