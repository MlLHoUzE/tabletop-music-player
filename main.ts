import {App, Plugin, WorkspaceLeaf, Notice } from 'obsidian';

export const VIEW_TYPE_TTRPG_MUSIC = "ttrpg-music-view";

export class TrackManager {
    private app: App;
    constructor(app: App) { this.app = app; }

    /**
     * Filters vault markdown front matter, strictly limiting searches to the "Jukebox" root folder.
     */
    public queryTracks(filters: { biome?: string; tone?: string; intensity?: string }): string[] {
        const audioTracks: string[] = [];
        const files = this.app.vault.getMarkdownFiles();

        for (const file of files) {
            // PERFORMANCE SHIELD: Skip any file that isn't inside your Jukebox directory 🛡️
            if (!file.path.startsWith('Jukebox/')) continue;

            const cache = this.app.metadataCache.getFileCache(file);
            const frontmatter = cache?.frontmatter;
            if (!frontmatter || !frontmatter.file_path) continue;

            let matchesAll = true;
            
            const getCompareStr = (val: any) => String(val || "").toLowerCase().trim();
            const getExactPathStr = (val: any): string => {
                if (!val) return "";
                if (Array.isArray(val)) return String(val || "").trim();
                return String(val).trim();
            };

            const noteBiome = getCompareStr(frontmatter.biome);
            const noteTone = getCompareStr(frontmatter.tone);
            const noteIntensity = getCompareStr(frontmatter.intensity);

            if (filters.biome && noteBiome !== filters.biome.toLowerCase()) matchesAll = false;
            if (filters.tone && noteTone !== filters.tone.toLowerCase()) matchesAll = false;
            if (filters.intensity && noteIntensity !== filters.intensity.toLowerCase()) matchesAll = false;

            if (matchesAll) {
                const cleanPath = getExactPathStr(frontmatter.file_path);
                if (cleanPath) audioTracks.push(cleanPath);
            }
        }
        return audioTracks;
    }

    /**
     * Pulls a structured playlist note directly by its defined ID, limited strictly to the "Jukebox" folder.
     */
    public getTracksByPlaylistId(playlistId: string): string[] {
        const targetId = playlistId.toLowerCase().trim();
        const files = this.app.vault.getMarkdownFiles();

        for (const file of files) {
            // PERFORMANCE SHIELD: Skip any file that isn't inside your Jukebox directory 🛡️
            if (!file.path.startsWith('Jukebox/')) continue;

            const cache = this.app.metadataCache.getFileCache(file);
            const frontmatter = cache?.frontmatter;

            if (frontmatter && frontmatter.type === "playlist" && frontmatter.playlist_id) {
                const notePlaylistId = String(frontmatter.playlist_id).toLowerCase().trim();
                
                if (notePlaylistId === targetId) {
                    if (Array.isArray(frontmatter.paths)) {
                        return frontmatter.paths;
                    }
                }
            }
        }
        return [];
    }
}



export class HTML5AudioController {
    private app: App;
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
    private fadeIntervalId: any = null;

    // Independent Looping Environmental Weather Overlay Channel 🌧️
    private weatherAudio: HTMLAudioElement;
    
    public onTrackChange: (trackName: string) => void = () => {};

    constructor(app: App) {
        this.app = app;
        
        // Initialize dual music players
        this.channel1 = new Audio();
        this.channel2 = new Audio();
        
        // Both channels share the same track completion listener layout
        this.channel1.addEventListener('ended', () => this.handleTrackEnded());
        this.channel2.addEventListener('ended', () => this.handleTrackEnded());
        
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
            this.currentTrackIndex = (this.currentTrackIndex + 1) % this.playlist.length;
            this.executeCrossfade();
            return;
        }

        // Determine who fades OUT and who fades IN
        const oldChannel = this.activeChannel;
        const newChannel = oldChannel === this.channel1 ? this.channel2 : this.channel1;

        // Stage the incoming asset channel at zero volume
        newChannel.src = this.app.vault.adapter.getResourcePath(file.path);
        newChannel.volume = 0;
        
        // Clear any running crossover intervals to prevent volume fighting
        if (this.fadeIntervalId) clearInterval(this.fadeIntervalId);

        newChannel.play()
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
                        clearInterval(this.fadeIntervalId);
                        this.fadeIntervalId = null;
                        
                        // Park the faded element safely
                        oldChannel.pause();
                        oldChannel.src = "";
                        
