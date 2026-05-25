export interface WeatherOverlayConfig {
  name: string;
  filePath: string;
}

export interface TTRPGMusicPlayerSettings {
  audioFolder: string;
  weatherOverlays: WeatherOverlayConfig[];
  crossfadeDuration: number;
}

export const DEFAULT_SETTINGS: TTRPGMusicPlayerSettings = {
  audioFolder: "Jukebox",
  weatherOverlays: [
    { name: "🌧️ Rain", filePath: "z_music/Ambience/Soft_Rain.mp3" },
    { name: "⛈️ Storm", filePath: "z_music/Ambience/Heavy_Storm.wav" },
  ],
  crossfadeDuration: 2.5,
};

export const VIEW_TYPE_TTRPG_MUSIC = "ttrpg-music-view";
