import { Storage } from "./storage.js";

const STORAGE_KEY = "racha.settings.v1";
const MUSIC_TRACKS = ["assets/audio/Torça Com a gente.mp3", "assets/audio/Torcida em Alta.mp3"];
const BUNDLED_AUDIO_PATHS = [
    "assets/audio/football-crowd-cheer.mp3",
    "assets/audio/referee-whistle.mp3"
];
const THEME_PALETTES = {
    gramado: { green: "#45b963", lime: "#c5f36b", pale: "#1d3525", field: "#164b32" },
    oceano: { green: "#35a9eb", lime: "#8be0ff", pale: "#193447", field: "#153c54" },
    coral: { green: "#ff7064", lime: "#ffc17d", pale: "#422a27", field: "#563029" },
    violeta: { green: "#ae8bff", lime: "#d7c3ff", pale: "#332947", field: "#382b51" },
    dourado: { green: "#e1ad2d", lime: "#ffdc76", pale: "#40351d", field: "#51431e" },
    neve: { green: "#a8c1c5", lime: "#e7f5f5", pale: "#26393b", field: "#26474c" },
    grafite: { green: "#89968e", lime: "#e5ebe7", pale: "#2c3630", field: "#303d35" },
    rubi: { green: "#ed5570", lime: "#ffa0ae", pale: "#40242c", field: "#4c2830" }
};