                        // Assert locked target levels
                        newChannel.volume = this.masterMusicVolume;
                    }
                }, stepTimeMs);
            })
            .catch(err => {
                console.error("Crossfade track blocked by browser rule:", err);
                // Fallback: forcefully swap indices if initialization errors out
                this.activeChannel = newChannel;
                newChannel.volume = this.masterMusicVolume;
            });
    }

    private handleTrackEnded() {
        if (this.playlist.length === 0) return;
        this.activeChannel.currentTime = 0;
        this.activeChannel.play().catch(err => console.error("Loop replay blocked:", err));
    }

    public skipTrack() {
        if (this.playlist.length <= 1) return; 
        // 1. Manually advance the queue cursor index
        this.currentTrackIndex = (this.currentTrackIndex + 1) % this.playlist.length;
        
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
        this.weatherAudio.play().catch(err => console.error(err));
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
        this.statusBar.setText(this.activeChannel.paused ? "🎵 Music Paused" : "🎵 Music Active");
    }

    public destroy() {
        if (this.fadeIntervalId) clearInterval(this.fadeIntervalId);
        this.channel1.pause();
        this.channel2.pause();
        this.weatherAudio.pause();
        this.channel1.src = "";
        this.channel2.src = "";
        this.weatherAudio.src = "";
    }
}


export default class TTRPGMusicPlugin extends Plugin {
  public audioPlayer!: HTML5AudioController;
  public trackManager!: TrackManager;

