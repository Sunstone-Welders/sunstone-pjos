'use client';

import { useEffect } from 'react';
import { ensureNativeCookie } from '@/lib/native';

export default function NativeBoot() {
  useEffect(() => {
    ensureNativeCookie();
  }, []);
  return null;
}