export function createSettingsController({ documentRef, windowRef, showToast }) {
    const audioSettings = loadAudioSettings();
    const bundledAudioUrls = new Map();
    let customCrowdUrl = null;
    let customMusicUrl = null;
    let customMusicAudio = null;
    let stadiumAudio = null;
    let audioPreloadPromise;

    function clampVolume(value) {
        return Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
    }

    function loadAudioSettings() {
        const defaults = { effectsEnabled: true, effectsVolume: 35, musicEnabled: false, musicVolume: 32, musicTrack: MUSIC_TRACKS[0], theme: "gramado", mode: "dark" };
        const saved = Storage.get(STORAGE_KEY, {});
        return {
            effectsEnabled: saved.effectsEnabled !== false,
            effectsVolume: clampVolume(saved.effectsVolume ?? defaults.effectsVolume),
            musicEnabled: saved.musicEnabled === true,
            musicVolume: clampVolume(saved.musicVolume ?? defaults.musicVolume),
            musicTrack: MUSIC_TRACKS.includes(saved.musicTrack) ? saved.musicTrack : defaults.musicTrack,
            theme: Object.hasOwn(THEME_PALETTES, saved.theme) ? saved.theme : defaults.theme,
            mode: saved.mode === "light" ? "light" : defaults.mode
        };
    }

    function saveAudioSettings() {
        if (!Storage.set(STORAGE_KEY, audioSettings)) showToast("Não foi possível salvar as opções neste navegador.");
    }

    function applyTheme(theme) {
        const palette = THEME_PALETTES[theme] || THEME_PALETTES.gramado;
        const mode = audioSettings.mode === "light" ? "light" : "dark";
        documentRef.documentElement.dataset.mode = mode;
        documentRef.documentElement.style.colorScheme = mode;
        documentRef.documentElement.style.setProperty("--green", palette.green);
        documentRef.documentElement.style.setProperty("--lime", palette.lime);
        documentRef.documentElement.style.setProperty("--green-pale", palette.pale);
        documentRef.documentElement.style.setProperty("--field-color", palette.field);
        documentRef.querySelectorAll(".theme-choice").forEach(button => {
            const selected = button.dataset.theme === theme;
            button.setAttribute("aria-pressed", String(selected));
        });
        documentRef.querySelectorAll(".mode-choice").forEach(button => {
            button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
        });
        documentRef.querySelector('meta[name="theme-color"]').content = mode === "light" ? "#e2e9e3" : "#0d1410";
    }

    function updateAudioControls() {
        documentRef.querySelector("#effects-toggle").checked = audioSettings.effectsEnabled;
        documentRef.querySelector("#effects-volume").value = audioSettings.effectsVolume;
        documentRef.querySelector("#effects-volume-value").textContent = `${audioSettings.effectsVolume}%`;
        documentRef.querySelector("#music-toggle").checked = audioSettings.musicEnabled;
        documentRef.querySelector("#music-volume").value = audioSettings.musicVolume;
        documentRef.querySelector("#music-volume-value").textContent = `${audioSettings.musicVolume}%`;
        documentRef.querySelector("#music-track").value = audioSettings.musicTrack;
        documentRef.querySelector("#crowd-audio-name").textContent = customCrowdUrl ? "Áudio carregado; toca ao sortear ou trocar times." : "Opcional: carregue um canto ou torcida do aparelho.";
        documentRef.querySelector("#music-audio-name").textContent = customMusicUrl ? "Faixa do aparelho ativa nesta sessão." : "As duas faixas RACHA estão disponíveis acima.";
    }

    function preloadBundledAudio() {
        if (!audioPreloadPromise) {
            audioPreloadPromise = Promise.all(BUNDLED_AUDIO_PATHS.map(async path => {
                try {
                    const response = await windowRef.fetch(path);
                    if (!response.ok) throw new Error(`Audio request failed: ${response.status}`);
                    const audioBlob = await response.blob();
                    bundledAudioUrls.set(path, windowRef.URL.createObjectURL(audioBlob));
                } catch {
                    bundledAudioUrls.set(path, null);
                }
            }));
        }
        return audioPreloadPromise;
    }

    function playLocalAudio(path, volume, { delay = 0, maxDuration = 0 } = {}) {
        if (volume <= 0) return null;
        const source = BUNDLED_AUDIO_PATHS.includes(path) ? bundledAudioUrls.get(path) : path;
        if (source === undefined) {
            preloadBundledAudio().then(() => playLocalAudio(path, volume, { delay, maxDuration }));
            return null;
        }
        if (!source) {
            showToast("Não foi possível carregar o áudio do jogo.");
            return null;
        }
        const audio = new windowRef.Audio(source);
        audio.volume = Math.min(0.25, volume * 0.25);
        audio.preload = "auto";
        const play = () => {
            audio.play().catch(() => {});
            if (maxDuration > 0) windowRef.setTimeout(() => audio.pause(), maxDuration * 1000);
        };
        if (delay > 0) windowRef.setTimeout(play, delay * 1000);
        else play();
        return audio;
    }

    function playCustomCrowd(volume, delay = 0) {
        if (customCrowdUrl) return playLocalAudio(customCrowdUrl, volume, { delay });
        return playLocalAudio(BUNDLED_AUDIO_PATHS[0], volume, { delay });
    }

    function playEffect(action) {
        if (!audioSettings.effectsEnabled || audioSettings.effectsVolume === 0) return;
        const level = audioSettings.effectsVolume / 100;
        if (action === "draw") {
            playLocalAudio(BUNDLED_AUDIO_PATHS[1], level * 0.85, { maxDuration: 1.6 });
            playCustomCrowd(level, 0.45);
        } else if (action === "swap") {
            playCustomCrowd(level * 0.7);
        }
    }

    function stopBackgroundMusic() {
        for (const audio of [customMusicAudio, stadiumAudio]) {
            if (!audio) continue;
            audio.pause();
            audio.currentTime = 0;
        }
        stadiumAudio = null;
    }

    function startBackgroundMusic() {
        if (!audioSettings.musicEnabled || audioSettings.musicVolume === 0) return;
        const audio = customMusicAudio || (stadiumAudio ||= new windowRef.Audio(audioSettings.musicTrack));
        audio.loop = true;
        audio.volume = audioSettings.musicVolume / 100 * 0.22;
        audio.preload = "auto";
        audio.play().catch(() => showToast("Toque para iniciar o áudio neste navegador."));
    }

    function syncBackgroundMusic() {
        stopBackgroundMusic();
        if (audioSettings.musicEnabled && audioSettings.musicVolume > 0) startBackgroundMusic();
    }

    function initializeSettings() {
        applyTheme(audioSettings.theme);
        updateAudioControls();
        documentRef.querySelector("#settings-open").addEventListener("click", () => {
            documentRef.querySelector("#settings-dialog").showModal();
            if (audioSettings.musicEnabled) startBackgroundMusic();
        });
        documentRef.addEventListener("pointerdown", () => {
            if (audioSettings.musicEnabled) startBackgroundMusic();
        }, { once: true });
        documentRef.querySelectorAll(".theme-choice").forEach(button => button.addEventListener("click", () => {
            audioSettings.theme = button.dataset.theme;
            applyTheme(audioSettings.theme);
            saveAudioSettings();
        }));
        documentRef.querySelectorAll(".mode-choice").forEach(button => button.addEventListener("click", () => {
            audioSettings.mode = button.dataset.mode;
            applyTheme(audioSettings.theme);
            saveAudioSettings();
        }));
        documentRef.querySelector("#effects-toggle").addEventListener("change", event => {
            audioSettings.effectsEnabled = event.target.checked;
            saveAudioSettings();
        });
        documentRef.querySelector("#effects-volume").addEventListener("input", event => {
            audioSettings.effectsVolume = clampVolume(event.target.value);
            documentRef.querySelector("#effects-volume-value").textContent = `${audioSettings.effectsVolume}%`;
            saveAudioSettings();
        });
        documentRef.querySelector("#music-toggle").addEventListener("change", event => {
            audioSettings.musicEnabled = event.target.checked;
            saveAudioSettings();
            syncBackgroundMusic();
        });
        documentRef.querySelector("#music-volume").addEventListener("input", event => {
            audioSettings.musicVolume = clampVolume(event.target.value);
            documentRef.querySelector("#music-volume-value").textContent = `${audioSettings.musicVolume}%`;
            saveAudioSettings();
            for (const audio of [customMusicAudio, stadiumAudio]) {
                if (audio) audio.volume = audioSettings.musicVolume / 100 * 0.22;
            }
            if (audioSettings.musicEnabled && audioSettings.musicVolume > 0) startBackgroundMusic();
            else if (audioSettings.musicVolume === 0) stopBackgroundMusic();
        });
        documentRef.querySelector("#music-track").addEventListener("change", event => {
            audioSettings.musicTrack = MUSIC_TRACKS.includes(event.target.value) ? event.target.value : MUSIC_TRACKS[0];
            stopBackgroundMusic();
            if (customMusicUrl) windowRef.URL.revokeObjectURL(customMusicUrl);
            customMusicUrl = null;
            customMusicAudio = null;
            documentRef.querySelector("#music-audio-file").value = "";
            updateAudioControls();
            syncBackgroundMusic();
            saveAudioSettings();
        });
        documentRef.querySelector("#crowd-audio-file").addEventListener("change", event => {
            const [file] = event.target.files;
            if (!file) return;
            if (customCrowdUrl) windowRef.URL.revokeObjectURL(customCrowdUrl);
            customCrowdUrl = windowRef.URL.createObjectURL(file);
            updateAudioControls();
            showToast("Áudio da torcida carregado para esta sessão.");
        });
        documentRef.querySelector("#crowd-audio-preview").addEventListener("click", () => {
            if (customCrowdUrl) playCustomCrowd(audioSettings.effectsVolume / 100);
            else playLocalAudio(BUNDLED_AUDIO_PATHS[0], audioSettings.effectsVolume / 100);
        });
        documentRef.querySelector("#music-audio-file").addEventListener("change", event => {
            const [file] = event.target.files;
            if (!file) return;
            stopBackgroundMusic();
            if (customMusicUrl) windowRef.URL.revokeObjectURL(customMusicUrl);
            customMusicUrl = windowRef.URL.createObjectURL(file);
            customMusicAudio = new windowRef.Audio(customMusicUrl);
            customMusicAudio.loop = true;
            customMusicAudio.preload = "auto";
            audioSettings.musicEnabled = true;
            updateAudioControls();
            saveAudioSettings();
            syncBackgroundMusic();
            showToast("Sua trilha começou a tocar.");
        });
        documentRef.querySelector("#settings-reset").addEventListener("click", () => {
            stopBackgroundMusic();
            if (customCrowdUrl) windowRef.URL.revokeObjectURL(customCrowdUrl);
            if (customMusicUrl) windowRef.URL.revokeObjectURL(customMusicUrl);
            customCrowdUrl = null;
            customMusicUrl = null;
            customMusicAudio = null;
            documentRef.querySelector("#crowd-audio-file").value = "";
            documentRef.querySelector("#music-audio-file").value = "";
            Object.assign(audioSettings, { effectsEnabled: true, effectsVolume: 35, musicEnabled: false, musicVolume: 32, musicTrack: MUSIC_TRACKS[0], theme: "gramado", mode: "dark" });
            applyTheme(audioSettings.theme);
            updateAudioControls();
            syncBackgroundMusic();
            saveAudioSettings();
            showToast("Opções restauradas.");
        });
        documentRef.querySelector("#settings-dialog").addEventListener("click", event => {
            if (event.target === event.currentTarget) event.currentTarget.close();
        });
        preloadBundledAudio();
    }

    return { audioSettings, playEffect, syncBackgroundMusic, initializeSettings };
}