  async onload() {
        this.audioPlayer = new HTML5AudioController(this.app);
        this.trackManager = new TrackManager(this.app);

        // Register the sidebar panel view container
        this.registerView(
            VIEW_TYPE_TTRPG_MUSIC,
            (leaf) => new TTRPGMusicView(leaf, this)
        );

        this.addRibbonIcon('music', 'TTRPG Music Player', () => {
            this.activateView();
        });

        const statusBarItemEl = this.addStatusBarItem();
        this.audioPlayer.registerStatusBar(statusBarItemEl);

        // --- REGISTER THE INLINE CLICK-TO-PLAY POST-PROCESSOR ---
        this.registerMarkdownPostProcessor((element, context) => {
            // Find all standard markdown links rendered in the note view
            const links = element.querySelectorAll<HTMLAnchorElement>('a.internal-link, a.external-link');
            
            links.forEach((linkEl: HTMLAnchorElement) => {
                const href = linkEl.getAttribute('href') || '';

                // Check if the link target uses our custom music URI scheme
                if (href.startsWith('ttrpg-music:')) {
                    // Convert the generic hyperlink into a tactical layout action button
                    linkEl.classList.add('ttrpg-inline-command-btn');
                    
                    // Prepend a nice functional play icon
                    const iconSpan = document.createElement('span');
                    iconSpan.textContent = '🔊 ';
                    linkEl.prepend(iconSpan);

                    // Hijack the click event so it triggers audio instead of navigating pages
                    this.registerDomEvent(linkEl, 'click', (e) => {
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
            id: 'ttrpg-music-play',
            name: 'Play / Resume Audio Channels',
            callback: () => {
                this.audioPlayer.play();
                new Notice("▶ Resuming Audio Channels");
            }
        });

        // 2. Pause Hotkey Command
        this.addCommand({
            id: 'ttrpg-music-pause',
            name: 'Pause Audio Channels',
            callback: () => {
                this.audioPlayer.pause();
                new Notice("⏸ Audio Channels Paused");
            }
        });

        // 3. Skip Track Hotkey Command
        this.addCommand({
            id: 'ttrpg-music-skip',
            name: 'Skip to Next Track',
            callback: () => {
                this.audioPlayer.skipTrack();
                // Notice updates automatically from our audioPlayer's onTrackChange callback!
            }
        });

        // 4. Stop Everything Master Panic Button Hotkey Command
        this.addCommand({
            id: 'ttrpg-music-stop-all',
            name: 'Stop Everything (Music + Weather)',
            callback: () => {
                this.audioPlayer.pause();
                this.audioPlayer.stopWeatherOverlay();
                new Notice("🛑 Stopped All Background Ambience & Music");
            }
        });
    }

    /**
     * Parses the custom URI structure and fires off the background audio lanes
     */
    private handleInlineCommand(uri: string) {
        // Example URIs: 
        // "ttrpg-music:playlist:dragon-fight"
        // "ttrpg-music:track:z_music/Battle.mp3"
        const parts = uri.split(':');
        if (parts.length < 3) return;

        const commandType = parts[1].toLowerCase().trim();
        // Re-join the remaining parts in case your local audio file path contains colons
        const targetPayload = parts.slice(2).join(':').trim();

        if (commandType === 'playlist') {
            const tracks = this.trackManager.getTracksByPlaylistId(targetPayload);
            if (tracks.length > 0) {
                this.audioPlayer.startPlaylist(tracks, false); // Playlists never shuffle
                new Notice(`⚡ Inline Loading Playlist: "${targetPayload}"`);
            } else {
                new Notice(`❌ Inline Error: No playlist found matching ID "${targetPayload}"`);
            }
        } 
        
        else if (commandType === 'track') {
            // Verify if the standalone path points to a valid asset configuration
            const file = this.app.vault.getAbstractFileByPath(targetPayload);
            if (file) {
                // Load the single isolated track into our playlist engine
                this.audioPlayer.startPlaylist([targetPayload], false);
                new Notice(`⚡ Inline Playing Track: ${file.name}`);
            } else {
                new Notice(`❌ Inline Error: Track path not found at "${targetPayload}"`);
            }
        }
    }

  onunload() {
    this.audioPlayer.destroy(); //always clean up audio memory
  }

  async activateView() {
    const { workspace } = this.app;

    let leaf = workspace.getLeavesOfType(VIEW_TYPE_TTRPG_MUSIC)[0];

    if(!leaf){
        //create a new leaf in the right sidebar pane
        const rightLeaf = workspace.getRightLeaf(false);
        if(rightLeaf){
            leaf = rightLeaf;
            await leaf.setViewState({
                type: VIEW_TYPE_TTRPG_MUSIC,
                active: true,
            });
        }
    }

    if(leaf){
        workspace.revealLeaf(leaf);
    }
  }
}


import { ItemView } from 'obsidian';

export class TTRPGMusicView extends ItemView {
    private plugin: TTRPGMusicPlugin;

    // Hardcoded tactical values for instant gameplay buttons
    private biomes = ["Forest", "Marine", "Highlands", "Dungeon", "Settlement"];
    private tones = ["Calm", "Mysterious", "Tense", "Epic", "Spooky"];
    private intensities = ["Low", "Medium", "High"];

    private selectedBiome: string | null = null;
    private selectedTone: string | null = null;
    private selectedIntensity: string | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: TTRPGMusicPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return VIEW_TYPE_TTRPG_MUSIC; }
    getDisplayText(): string { return "TTRPG Music Player"; }
    getIcon(): string { return "music"; }

    async onOpen() {
        const root = this.contentEl;
        root.empty();

        // Wrap inside a master class to squeeze out heading whitespace perfectly
        const container = root.createEl("div", { cls: "ttrpg-view-container" });

        // --- Now Playing Display (Single Line Format) ---
        const nowPlayingCard = container.createEl("div", { cls: "ttrpg-now-playing-card" });
        
        // Changed "span" with inline styles to a native "strong" tag 👇
        nowPlayingCard.createEl("strong", { text: "NOW PLAYING:" });
        
        const trackTitleDisplay = nowPlayingCard.createEl("div", { cls: "ttrpg-track-title-display", text: "No Track Active" });
        this.plugin.audioPlayer.onTrackChange = (name: string) => trackTitleDisplay.setText(name);


        // --- Audio Control Row ---
        const controlsRow = container.createEl("div", { cls: "ttrpg-controls-row" });
        const playBtn = controlsRow.createEl("button", { text: "▶ Play", cls: "mod-cta" });
        const pauseBtn = controlsRow.createEl("button", { text: "⏸ Pause" });
        const skipBtn = controlsRow.createEl("button", { text: "⏭ Skip" });

        this.registerDomEvent(playBtn, 'click', () => this.plugin.audioPlayer.play());
        this.registerDomEvent(pauseBtn, 'click', () => this.plugin.audioPlayer.pause());
        this.registerDomEvent(skipBtn, 'click', () => this.plugin.audioPlayer.skipTrack());

        // --- LIVE MIXING PANEL SLIDERS ---
        const mixerPanel = container.createEl("div", { cls: "ttrpg-mixer-panel" });
        
        // Music Slider
        const musicRow = mixerPanel.createEl("div", { cls: "ttrpg-slider-row" });
        musicRow.createEl("span", { text: "🎵 Music:", cls: "ttrpg-slider-label" });
        const musicSlider = musicRow.createEl("input", { type: "range" }) as HTMLInputElement;
        musicSlider.value = "70";
        this.plugin.audioPlayer.setMusicVolume(0.7);
        this.registerDomEvent(musicSlider, 'input', () => this.plugin.audioPlayer.setMusicVolume(parseFloat(musicSlider.value) / 100));

        // Weather Slider
        const weatherRow = mixerPanel.createEl("div", { cls: "ttrpg-slider-row" });
        weatherRow.createEl("span", { text: "🌧️ Weather:", cls: "ttrpg-slider-label" });
        const weatherSlider = weatherRow.createEl("input", { type: "range" }) as HTMLInputElement;
        weatherSlider.value = "50";
        this.plugin.audioPlayer.setWeatherVolume(0.5);
        this.registerDomEvent(weatherSlider, 'input', () => this.plugin.audioPlayer.setWeatherVolume(parseFloat(weatherSlider.value) / 100));

        // --- BUTTON MATRIX FIELDS ---
        this.createButtonGrid(container, "Biomes", this.biomes, (val) => this.selectedBiome = val);
        this.createButtonGrid(container, "Tones", this.tones, (val) => this.selectedTone = val);
        this.createButtonGrid(container, "Intensity", this.intensities, (val) => this.selectedIntensity = val);

        // Load Trigger Row
        const actionRow = container.createEl("div", { cls: "ttrpg-button-container" });
        const loadTracksBtn = actionRow.createEl("button", { text: "⚡ Load Matrix", cls: "mod-cta" });


        this.registerDomEvent(loadTracksBtn, 'click', () => {
            const tracks = this.plugin.trackManager.queryTracks({
                biome: this.selectedBiome || undefined,
                tone: this.selectedTone || undefined,
                intensity: this.selectedIntensity || undefined
            });
            if (tracks.length > 0) {
                this.plugin.audioPlayer.startPlaylist(tracks, true); 
                new Notice(`Shuffling ${tracks.length} matching tracks!`);
            } else {
                new Notice("❌ No matching tracks found in front matter.");
            }
        });

        container.createEl("hr", { cls: "ttrpg-divider-spaced" });

        // --- WEATHER LAYER OVERLAYS CONTROLLER ---
        container.createEl("h5", { text: "Weather Overlays" });
        const weatherGrid = container.createEl("div", { cls: "ttrpg-matrix-row" });

        // Replace the hardcoded paths in rainBtn and stormBtn with this safe check:
        const findWeatherFile = (basePath: string): string => {
          // Checks for standard audio formats in your vault
          const extensions = ['.mp3', '.wav', '.ogg', '.m4a'];
          for (const ext of extensions) {
            const fullPath = basePath + ext;
            if (this.app.vault.getAbstractFileByPath(fullPath)) {
              return fullPath;
            }
          }
          return basePath + '.mp3'; // Fallback default
        };
        
        const clearBtn = weatherGrid.createEl("button", { text: "☀️ Clear", cls: "ttrpg-matrix-btn mod-cta" }) as HTMLButtonElement; 
        const rainBtn = weatherGrid.createEl("button", { text: "🌧️ Rain", cls: "ttrpg-matrix-btn" }) as HTMLButtonElement;
        const stormBtn = weatherGrid.createEl("button", { text: "⛈️ Storm", cls: "ttrpg-matrix-btn" }) as HTMLButtonElement;

        const weatherBtns = [clearBtn, rainBtn, stormBtn];
        const setWeatherActive = (activeBtn: HTMLButtonElement) => {
            weatherBtns.forEach(btn => btn.classList.remove("mod-cta"));
            activeBtn.classList.add("mod-cta");
        };

        this.registerDomEvent(clearBtn, 'click', () => {
            setWeatherActive(clearBtn);
            this.plugin.audioPlayer.stopWeatherOverlay();
        });

        this.registerDomEvent(rainBtn, 'click', () => {
            setWeatherActive(rainBtn);
            this.plugin.audioPlayer.startWeatherOverlay(findWeatherFile("Jukebox/Ambience/Soft_Rain"));
        });

        this.registerDomEvent(stormBtn, 'click', () => {
            setWeatherActive(stormBtn);
            this.plugin.audioPlayer.startWeatherOverlay(findWeatherFile("Jukebox/Ambience/Heavy_Storm"));
        });

        container.createEl("hr", { cls: "ttrpg-divider-spaced" });

        // --- HARDCODED NOTE PLAYLIST LOADER ---
        container.createEl("h5", { text: "Playlist Notes" });
        
        const playlistInput = container.createEl("input", { 
            type: "text", 
            placeholder: "Enter Playlist Note ID...",
            cls: "ttrpg-full-width-input"
        }) as HTMLInputElement;

        const loadPlaylistBtn = container.createEl("button", { 
            text: "📂 Load Playlist Note", 
            cls: "ttrpg-full-width-btn" 
        });

        this.registerDomEvent(loadPlaylistBtn, 'click', () => {
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

    private createButtonGrid(parent: HTMLElement, title: string, items: string[], stateCallback: (val: string | null) => void) {
        const section = parent.createEl("div", { cls: "ttrpg-matrix-section" });
        section.createEl("small", { text: title, cls: "ttrpg-matrix-title" });
        const row = section.createEl("div", { cls: "ttrpg-matrix-row" });
        const btnRefs: HTMLButtonElement[] = [];

        items.forEach(item => {
            const btn = row.createEl("button", { text: item, cls: "ttrpg-matrix-btn" }) as HTMLButtonElement;
            this.registerDomEvent(btn, 'click', () => {
                if (btn.classList.contains("mod-cta")) {
                    btn.classList.remove("mod-cta");
                    stateCallback(null);
                } else {
                    btnRefs.forEach(b => b.classList.remove("mod-cta"));
                    btn.classList.add("mod-cta");
                    stateCallback(item);
                }
            });
            btnRefs.push(btn);
        });
    }
}





