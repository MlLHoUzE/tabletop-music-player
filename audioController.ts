import { App } from "obsidian";
import TTRPGMusicPlayerPlugin from "./main";

export class HTML5AudioController {
  private app: App;
  private plugin: TTRPGMusicPlayerPlugin;
  private statusBar: HTMLElement | null = null;

  // Core Crossfade Channels (Two elements alternating roles) 🎧
  private channel1: HTMLAudioElement;
  private channel2: HTMLAudioElement;
  private activeChannel: HTMLAudioElement;

  // Master Config state tracking
  private playlist: string[] = [];
  private currentTrackIndex: number = 0;
  private masterMusicVolume: number = 0.7; // Stores user mix level from slider
  private crossfadeDurationMs: number = 2500; // 2.5 second cinematic blend
  private fadeIntervalId: ReturnType<typeof setInterval> | null = null;

  // Independent Looping Environmental Weather Overlay Channel 🌧️
  private weatherAudio: HTMLAudioElement;

  public onTrackChange: (trackName: string) => void = () => {};

  constructor(app: App, plugin: TTRPGMusicPlayerPlugin) {
    this.app = app;
    this.plugin = plugin;

    // Initialize dual music players
    this.channel1 = new Audio();
    this.channel2 = new Audio();

    // Both channels share the same track completion listener layout
    this.channel1.addEventListener("ended", () => this.handleTrackEnded());
    this.channel2.addEventListener("ended", () => this.handleTrackEnded());

    // Default assignment pointer
    this.activeChannel = this.channel1;

    // Initialize weather channel
    this.weatherAudio = new Audio();
    this.weatherAudio.loop = true;
  }

  public startPlaylist(tracks: string[], shuffle: boolean = false) {
    if (tracks.length === 0) return;

    let targetTracks = [...tracks];
    if (shuffle) {
      for (let i = targetTracks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [targetTracks[i], targetTracks[j]] = [targetTracks[j], targetTracks[i]];
      }
    }

    this.playlist = targetTracks;
    this.currentTrackIndex = 0;
    this.executeCrossfade();
  }

  /**
   * Alternates active channels and interpolates volumes over a timed window
   */
  private executeCrossfade() {
    if (this.playlist.length === 0) return;

    const currentPath = this.playlist[this.currentTrackIndex];
    const file = this.app.vault.getAbstractFileByPath(currentPath);

    if (!file) {
      // Safety: Skip broken paths immediately using our single-step lookahead cursor
      this.currentTrackIndex =
        (this.currentTrackIndex + 1) % this.playlist.length;
      this.executeCrossfade();
      return;
    }

    // Determine who fades OUT and who fades IN
    const oldChannel = this.activeChannel;
    const newChannel =
      oldChannel === this.channel1 ? this.channel2 : this.channel1;

    // Stage the incoming asset channel at zero volume
    newChannel.src = this.app.vault.adapter.getResourcePath(file.path);
    newChannel.volume = 0;

    // Clear any running crossover intervals to prevent volume fighting
    if (this.fadeIntervalId) clearInterval(this.fadeIntervalId);

    newChannel
      .play()
      .then(() => {
        this.activeChannel = newChannel; // Shift reference pointer immediately
        this.updateStatusBar();
        this.onTrackChange(file.name);

        // Initialize the mixing curve timeline tracking variables
        const stepTimeMs = 50;
        const totalSteps = this.crossfadeDurationMs / stepTimeMs;
        let currentStep = 0;

        const startOldVol = oldChannel.volume;
        const targetNewVol = this.masterMusicVolume;

        this.fadeIntervalId = setInterval(() => {
          currentStep++;
          const progress = currentStep / totalSteps;

          // 1. Linearly blend the new track up to master slider level
          newChannel.volume = progress * targetNewVol;

          // 2. Linearly blend the old track down to absolute silence
          if (oldChannel.src) {
            oldChannel.volume = Math.max(0, startOldVol * (1 - progress));
          }

          // Once the duration window expires, clear state loops completely
          if (currentStep >= totalSteps) {
            if (this.fadeIntervalId !== null) {
              clearInterval(this.fadeIntervalId);
              this.fadeIntervalId = null;
            }

            // Park the faded element safely
            oldChannel.pause();
            oldChannel.src = "";

            // Assert locked target levels
            newChannel.volume = this.masterMusicVolume;
          }
        }, stepTimeMs);
      })
      .catch((err) => {
        console.error("Crossfade track blocked by browser rule:", err);
        // Fallback: forcefully swap indices if initialization errors out
        this.activeChannel = newChannel;
        newChannel.volume = this.masterMusicVolume;
      });
  }

  private handleTrackEnded() {
    if (this.playlist.length === 0) return;
    this.activeChannel.currentTime = 0;
    this.activeChannel
      .play()
      .catch((err) => console.error("Loop replay blocked:", err));
  }

  public skipTrack() {
    if (this.playlist.length <= 1) return;
    // 1. Manually advance the queue cursor index
    this.currentTrackIndex =
      (this.currentTrackIndex + 1) % this.playlist.length;

    // 2. Execute a smooth crossfade into the next song in line
    this.executeCrossfade();
  }

  public setMusicVolume(level: number) {
    this.masterMusicVolume = Math.max(0, Math.min(1, level));
    // Dynamically correct volume adjustments if a track is actively playing
    if (!this.activeChannel.paused && !this.fadeIntervalId) {
      this.activeChannel.volume = this.masterMusicVolume;
    }
  }

  public setWeatherVolume(level: number) {
    this.weatherAudio.volume = Math.max(0, Math.min(1, level));
  }

  public startWeatherOverlay(vaultPath: string) {
    const file = this.app.vault.getAbstractFileByPath(vaultPath);
    if (!file) return;
    this.weatherAudio.src = this.app.vault.adapter.getResourcePath(file.path);
    this.weatherAudio.play().catch((err) => console.error(err));
  }

  public stopWeatherOverlay() {
    this.weatherAudio.pause();
    this.weatherAudio.src = "";
  }

  public play() {
    if (this.activeChannel.src) this.activeChannel.play();
    if (this.weatherAudio.src) this.weatherAudio.play();
    this.updateStatusBar();
  }

  public pause() {
    this.activeChannel.pause();
    this.weatherAudio.pause();
    this.updateStatusBar();
  }

  public registerStatusBar(el: HTMLElement) {
    this.statusBar = el;
    this.updateStatusBar();
  }

  private updateStatusBar() {
    if (!this.statusBar) return;
    this.statusBar.setText(
      this.activeChannel.paused ? "🎵 Music Paused" : "🎵 Music Active",
    );
  }

  public destroy() {
    if (this.fadeIntervalId !== null) {
      clearInterval(this.fadeIntervalId);
      this.fadeIntervalId = null;
    }
    this.channel1.pause();
    this.channel2.pause();
    this.weatherAudio.pause();
    this.channel1.src = "";
    this.channel2.src = "";
    this.weatherAudio.src = "";
  }
}
