import { AbstractInputSuggest, App } from "obsidian";

export class FolderSuggest extends AbstractInputSuggest<string> {
  private inputEl: HTMLInputElement;

  constructor(app: App, inputEl: HTMLInputElement) {
    super(app, inputEl);
    this.inputEl = inputEl;
  }

  /**
   * Grabs every folder location currently residing inside the vault
   */
  getSuggestions(inputStr: string): string[] {
    const files = this.app.vault.getAllLoadedFiles();
    const folderPaths: string[] = ["/"]; // Always provide the root catalog option

    files.forEach((file) => {
      // @ts-expect-error - children array natively targets folder objects
      if (file.children && !file.path.startsWith(".")) {
        folderPaths.push(file.path);
      }
    });

    // Unique sort and run a loose lowercase text query match loop
    const searchLower = inputStr.toLowerCase().trim();
    return Array.from(new Set(folderPaths))
      .filter((folder) => folder.toLowerCase().includes(searchLower))
      .sort((a, b) => (a === "/" ? -1 : b === "/" ? 1 : a.localeCompare(b)));
  }

  /**
   * Controls how the text string displays inside the dropdown suggestion box row
   */
  renderSuggestion(value: string, el: HTMLElement): void {
    el.setText(value === "/" ? "/ (Root Vault Directory)" : value);
  }

  /**
   * Executes when the user clicks or hits Enter on a dropdown item
   */
  selectSuggestion(value: string): void {
    this.inputEl.value = value;
    this.inputEl.dispatchEvent(new Event("input")); // Force Obsidian to register the value mutation
    this.close();
  }
}

import { TFile } from "obsidian";

export class AudioFileSuggest extends AbstractInputSuggest<TFile> {
  private inputEl: HTMLInputElement;

  constructor(app: App, inputEl: HTMLInputElement) {
    super(app, inputEl);
    this.inputEl = inputEl;
  }

  /**
   * Scans and filters the vault for audio assets matching the user's typed input string.
   */
  getSuggestions(inputStr: string): TFile[] {
    const files = this.app.vault.getFiles();
    const searchLower = inputStr.toLowerCase().trim();
    const validExtensions = ["mp3", "wav", "ogg", "m4a", "flac"];

    return files.filter((file) => {
      const matchesSearch = file.path.toLowerCase().includes(searchLower);
      const hasAudioExtension = validExtensions.includes(
        file.extension.toLowerCase(),
      );
      return matchesSearch && hasAudioExtension;
    });
  }

  /**
   * Formats how each audio track line choice renders in the autocomplete suggestion list.
   */
  renderSuggestion(file: TFile, el: HTMLElement): void {
    el.setText(file.path);
  }

  /**
   * Fires when a user clicks a song file, populating the setting text container.
   */
  selectSuggestion(file: TFile): void {
    this.inputEl.value = file.path;
    this.inputEl.dispatchEvent(new Event("input")); // Forces Obsidian data to sync instantly
    this.close();
  }
}
