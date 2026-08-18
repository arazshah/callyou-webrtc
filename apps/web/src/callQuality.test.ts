import { describe, expect, it } from 'vitest';
import { qualityLevel } from './callQuality';

describe('qualityLevel', () => {
  it('classifies healthy calls', () => {
    expect(qualityLevel({ rttMs: 80, jitterMs: 12, packetLossPercent: 0.5 })).toBe('good');
  });
  it('classifies degraded calls', () => {
    expect(qualityLevel({ rttMs: 280, jitterMs: 10, packetLossPercent: 1 })).toBe('fair');
  });
  it('uses the worst observed signal', () => {
    expect(qualityLevel({ rttMs: 70, jitterMs: 90, packetLossPercent: 0 })).toBe('poor');
  });
});
