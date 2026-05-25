import { App } from "obsidian";
import TTRPGMusicPlayerPlugin from "./main";

export class TrackManager {
  private app: App;
  private plugin: TTRPGMusicPlayerPlugin;

  constructor(app: App, plugin: TTRPGMusicPlayerPlugin) {
    this.app = app;
    this.plugin = plugin;
  }

  /**
   * Filters vault markdown front matter, strictly limiting searches to the "Jukebox" root folder.
   */
  public queryTracks(filters: {
    biome?: string;
    tone?: string;
    intensity?: string;
  }): string[] {
    const audioTracks: string[] = [];
    const files = this.app.vault.getMarkdownFiles();

    const folderPrefix = this.plugin.settings.audioFolder + "/";

    for (const file of files) {
      // PERFORMANCE SHIELD: Skip any file that isn't inside your Jukebox directory 🛡️
      if (!file.path.startsWith(folderPrefix)) continue;

      const cache = this.app.metadataCache.getFileCache(file);
      const frontmatter = cache?.frontmatter;
      if (!frontmatter || !frontmatter.file_path) continue;

      let matchesAll = true;

      const getCompareStr = (val: unknown) =>
        String(val || "")
          .toLowerCase()
          .trim();
      const getExactPathStr = (val: unknown): string => {
        if (!val) return "";
        if (Array.isArray(val)) return String(val || "").trim();
        return String(val).trim();
      };

      const noteBiome = getCompareStr(frontmatter.biome);
      const noteTone = getCompareStr(frontmatter.tone);
      const noteIntensity = getCompareStr(frontmatter.intensity);

      if (filters.biome && noteBiome !== filters.biome.toLowerCase())
        matchesAll = false;
      if (filters.tone && noteTone !== filters.tone.toLowerCase())
        matchesAll = false;
      if (
        filters.intensity &&
        noteIntensity !== filters.intensity.toLowerCase()
      )
        matchesAll = false;

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

    const folderPrefix = this.plugin.settings.audioFolder + "/";

    for (const file of files) {
      // PERFORMANCE SHIELD: Skip any file that isn't inside your Jukebox directory 🛡️
      if (!file.path.startsWith(folderPrefix)) continue;

      const cache = this.app.metadataCache.getFileCache(file);
      const frontmatter = cache?.frontmatter;

      if (
        frontmatter &&
        frontmatter.type === "playlist" &&
        frontmatter.playlist_id
      ) {
        const notePlaylistId = String(frontmatter.playlist_id)
          .toLowerCase()
          .trim();

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
