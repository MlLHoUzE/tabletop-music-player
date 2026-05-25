import { App, PluginSettingTab, Setting } from "obsidian";
import TTRPGMusicPlayerPlugin from "./main";
import { FolderSuggest, AudioFileSuggest } from "./suggesters";

export class TTRPGMusicPlayerSettingTab extends PluginSettingTab {
  plugin: TTRPGMusicPlayerPlugin;

  constructor(app: App, plugin: TTRPGMusicPlayerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "TTRPG Music Player Settings" });

    // --- RENDER TEXT BOX WITH DROPDOWN SEARCH SUGGESTIONS ---
    new Setting(containerEl)
      .setName("Audio Folder Root Location")
      .setDesc(
        "Type to filter your vault folders and choose your primary Jukebox home directory.",
      )
      .addSearch((search) => {
        search
          .setPlaceholder("e.g., Jukebox or Audio/Music")
          .setValue(this.plugin.settings.audioFolder)
          .onChange(async (value) => {
            // Keep track of changes and save to disk automatically
            this.plugin.settings.audioFolder = value.trim().replace(/\/$/, "");
            await this.plugin.saveSettings();
          });

        // Attach your filter suggest engine to the text input box's underlying HTML element 👇
        new FolderSuggest(this.app, search.inputEl);
      });

    containerEl.createEl("h4", { text: "Environmental Weather Audio Paths" });

    this.plugin.settings.weatherOverlays.forEach((overlay, index) => {
      const s = new Setting(containerEl)
        .addText((text) =>
          text
            .setPlaceholder("Button Name (e.g. 🌧️ Rain)")
            .setValue(overlay.name)
            .onChange(async (val) => {
              this.plugin.settings.weatherOverlays[index].name = val;
              await this.plugin.saveSettings();
            }),
        )
        // 1. Change this text input container into a sleek search layout box 👇
        .addSearch((search) => {
          search
            .setPlaceholder("Search or enter track path...")
            .setValue(overlay.filePath)
            .onChange(async (val) => {
              this.plugin.settings.weatherOverlays[index].filePath = val.trim();
              await this.plugin.saveSettings();
            });

          // 2. Attach your fresh audio file search layer directly to the input node! 🎧
          new AudioFileSuggest(this.app, search.inputEl);
        })
        .addButton((btn) =>
          btn
            .setButtonText("❌ Delete")
            .setWarning()
            .onClick(async () => {
              this.plugin.settings.weatherOverlays.splice(index, 1);
              await this.plugin.saveSettings();
              this.display();
            }),
        );

      s.settingEl.style.borderTop = "none";
      s.settingEl.style.padding = "4px 0";
    });

    // Add New Weather Overlay Button
    containerEl.createEl("br");
    new Setting(containerEl).addButton((btn) =>
      btn
        .setButtonText("➕ Add Custom Weather")
        .setCta()
        .onClick(async () => {
          this.plugin.settings.weatherOverlays.push({
            name: "New State",
            filePath: "",
          });
          await this.plugin.saveSettings();
          this.display();
        }),
    );
    // --- CROSSFADE DURATION INPUT CONFIG ---
    new Setting(containerEl)
      .setName("Crossfade Blend Duration (Seconds)")
      .setDesc(
        "Adjust how many seconds audio tracks overlay and blend together when shifting scenes (Type 0 for instant cuts).",
      )
      .addText((text) => {
        text.inputEl.type = "number"; // Enforce numeric keyboard constraints
        text.inputEl.setAttribute("step", "0.5"); // Allow increments of 0.5s
        text.inputEl.setAttribute("min", "0"); // Block negative numbers

        text
          .setPlaceholder("2.5")
          .setValue(String(this.plugin.settings.crossfadeDuration))
          .onChange(async (value) => {
            const parsedValue = parseFloat(value);
            // Fallback to 0 if the field is wiped completely empty
            this.plugin.settings.crossfadeDuration = isNaN(parsedValue)
              ? 0
              : parsedValue;
            await this.plugin.saveSettings();
          });
      });
  }
}
