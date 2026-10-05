import test from 'node:test';
import assert from 'node:assert/strict';
import {formatTime} from '../src/format.js';
test('Time labels carry rounded seconds into minutes and support long races', () => {
 for (const [seconds, expected] of [[0,'0:00'],[9.5,'0:10'],[59.4,'0:59'],[59.6,'1:00'],[60,'1:00'],[368.2,'6:08'],[920.5,'15:21'],[3600,'60:00']]) assert.equal(formatTime(seconds),expected);
});
