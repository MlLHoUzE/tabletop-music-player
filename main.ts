import { Plugin, Notice } from "obsidian";
import { HTML5AudioController } from "./audioController";
import { TrackManager } from "./trackManager";
import { TTRPGMusicPlayerSettingTab } from "./settingsTab";
import { TTRPGMusicView } from "./musicView";
import {
  TTRPGMusicPlayerSettings,
  DEFAULT_SETTINGS,
  VIEW_TYPE_TTRPG_MUSIC,
} from "./types";

export default class TTRPGMusicPlayerPlugin extends Plugin {
  public audioPlayer!: HTML5AudioController;
  public trackManager!: TrackManager;
  public settings!: TTRPGMusicPlayerSettings;

  async onload() {
    await this.loadSettings();

    this.audioPlayer = new HTML5AudioController(this.app, this);
    this.trackManager = new TrackManager(this.app, this);

    this.addSettingTab(new TTRPGMusicPlayerSettingTab(this.app, this));

    // Register the sidebar panel view container
    this.registerView(
      VIEW_TYPE_TTRPG_MUSIC,
      (leaf) => new TTRPGMusicView(leaf, this),
    );

    this.addRibbonIcon("music", "TTRPG Music Player", () => {
      this.activateView();
    });

    const statusBarItemEl = this.addStatusBarItem();
    this.audioPlayer.registerStatusBar(statusBarItemEl);

    // --- REGISTER THE INLINE CLICK-TO-PLAY POST-PROCESSOR ---
    this.registerMarkdownPostProcessor((element, _context) => {
      // Find all standard markdown links rendered in the note view
      const links = element.querySelectorAll<HTMLAnchorElement>(
        "a.internal-link, a.external-link",
      );

      links.forEach((linkEl: HTMLAnchorElement) => {
        const href = linkEl.getAttribute("href") || "";

        // Check if the link target uses our custom music URI scheme
        if (href.startsWith("ttrpg-music:")) {
          // Convert the generic hyperlink into a tactical layout action button
          linkEl.classList.add("ttrpg-inline-command-btn");

          // Prepend a nice functional play icon
          const iconSpan = document.createElement("span");
          iconSpan.textContent = "🔊 ";
          linkEl.prepend(iconSpan);

          // Hijack the click event so it triggers audio instead of navigating pages
          this.registerDomEvent(linkEl, "click", (e) => {
            e.preventDefault();
            e.stopPropagation();

            this.handleInlineCommand(href);
          });
        }
      });
    });

    // --- REGISTER GLOBAL TACTICAL KEYBOARD COMMAND HOTKEYS ---

    // 1. Play/Resume Hotkey Command
    this.addCommand({
      id: "ttrpg-music-play",
      name: "Play / Resume Audio Channels",
      callback: () => {
        this.audioPlayer.play();
        new Notice("▶ Resuming Audio Channels");
      },
    });

    // 2. Pause Hotkey Command
    this.addCommand({
      id: "ttrpg-music-pause",
      name: "Pause Audio Channels",
      callback: () => {
        this.audioPlayer.pause();
        new Notice("⏸ Audio Channels Paused");
      },
    });

    // 3. Skip Track Hotkey Command
    this.addCommand({
      id: "ttrpg-music-skip",
      name: "Skip to Next Track",
      callback: () => {
        this.audioPlayer.skipTrack();
        // Notice updates automatically from our audioPlayer's onTrackChange callback!
      },
    });

    // 4. Stop Everything Master Panic Button Hotkey Command
    this.addCommand({
      id: "ttrpg-music-stop-all",
      name: "Stop Everything (Music + Weather)",
      callback: () => {
        this.audioPlayer.pause();
        this.audioPlayer.stopWeatherOverlay();
        new Notice("🛑 Stopped All Background Ambience & Music");
      },
    });
  }

  /**
   * Parses the custom URI structure and fires off the background audio lanes
   */
  private handleInlineCommand(uri: string) {
    // Example URIs:
    // "ttrpg-music:playlist:dragon-fight"
    // "ttrpg-music:track:z_music/Battle.mp3"
    const parts = uri.split(":");
    if (parts.length < 3) return;

    const commandType = parts[1].toLowerCase().trim();
    // Re-join the remaining parts in case your local audio file path contains colons
    const targetPayload = parts.slice(2).join(":").trim();

    if (commandType === "playlist") {
      const tracks = this.trackManager.getTracksByPlaylistId(targetPayload);
      if (tracks.length > 0) {
        this.audioPlayer.startPlaylist(tracks, false); // Playlists never shuffle
        new Notice(`⚡ Inline Loading Playlist: "${targetPayload}"`);
      } else {
        new Notice(
          `❌ Inline Error: No playlist found matching ID "${targetPayload}"`,
        );
      }
    } else if (commandType === "track") {
      // Verify if the standalone path points to a valid asset configuration
      const file = this.app.vault.getAbstractFileByPath(targetPayload);
      if (file) {
        // Load the single isolated track into our playlist engine
        this.audioPlayer.startPlaylist([targetPayload], false);
        new Notice(`⚡ Inline Playing Track: ${file.name}`);
      } else {
        new Notice(
          `❌ Inline Error: Track path not found at "${targetPayload}"`,
        );
      }
    }
  }

  onunload() {
    this.audioPlayer.destroy(); //always clean up audio memory
  }

  async activateView() {
    const { workspace } = this.app;

    let leaf = workspace.getLeavesOfType(VIEW_TYPE_TTRPG_MUSIC)[0];

    if (!leaf) {
      //create a new leaf in the right sidebar pane
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        leaf = rightLeaf;
        await leaf.setViewState({
          type: VIEW_TYPE_TTRPG_MUSIC,
          active: true,
        });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
