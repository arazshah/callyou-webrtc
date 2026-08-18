export type QualityLevel = 'unknown' | 'good' | 'fair' | 'poor';
export type ConnectionRoute = 'unknown' | 'direct' | 'relay';
export type CallQuality = {
  level: QualityLevel;
  rttMs: number | null;
  jitterMs: number | null;
  packetLossPercent: number | null;
  route: ConnectionRoute;
};

export const EMPTY_CALL_QUALITY: CallQuality = {
  level: 'unknown',
  rttMs: null,
  jitterMs: null,
  packetLossPercent: null,
  route: 'unknown',
};

export function qualityLevel({
  rttMs,
  jitterMs,
  packetLossPercent,
}: Pick<CallQuality, 'rttMs' | 'jitterMs' | 'packetLossPercent'>): QualityLevel {
  if (rttMs == null && jitterMs == null && packetLossPercent == null) return 'unknown';
  if (
    (rttMs != null && rttMs > 500) ||
    (jitterMs != null && jitterMs > 80) ||
    (packetLossPercent != null && packetLossPercent > 8)
  )
    return 'poor';
  if (
    (rttMs != null && rttMs > 250) ||
    (jitterMs != null && jitterMs > 40) ||
    (packetLossPercent != null && packetLossPercent > 3)
  )
    return 'fair';
  return 'good';
}

export async function readCallQuality(pc: RTCPeerConnection): Promise<CallQuality> {
  const stats = await pc.getStats();
  let received = 0;
  let lost = 0;
  let jitterTotal = 0;
  let jitterSamples = 0;
  let rttMs: number | null = null;
  let route: ConnectionRoute = 'unknown';
  let selectedLocalCandidateId: string | undefined;
  stats.forEach((report) => {
    if (report.type === 'inbound-rtp' && !report.isRemote) {
      received += Number(report.packetsReceived ?? 0);
      lost += Math.max(0, Number(report.packetsLost ?? 0));
      if (typeof report.jitter === 'number') {
        jitterTotal += report.jitter * 1000;
        jitterSamples += 1;
      }
    }
    if (
      report.type === 'candidate-pair' &&
      report.state === 'succeeded' &&
      (report.nominated || report.selected)
    ) {
      if (typeof report.currentRoundTripTime === 'number')
        rttMs = Math.round(report.currentRoundTripTime * 1000);
      selectedLocalCandidateId = report.localCandidateId as string | undefined;
    }
  });
  if (selectedLocalCandidateId) {
    const candidate = stats.get(selectedLocalCandidateId);
    if (candidate?.type === 'local-candidate')
      route = candidate.candidateType === 'relay' ? 'relay' : 'direct';
  }
  const packetLossPercent = received + lost > 0 ? (lost / (received + lost)) * 100 : null;
  const jitterMs = jitterSamples ? Math.round(jitterTotal / jitterSamples) : null;
  return {
    rttMs,
    jitterMs,
    packetLossPercent,
    route,
    level: qualityLevel({ rttMs, jitterMs, packetLossPercent }),
  };
}
