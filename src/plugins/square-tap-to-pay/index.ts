import { registerPlugin } from '@capacitor/core';
import type { SquareTapToPayPlugin } from './definitions';

const SquareTapToPay = registerPlugin<SquareTapToPayPlugin>('SquareTapToPay', {
  web: () => import('./web').then((m) => new m.SquareTapToPayWeb()),
});

export * from './definitions';
export { SquareTapToPay };
