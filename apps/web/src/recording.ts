type RecordingSources = {
  localVideo: HTMLVideoElement;
  remoteVideo: HTMLVideoElement;
  localAudio: MediaStream | null;
  remoteAudio: MediaStream | null;
};

export type CallRecording = { stop: () => Promise<Blob>; mimeType: string };

function supportedMimeType() {
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

function drawVideo(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  x: number,
  y: number,
  width: number,
  height: number,
  fit: 'cover' | 'contain' = 'cover',
) {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
  const sourceRatio = video.videoWidth / Math.max(1, video.videoHeight);
  const targetRatio = width / height;
  let sx = 0;
  let sy = 0;
  let sw = video.videoWidth;
  let sh = video.videoHeight;
  if (fit === 'contain') {
    let dw = width;
    let dh = height;
    if (sourceRatio > targetRatio) dh = width / sourceRatio;
    else dw = height * sourceRatio;
    context.drawImage(video, x + (width - dw) / 2, y + (height - dh) / 2, dw, dh);
    return;
  }
  if (sourceRatio > targetRatio) {
    sw = video.videoHeight * targetRatio;
    sx = (video.videoWidth - sw) / 2;
  } else {
    sh = video.videoWidth / targetRatio;
    sy = (video.videoHeight - sh) / 2;
  }
  context.drawImage(video, sx, sy, sw, sh, x, y, width, height);
}

export async function startCallRecording(sources: RecordingSources): Promise<CallRecording> {
  if (!('MediaRecorder' in window)) throw new Error('recording_not_supported');
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const context = canvas.getContext('2d');
  if (!context || !canvas.captureStream) throw new Error('recording_not_supported');
  let frame = 0;
  const render = () => {
    context.fillStyle = '#101827';
    context.fillRect(0, 0, canvas.width, canvas.height);
    drawVideo(context, sources.remoteVideo, 0, 0, canvas.width, canvas.height, 'contain');
    context.fillStyle = '#1e293b';
    context.fillRect(934, 510, 320, 180);
    drawVideo(context, sources.localVideo, 934, 510, 320, 180);
    context.strokeStyle = 'rgba(255,255,255,.85)';
    context.lineWidth = 3;
    context.strokeRect(934, 510, 320, 180);
    frame = requestAnimationFrame(render);
  };
  render();
  const composed = canvas.captureStream(30);
  const AudioContextClass = window.AudioContext;
  const audio = new AudioContextClass();
  const destination = audio.createMediaStreamDestination();
  const audioSources: MediaStreamAudioSourceNode[] = [];
  for (const stream of [sources.localAudio, sources.remoteAudio]) {
    if (!stream?.getAudioTracks().length) continue;
    const source = audio.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
    source.connect(destination);
    audioSources.push(source);
  }
  destination.stream.getAudioTracks().forEach((track) => composed.addTrack(track));
  const mimeType = supportedMimeType();
  const recorder = new MediaRecorder(composed, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
  recorder.start(1000);
  return {
    mimeType: recorder.mimeType || mimeType || 'video/webm',
    stop: () =>
      new Promise<Blob>((resolve, reject) => {
        recorder.onerror = () => reject(new Error('recording_failed'));
        recorder.onstop = () => {
          cancelAnimationFrame(frame);
          composed.getTracks().forEach((track) => track.stop());
          audioSources.forEach((source) => source.disconnect());
          void audio.close();
          resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' }));
        };
        recorder.stop();
      }),
  };
}

export function downloadRecording(blob: Blob, slug: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `CallYou-${slug}-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
