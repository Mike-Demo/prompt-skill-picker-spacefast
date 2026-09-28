import { useCallback, useEffect, useRef, useState } from "react";

import {
  WaButton,
  WaCallout,
  WaIcon,
  WaInput,
  WaSwitch,
} from "@/design-system/font-awsome-web-awesome-171158";
import { isWebGpuAvailable } from "@/lib/local-model";

const OPENAI_KEY_STORAGE_KEY = "skillfinder.openaiKey";
const LOCAL_MODEL_STORAGE_KEY = "skillfinder.localModel";

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private browsing etc. — the setting just won't persist.
  }
}

function removeStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Same as above: nothing durable to remove.
  }
}

/** The stored OpenAI key, or null when none is set. Never sent except per-request to /api/search and /api/enhance. */
export function getStoredOpenAiKey(): string | null {
  const value = readStorage(OPENAI_KEY_STORAGE_KEY);
  return value && value.length > 0 ? value : null;
}

/** Whether the in-browser WebGPU model is enabled. */
export function isLocalModelEnabled(): boolean {
  return readStorage(LOCAL_MODEL_STORAGE_KEY) === "1";
}

export interface AiSettingsState {
  openAiKey: string | null;
  localModel: boolean;
  setOpenAiKey: (key: string | null) => void;
  setLocalModel: (enabled: boolean) => void;
}

/** Reactive view of the AI settings, backed by useState + localStorage. */
export function useAiSettings(): AiSettingsState {
  const [openAiKey, setOpenAiKeyState] = useState<string | null>(null);
  const [localModel, setLocalModelState] = useState(false);

  // localStorage is browser-only; hydrate after mount so prerendered HTML
  // stays identical to the server render.
  useEffect(() => {
    setOpenAiKeyState(getStoredOpenAiKey());
    setLocalModelState(isLocalModelEnabled());
  }, []);

  const setOpenAiKey = useCallback((key: string | null) => {
    if (key && key.length > 0) writeStorage(OPENAI_KEY_STORAGE_KEY, key);
    else removeStorage(OPENAI_KEY_STORAGE_KEY);
    setOpenAiKeyState(key && key.length > 0 ? key : null);
  }, []);

  const setLocalModel = useCallback((enabled: boolean) => {
    writeStorage(LOCAL_MODEL_STORAGE_KEY, enabled ? "1" : "0");
    setLocalModelState(enabled);
  }, []);

  return { openAiKey, localModel, setOpenAiKey, setLocalModel };
}

type SwitchHost = HTMLElement & { checked: boolean };

/** Standalone settings panel: OpenAI key + in-browser model toggle. */
export function AiSettings() {
  const { openAiKey, localModel, setOpenAiKey, setLocalModel } = useAiSettings();
  const [draftKey, setDraftKey] = useState("");
  const [keySaved, setKeySaved] = useState(false);
  const switchRef = useRef<HTMLElement | null>(null);
  const webGpuAvailable = typeof navigator !== "undefined" && isWebGpuAvailable();

  useEffect(() => {
    const host = switchRef.current as SwitchHost | null;
    if (!host) return;
    const onChange = () => setLocalModel(host.checked);
    host.addEventListener("change", onChange);
    return () => host.removeEventListener("change", onChange);
  }, [setLocalModel]);

  const saveKey = () => {
    const trimmed = draftKey.trim();
    if (trimmed.length === 0) return;
    setOpenAiKey(trimmed);
    setDraftKey("");
    setKeySaved(true);
    window.setTimeout(() => setKeySaved(false), 2000);
  };

  return (
    <section
      aria-label="AI settings"
      className="mt-10 rounded-lg border border-border bg-muted/40 p-4 sm:p-5"
    >
      <h2 className="text-sm font-semibold text-foreground">AI settings</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Optional. Search works without either option, using your literal prompt.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <WaInput
            type="password"
            label="Your OpenAI key"
            value={openAiKey ? "••••••••••••••••" : draftKey}
            disabled={openAiKey !== null}
            placeholder={openAiKey ? undefined : "sk-…"}
            hint="Stored only in this browser. Sent with each request over HTTPS, never logged or saved on the server."
            with-hint
            onInput={(event: React.FormEvent<HTMLElement>) => {
              setDraftKey((event.currentTarget as HTMLInputElement).value);
            }}
            onKeyDown={(event: React.KeyboardEvent<HTMLElement>) => {
              if (event.key === "Enter") {
                event.preventDefault();
                saveKey();
              }
            }}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {openAiKey ? (
              <>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <WaIcon name="check" /> Key saved in this browser
                </span>
                <WaButton
                  type="button"
                  size="xs"
                  appearance="outlined"
                  onClick={() => {
                    setOpenAiKey(null);
                    setDraftKey("");
                  }}
                >
                  Clear
                </WaButton>
              </>
            ) : (
              <WaButton
                type="button"
                size="xs"
                variant="neutral"
                disabled={draftKey.trim().length === 0}
                onClick={saveKey}
              >
                {keySaved ? "Saved" : "Save key"}
              </WaButton>
            )}
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <WaSwitch
            ref={switchRef}
            size="s"
            checked={localModel}
            disabled={!webGpuAvailable}
            hint="Runs a small model in your browser via WebGPU (a few hundred MB download on first use). No key needed; ranking falls back to install counts. Without either option, search still works with your literal prompt."
            with-hint
          >
            Use in-browser model
          </WaSwitch>
          {!webGpuAvailable ? (
            <WaCallout variant="neutral" className="mt-3">
              This browser doesn&rsquo;t expose WebGPU, so the in-browser model can&rsquo;t run
              here. Add an OpenAI key above instead.
            </WaCallout>
          ) : null}
        </div>
      </div>
    </section>
  );
}
