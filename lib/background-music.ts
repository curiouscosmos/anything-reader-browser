export type BackgroundMusicSourceKind = 'builtin' | 'custom';

export type BackgroundMusicTrack = {
  id: string;
  label: string;
  kind: BackgroundMusicSourceKind;
  assetPath?: string;
  dataUrl?: string;
  mimeType?: string;
  createdAt?: number;
};

export const BACKGROUND_MUSIC_STORAGE_KEYS = {
  enabled: 'ar-background-music-enabled',
  trackId: 'ar-background-music-track-id',
  volume: 'ar-background-music-volume',
  customTracks: 'ar-background-music-custom-tracks',
} as const;

const BUILTIN_BACKGROUND_MUSIC_FILES = [
  'A-very-happy-christmas.mp3',
  'Beautiful-dream.mp3',
  'Forest-treasure.mp3',
  'Silent-descent.mp3',
  'Staring-at-the-night-sky.mp3',
  'Wedding.mp3',
  'meditation.mp3',
];

export const DEFAULT_BACKGROUND_MUSIC_VOLUME = 18;

export const BUILTIN_BACKGROUND_MUSIC_TRACKS: BackgroundMusicTrack[] = BUILTIN_BACKGROUND_MUSIC_FILES.map((fileName) => {
  const stem = fileName.replace(/\.[^.]+$/, '');
  return {
    id: `builtin:${stem.toLowerCase()}`,
    label: humanizeTrackLabel(stem),
    kind: 'builtin',
    assetPath: `audio/${fileName}`,
  };
});

export function getDefaultBackgroundMusicTrackId() {
  return BUILTIN_BACKGROUND_MUSIC_TRACKS.find((track) => track.label === 'Wedding')?.id
    ?? BUILTIN_BACKGROUND_MUSIC_TRACKS[0]?.id
    ?? 'builtin:default';
}

export function normalizeBackgroundMusicTrackId(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return getDefaultBackgroundMusicTrackId();
  }

  return value;
}

export function getBuiltinBackgroundMusicTrack(trackId: string) {
  return BUILTIN_BACKGROUND_MUSIC_TRACKS.find((track) => track.id === trackId) ?? null;
}

export function createUploadedBackgroundMusicTrack(fileName: string, dataUrl: string, mimeType?: string): BackgroundMusicTrack {
  return {
    id: `custom:${createTrackId()}`,
    label: fileName || 'Uploaded audio',
    kind: 'custom',
    dataUrl,
    mimeType,
    createdAt: Date.now(),
  };
}

export function mergeBackgroundMusicTracks(customTracks: BackgroundMusicTrack[]) {
  return [...BUILTIN_BACKGROUND_MUSIC_TRACKS, ...customTracks.filter((track) => track.kind === 'custom')];
}

export function humanizeTrackLabel(value: string) {
  return value
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function createTrackId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
