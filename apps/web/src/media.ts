let stream: MediaStream | null = null;
function notifyMediaChanged() {
  window.dispatchEvent(new Event('callyou:media-changed'));
}
export async function requestMedia(video = true, audio = true) {
  stream?.getTracks().forEach((track) => track.stop());
  stream = await navigator.mediaDevices.getUserMedia({ video, audio });
  notifyMediaChanged();
  return stream;
}
export function currentMedia() {
  return stream;
}
export async function replaceDevice(kind: 'videoinput' | 'audioinput', deviceId: string) {
  const constraints =
    kind === 'videoinput'
      ? { video: { deviceId: { exact: deviceId } }, audio: false }
      : { audio: { deviceId: { exact: deviceId } }, video: false };
  const fresh = await navigator.mediaDevices.getUserMedia(constraints);
  const old = stream
    ?.getTracks()
    .find((t) => t.kind === (kind === 'videoinput' ? 'video' : 'audio'));
  old?.stop();
  if (!stream) stream = new MediaStream();
  if (old) stream.removeTrack(old);
  stream.addTrack(fresh.getTracks()[0]!);
  notifyMediaChanged();
  return stream;
}
export function stopMedia() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}
