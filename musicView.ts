import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import TTRPGMusicPlayerPlugin from "./main";
import { VIEW_TYPE_TTRPG_MUSIC } from "./types";

export class TTRPGMusicView extends ItemView {
  private plugin: TTRPGMusicPlayerPlugin;

  // Hardcoded tactical values for instant gameplay buttons
  private biomes = ["Forest", "Marine", "Highlands", "Dungeon", "Settlement"];
  private tones = ["Calm", "Mysterious", "Tense", "Epic", "Spooky", "Somber"];
  private intensities = ["Low", "Medium", "High"];

  private selectedBiome: string | null = null;
  private selectedTone: string | null = null;
  private selectedIntensity: string | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: TTRPGMusicPlayerPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_TTRPG_MUSIC;
  }
  getDisplayText(): string {
    return "TTRPG Music Player";
  }
  getIcon(): string {
    return "music";
  }

  async onOpen() {
    const root = this.contentEl;
    root.empty();

    // Wrap inside a master class to squeeze out heading whitespace perfectly
    const container = root.createEl("div", { cls: "ttrpg-view-container" });

    // --- Now Playing Display (Single Line Format) ---
    const nowPlayingCard = container.createEl("div", {
      cls: "ttrpg-now-playing-card",
    });

    // Changed "span" with inline styles to a native "strong" tag 👇
    nowPlayingCard.createEl("strong", { text: "NOW PLAYING:" });

    const trackTitleDisplay = nowPlayingCard.createEl("div", {
      cls: "ttrpg-track-title-display",
      text: "No Track Active",
    });
    this.plugin.audioPlayer.onTrackChange = (name: string) =>
      trackTitleDisplay.setText(name);

    // --- Audio Control Row ---
    const controlsRow = container.createEl("div", {
      cls: "ttrpg-controls-row",
    });
    const playBtn = controlsRow.createEl("button", {
      text: "▶ Play",
      cls: "mod-cta",
    });
    const pauseBtn = controlsRow.createEl("button", { text: "⏸ Pause" });
    const skipBtn = controlsRow.createEl("button", { text: "⏭ Skip" });

    this.registerDomEvent(playBtn, "click", () =>
      this.plugin.audioPlayer.play(),
    );
    this.registerDomEvent(pauseBtn, "click", () =>
      this.plugin.audioPlayer.pause(),
    );
    this.registerDomEvent(skipBtn, "click", () =>
      this.plugin.audioPlayer.skipTrack(),
    );

    // --- LIVE MIXING PANEL SLIDERS ---
    const mixerPanel = container.createEl("div", { cls: "ttrpg-mixer-panel" });

    // Music Slider
    const musicRow = mixerPanel.createEl("div", { cls: "ttrpg-slider-row" });
    musicRow.createEl("span", { text: "🎵 Music:", cls: "ttrpg-slider-label" });
    const musicSlider = musicRow.createEl("input", {
      type: "range",
    }) as HTMLInputElement;
    musicSlider.value = "70";
    this.plugin.audioPlayer.setMusicVolume(0.7);
    this.registerDomEvent(musicSlider, "input", () =>
      this.plugin.audioPlayer.setMusicVolume(
        parseFloat(musicSlider.value) / 100,
      ),
    );

    // Weather Slider
    const weatherRow = mixerPanel.createEl("div", { cls: "ttrpg-slider-row" });
    weatherRow.createEl("span", {
      text: "🌧️ Weather:",
      cls: "ttrpg-slider-label",
    });
    const weatherSlider = weatherRow.createEl("input", {
      type: "range",
    }) as HTMLInputElement;
    weatherSlider.value = "50";
    this.plugin.audioPlayer.setWeatherVolume(0.5);
    this.registerDomEvent(weatherSlider, "input", () =>
      this.plugin.audioPlayer.setWeatherVolume(
        parseFloat(weatherSlider.value) / 100,
      ),
    );

    // --- BUTTON MATRIX FIELDS ---
    this.createButtonGrid(
      container,
      "Biomes",
      this.biomes,
      (val) => (this.selectedBiome = val),
    );
    this.createButtonGrid(
      container,
      "Tones",
      this.tones,
      (val) => (this.selectedTone = val),
    );
    this.createButtonGrid(
      container,
      "Intensity",
      this.intensities,
      (val) => (this.selectedIntensity = val),
    );

    // Load Trigger Row
    const actionRow = container.createEl("div", {
      cls: "ttrpg-button-container",
    });
    const loadTracksBtn = actionRow.createEl("button", {
      text: "⚡ Load Matrix",
      cls: "mod-cta",
    });

    this.registerDomEvent(loadTracksBtn, "click", () => {
      const tracks = this.plugin.trackManager.queryTracks({
        biome: this.selectedBiome || undefined,
        tone: this.selectedTone || undefined,
        intensity: this.selectedIntensity || undefined,
      });
      if (tracks.length > 0) {
        this.plugin.audioPlayer.startPlaylist(tracks, true);
        new Notice(`Shuffling ${tracks.length} matching tracks!`);
      } else {
        new Notice("❌ No matching tracks found in front matter.");
      }
    });

    container.createEl("hr", { cls: "ttrpg-divider-spaced" });

    container.createEl("hr", { cls: "ttrpg-divider-spaced" });

    // --- WEATHER LAYER OVERLAYS CONTROLLER ---
    container.createEl("h5", { text: "Weather Overlays" });
    const weatherGrid = container.createEl("div", { cls: "ttrpg-matrix-row" });

    // 1. ALWAYS render the "Clear" button first ☀️
    const clearBtn = weatherGrid.createEl("button", {
      text: "☀️ Clear",
      cls: "ttrpg-matrix-btn mod-cta",
    }) as HTMLButtonElement;

    // Keep a tracking list of buttons to toggle highlights
    const weatherBtns: HTMLButtonElement[] = [clearBtn];

    const setWeatherActive = (activeBtn: HTMLButtonElement) => {
      weatherBtns.forEach((btn) => btn.classList.remove("mod-cta"));
      activeBtn.classList.add("mod-cta");
    };

    this.registerDomEvent(clearBtn, "click", () => {
      setWeatherActive(clearBtn);
      this.plugin.audioPlayer.stopWeatherOverlay();
    });

    // 2. Dynamically loop through and generate your custom user buttons 🪄
    this.plugin.settings.weatherOverlays.forEach((overlay) => {
      if (!overlay.name.trim()) return; // Skip unnamed buttons

      const btn = weatherGrid.createEl("button", {
        text: overlay.name,
        cls: "ttrpg-matrix-btn",
      }) as HTMLButtonElement;
      weatherBtns.push(btn);

      this.registerDomEvent(btn, "click", () => {
        setWeatherActive(btn);

        if (!overlay.filePath.trim()) {
          new Notice(
            "❌ Error: No file path defined for this weather setting.",
          );
          return;
        }

        this.plugin.audioPlayer.startWeatherOverlay(overlay.filePath);
      });
    });

    container.createEl("hr", { cls: "ttrpg-divider-spaced" });

    // --- HARDCODED NOTE PLAYLIST LOADER ---
    container.createEl("h5", { text: "Playlist Notes" });

    const playlistInput = container.createEl("input", {
      type: "text",
      placeholder: "Enter Playlist Note ID...",
      cls: "ttrpg-full-width-input",
    }) as HTMLInputElement;

    const loadPlaylistBtn = container.createEl("button", {
      text: "📂 Load Playlist Note",
      cls: "ttrpg-full-width-btn",
    });

    this.registerDomEvent(loadPlaylistBtn, "click", () => {
      const id = playlistInput.value.trim();
      if (!id) return;

      const tracks = this.plugin.trackManager.getTracksByPlaylistId(id);

      if (tracks.length > 0) {
        this.plugin.audioPlayer.startPlaylist(tracks, false);
        new Notice(`Loading playlist: "${id}"`);
      } else {
        new Notice(`❌ No playlist found matching playlist_id: "${id}"`);
        playlistInput.focus();
        playlistInput.select();
      }
    });
  }

  private createButtonGrid(
    parent: HTMLElement,
    title: string,
    items: string[],
    stateCallback: (val: string | null) => void,
  ) {
    const section = parent.createEl("div", { cls: "ttrpg-matrix-section" });
    section.createEl("small", { text: title, cls: "ttrpg-matrix-title" });
    const row = section.createEl("div", { cls: "ttrpg-matrix-row" });
    const btnRefs: HTMLButtonElement[] = [];

    items.forEach((item) => {
      const btn = row.createEl("button", {
        text: item,
        cls: "ttrpg-matrix-btn",
      }) as HTMLButtonElement;
      this.registerDomEvent(btn, "click", () => {
        if (btn.classList.contains("mod-cta")) {
          btn.classList.remove("mod-cta");
          stateCallback(null);
        } else {
          btnRefs.forEach((b) => b.classList.remove("mod-cta"));
          btn.classList.add("mod-cta");
          stateCallback(item);
        }
      });
      btnRefs.push(btn);
    });
  }
}
