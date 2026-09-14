import {describe,it,expect} from 'vitest';
import {can,hasFeature} from '@contentra/core';
import {generateApiKey,hashApiKey} from '../src/security.js';
describe('authorization',()=>{it('viewer cannot publish',()=>expect(can('VIEWER','content.publish')).toBe(false));it('member can create content',()=>expect(can('MEMBER','content.create')).toBe(true));it('business includes business intelligence',()=>expect(hasFeature('BUSINESS','business_intelligence')).toBe(true))});
describe('api keys',()=>{it('stores only a hash',()=>{const k=generateApiKey();expect(k.raw).not.toBe(k.hash);expect(hashApiKey(k.raw)).toBe(k.hash)})});
