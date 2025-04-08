import { reactiveValueSuffix } from './dist/reactive-value-suffix.js';
import { storeStateSuffix } from './dist/store-state-suffix.js';

const plugin = {
  meta: {
    name: 'eslint-custom-rules-plugin',
    version: '1.0.0',
  },
  rules: {
    'reactive-value-suffix': reactiveValueSuffix,
    'store-state-suffix': storeStateSuffix,
  },
};
export default plugin;
