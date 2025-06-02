// File: scripts/main.js
import {
  MODULE_ID,
  SETTINGS,
  FLAG_PREFIX, 
  LAST_UPDATE_TIME_FLAG_KEY, 
} from "./constants.js";
import { NeedsManager } from "./actor-needs.js";
import { SheetIntegration } from "./sheet-integration.js";
import { registerSettings, initializeActionHandlers } from "./settings.js";
import { TERRAIN_TYPES } from "./terrain-data.js";

class SurvivalNeedsModule {
  constructor() {
    this.moduleId = MODULE_ID;
    this.needsManager = null;
    this.sheetIntegration = null; 
    this._debouncedProcessActorEffects = null;
    this.lastHoveredHex = null; // For hover detection
    // console.log(`%c[${this.moduleId}] Module class constructed.`, "color: purple; font-weight:bold;");
  }

  initializeHoverListener() {
    if (!canvas || !canvas.grid || !canvas.app || !canvas.app.stage) {
      console.error(`[${this.moduleId}] Canvas, grid, or PIXI stage not ready for hover listener.`);
      return;
    }

    canvas.app.stage.interactive = true;
    // Make sure not to add multiple listeners if this is called again
    canvas.app.stage.off('mousemove.SurvivalNeedsModule'); // Remove previous listener if any

    canvas.app.stage.on('mousemove.SurvivalNeedsModule', (event) => {
      if (!event.data || !event.data.global) return;
      const mousePosition = event.data.global;

      // Check if mouse is within canvas bounds; getGridPositionFromPixels can error otherwise
      if (mousePosition.x < 0 || mousePosition.x > canvas.dimensions.width ||
          mousePosition.y < 0 || mousePosition.y > canvas.dimensions.height) {
        if (this.lastHoveredHex !== null) {
          this.lastHoveredHex = null;
          game.tooltip.hide();
        }
        return;
      }

      try {
        const hexCoords = canvas.grid.getGridPositionFromPixels(mousePosition.x, mousePosition.y);
        if (!hexCoords || hexCoords.length < 2) {
          if (this.lastHoveredHex !== null) {
            this.lastHoveredHex = null;
            game.tooltip.hide();
          }
          return;
        }

        const currentHexKey = hexCoords.join(',');
        if (this.lastHoveredHex !== currentHexKey) {
          this.lastHoveredHex = currentHexKey;

          // Simulate Terrain Type Determination
          const terrainKeys = Object.keys(TERRAIN_TYPES);
          if (terrainKeys.length === 0) {
            game.tooltip.hide();
            return;
          }
          // Ensure hexCoords components are numbers for arithmetic
          const hc0 = Number(hexCoords[0]) || 0;
          const hc1 = Number(hexCoords[1]) || 0;
          const terrainId = terrainKeys[Math.abs(hc0 + hc1) % terrainKeys.length];

          const terrainData = this.getTerrainData(terrainId);

          if (terrainData) {
            const tooltipHtmlContent = `
              <div style="max-width: 300px; font-size: 0.9em; color: #333; background-color: #f9f9f9; border: 1px solid #ccc; padding: 8px; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <h4 style="margin-top: 0; margin-bottom: 5px; border-bottom: 1px solid #ddd; padding-bottom: 3px; color: #111;">${terrainData.name}</h4>
                  <p style="margin-bottom: 8px; font-style: italic;">${terrainData.description}</p>
                  <p style="margin-bottom: 3px;"><strong>Encounters:</strong> ${terrainData.encounterChance}%</p>
                  <p style="margin-bottom: 0;"><strong>Discovery:</strong> ${terrainData.discoveryChance}%</p>
              </div>`;

            // Get hex center for tooltip positioning
            const pixels = canvas.grid.getPixelsFromGridPosition(hc0, hc1); // Use validated hc0, hc1
            if (!pixels || pixels.length < 2) {
                 game.tooltip.hide(); return;
            }
            const hexCenter = { x: pixels[0] + canvas.grid.w / 2, y: pixels[1] + canvas.grid.h / 2 };

            const targetBounds = {
                x: hexCenter.x,
                y: hexCenter.y,
                width: 1,
                height: 1
            };
            game.tooltip.show(targetBounds, tooltipHtmlContent, { mode: TooltipManager.MODES.HOVER, preferredDirection:"RIGHT" });
            // console.log(`[${this.moduleId}] Showing tooltip for ${terrainData.name} at hex ${currentHexKey}`);
          } else {
            game.tooltip.hide();
            // console.log(`[${this.moduleId}] No terrain data for ID: ${terrainId} at hex ${currentHexKey}`);
          }
        }
      } catch (error) {
        // console.warn(`[${this.moduleId}] Error in mousemove processing:`, error.message);
        if (this.lastHoveredHex !== null) {
          this.lastHoveredHex = null;
          game.tooltip.hide();
        }
      }
    });
    // console.log(`%c[${this.moduleId}] Hex hover listener initialized.`, "color: cyan;");
  }

  getTerrainData(terrainId) {
    if (TERRAIN_TYPES.hasOwnProperty(terrainId)) {
      const terrainObject = TERRAIN_TYPES[terrainId];
      let localizedDescription = terrainObject.descriptionKey; // Default to key if localization fails
      try {
        // Ensure game.i18n is available and localize is a function
        if (game && game.i18n && typeof game.i18n.localize === 'function') {
          localizedDescription = game.i18n.localize(terrainObject.descriptionKey);
        } else {
          console.warn(`[${this.moduleId}] game.i18n.localize not available. Using descriptionKey as fallback for ${terrainId}.`);
        }
      } catch (e) {
        console.error(`[${this.moduleId}] Error localizing descriptionKey "${terrainObject.descriptionKey}" for terrain ${terrainId}:`, e);
      }

      return {
        ...terrainObject,
        description: localizedDescription
      };
    } else {
      console.error(`[${this.moduleId}] Unknown terrain ID: ${terrainId}`);
      return null;
    }
  }

  initialize() {
    Hooks.once("init", () => {
      // console.log(`%c[${this.moduleId}] HOOK: init - STARTING NOW`, "background-color: #FFD700; color: black; font-size: 14px; font-weight: bold;");
      
      initializeActionHandlers(); 
      // console.log(`%c[${this.moduleId}] HOOK: init - CALLED initializeActionHandlers. SurvivalNeedsNS IS NOW:`, "color: purple; font-weight: bold;", foundry.utils.deepClone(window.SurvivalNeedsNS));

      registerSettings();
      // console.log(`%c[${this.moduleId}] HOOK: init - CALLED registerSettings.`, "color: purple; font-weight: bold;");
      
      Handlebars.registerHelper("sn_join", function (arr, separator) {
        if (foundry.utils.isEmpty(arr)) return "";
        if (!Array.isArray(arr)) return String(arr);
        return arr.join(typeof separator === "string" ? separator : ",");
      });
      Handlebars.registerHelper("sn_gt", (a, b, options) => parseFloat(a) > parseFloat(b) ? options.fn(this) : options.inverse(this));
      Handlebars.registerHelper("sn_lt", (a, b, options) => parseFloat(a) < parseFloat(b) ? options.fn(this) : options.inverse(this));
      Handlebars.registerHelper("sn_eq", (a, b, options) => String(a) == String(b) ? options.fn(this) : options.inverse(this));
      Handlebars.registerHelper('sn_abs', (value) => Math.abs(parseFloat(value)));
      Handlebars.registerHelper("sn_concat", function () {
        const args = Array.prototype.slice.call(arguments, 0, arguments.length - 1);
        return args.filter(arg => typeof arg !== "undefined" && arg !== null).join("");
      });
      Handlebars.registerHelper("sn_default", function (value, defaultValue) {
        const out = value !== undefined && value !== null && value !== '' ? value : defaultValue;
        return new Handlebars.SafeString(out);
      });

      // console.log(`%c[${this.moduleId}] HOOK: init - COMPLETED`, "background-color: #FFD700; color: black; font-size: 14px; font-weight: bold;");
    });

    Hooks.once("ready", async () => {
      // console.log(`%c[${this.moduleId}] Hook: ready - System is ready. Initializing managers and hooks.`, "color: green;");

      this.needsManager = new NeedsManager();
      this.sheetIntegration = new SheetIntegration(this.needsManager); 

      if (this.needsManager && this.needsManager.conditionManagerV2 && 
          typeof this.needsManager.conditionManagerV2.processActorNeedsAndEffects === 'function') {
        this._debouncedProcessActorEffects = foundry.utils.debounce(
          async (actor) => { 
            if (this.needsManager && actor) { 
              const currentNeeds = this.needsManager.getActorNeeds(actor);
              this.needsManager.loadAllConfigs(); 
              await this.needsManager.conditionManagerV2.processActorNeedsAndEffects(actor, currentNeeds, this.needsManager.trackerConfigs);
            }
          }, 
          250
        );
      } else {
        console.error(`%c[${this.moduleId}] CRITICAL: Failed to create debounced function for actor effects processing.`, "color: red;");
      }

      this.registerGameHooks();
      await this.performInitialActorSetup();

      // console.log(`%c[${this.moduleId}] All components initialized and game hooks registered.`, "color: green; font-weight:bold;");
    });

    Hooks.on("canvasReady", () => {
      // console.log(`%c[${this.moduleId}] HOOK: canvasReady - Initializing hover listener.`, "color: blue;");
      this.initializeHoverListener();
    });
  }

  registerGameHooks() {
    Hooks.on("pf2e.restForTheNight", async (actor) => {
      if (this.needsManager && actor && actor.type === "character") {
        await this.needsManager.processLongRest(actor);
      }
    });

    Hooks.on("updateWorldTime", (worldTime) => {
      if (this.needsManager) {
        this.needsManager.onUpdateWorldTime(worldTime); 
      }
    });

    Hooks.on("renderCharacterSheetPF2e", (app, html) => {
      if (this.sheetIntegration && app.actor) {
        this.sheetIntegration.onRenderCharacterSheet(app, html, app.actor);
      }
    });

    Hooks.on("createActor", async (actor, options, userId) => {
      if (game.user.id === userId && this.needsManager) {
        await this.needsManager.initializeNeedsForActor(actor);
      }
    });

    Hooks.on("updateActor", async (actor, changes) => {
      if (!this.needsManager || !this._debouncedProcessActorEffects) {
        return;
      }
      if (changes.flags && changes.flags[MODULE_ID]) {
        const changedNeedValueFlags = Object.keys(changes.flags[MODULE_ID]).some(flagKey => 
            this.needsManager.trackerConfigs.some(tracker => {
                if (typeof changes.flags[MODULE_ID][flagKey] === 'object' && changes.flags[MODULE_ID][flagKey] !== null) {
                    return tracker.id === flagKey && changes.flags[MODULE_ID][flagKey].hasOwnProperty('value');
                }
                return tracker.id === flagKey;
            }) || 
            flagKey === LAST_UPDATE_TIME_FLAG_KEY
        );

        if (changedNeedValueFlags) {
          this._debouncedProcessActorEffects(actor);
        }
      }
    });

    Hooks.on("createChatMessage", async (message, options, userId) => {
        if (!this.needsManager) return; 
        if (!message.isRoll || !message.speaker || !message.speaker.actor) return;
        if (userId !== game.user.id) return;


        const actor = game.actors.get(message.speaker.actor);
        if (!actor) return;

        const affectsNPCs = game.settings.get(MODULE_ID, SETTINGS.AFFECTS_NPCS);
        if (actor.type !== "character" && (actor.type !== "npc" || !affectsNPCs)) {
            return;
        }

        this.needsManager.loadAllConfigs();
        const actorNeeds = this.needsManager.getActorNeeds(actor); 

        const pf2eFlags = message.flags.pf2e;
        if (!pf2eFlags || !pf2eFlags.context || pf2eFlags.context.type === "damage-roll") {
            return;
        }

        const degreeOfSuccess = pf2eFlags.context.degreeOfSuccess;

        const luckTrackerConfig = this.needsManager.trackerConfigs.find(t => t.id === "luck" && t.enabled);
        if (luckTrackerConfig) {
            let luckIncreaseAmount = 0;
            if (degreeOfSuccess === 1 && typeof luckTrackerConfig.increaseOnFail === 'number') {
                luckIncreaseAmount = luckTrackerConfig.increaseOnFail;
            } else if (degreeOfSuccess === 0 && typeof luckTrackerConfig.increaseOnCritFail === 'number') {
                luckIncreaseAmount = luckTrackerConfig.increaseOnCritFail;
            }

            if (luckIncreaseAmount > 0) {
                const currentLuck = actorNeeds.luck ?? luckTrackerConfig.defaultValue ?? 0;
                let newLuck = currentLuck + luckIncreaseAmount;
                await this.needsManager.updateNeedValue(actor, "luck", newLuck.toString());

                const finalLuckValueAfterUpdate = this.needsManager.getActorNeeds(actor).luck; 

                if (luckTrackerConfig.triggerAtValue && finalLuckValueAfterUpdate >= luckTrackerConfig.triggerAtValue) {
                    ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({ actor: actor }),
                        content: `${actor.name} has achieved Heroic Luck! (${luckTrackerConfig.name} reached ${finalLuckValueAfterUpdate}). Their fortune resets.`,
                    });
                    if (luckTrackerConfig.resetsOnTrigger) {
                        await this.needsManager.updateNeedValue(actor, "luck", "0", { forceEffectUpdate: true });
                    }
                }
            }
        }

        const misfortuneTrackerConfig = this.needsManager.trackerConfigs.find(t => t.id === "misfortune" && t.enabled);
        if (misfortuneTrackerConfig) {
            let misfortuneIncreaseAmount = 0;
            if (degreeOfSuccess === 3 && typeof misfortuneTrackerConfig.increaseOnCritSuccess === 'number') {
                misfortuneIncreaseAmount = misfortuneTrackerConfig.increaseOnCritSuccess;
            }

            if (misfortuneIncreaseAmount > 0) {
                const currentMisfortune = actorNeeds.misfortune ?? misfortuneTrackerConfig.defaultValue ?? 0;
                let newMisfortune = currentMisfortune + misfortuneIncreaseAmount;
                
                await this.needsManager.updateNeedValue(actor, "misfortune", newMisfortune.toString());

                // Re-fetch needs to get the *actual* value after clamping and update
                const finalMisfortuneValueAfterUpdate = this.needsManager.getActorNeeds(actor).misfortune;

                if (misfortuneTrackerConfig.triggerAtValue && finalMisfortuneValueAfterUpdate >= misfortuneTrackerConfig.triggerAtValue) {
                    const gmNotifiedFlagKey = "misfortuneGmNotified"; // Simpler key
                    
                    if (misfortuneTrackerConfig.gmNotificationOnceFlag && actor.getFlag(MODULE_ID, gmNotifiedFlagKey)) {
                        // Already notified for this "trigger cycle"
                    } else {
                        if (game.user.isGM) { // Only the GM should action the pop-up
                            new Dialog({
                                title: "Misfortune Triggered!",
                                content: `<p style="text-align: center; font-size: 1.2em;"><strong>${actor.name.toUpperCase()} HAS A MISFORTUNE!</strong></p><p>Their Misfortune tracker has reached ${finalMisfortuneValueAfterUpdate}. Consider an unfortunate event.</p>`,
                                buttons: {
                                    ok: {
                                        icon: '<i class="fas fa-check"></i>',
                                        label: "Acknowledged"
                                    }
                                }
                            }).render(true);
                        } else { // Send a whisper to GMs if current user is not GM
                             ChatMessage.create({
                                speaker: ChatMessage.getSpeaker(), // System speaker
                                content: `GM ALERT: ${actor.name}'s Misfortune has reached ${finalMisfortuneValueAfterUpdate}! Consider an unfortunate event.`,
                                whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id)
                            });
                        }

                        if (misfortuneTrackerConfig.gmNotificationOnceFlag) {
                            await actor.setFlag(MODULE_ID, gmNotifiedFlagKey, true);
                        }
                    }

                    if (misfortuneTrackerConfig.resetsOnTrigger) { 
                        await this.needsManager.updateNeedValue(actor, "misfortune", "0", {forceEffectUpdate: true});
                        if (misfortuneTrackerConfig.gmNotificationOnceFlag) { 
                            await actor.unsetFlag(MODULE_ID, gmNotifiedFlagKey);
                        }
                    }
                }
            }
        }
    });
    // console.log(`%c[${this.moduleId}] Game hooks registered.`, "color: green;");
  }

  async performInitialActorSetup() {
    if (!game.user.isGM || !this.needsManager) {
      return;
    }
    this.needsManager.loadAllConfigs(); 

    const actorsToProcess = [];
    const affectsNPCs = game.settings.get(MODULE_ID, SETTINGS.AFFECTS_NPCS);

    for (const actor of game.actors) {
      if (actor.type === "character" || (actor.type === "npc" && affectsNPCs)) {
        actorsToProcess.push(actor);
      }
    }

    if (actorsToProcess.length > 0) {
      // console.log(`%c[${this.moduleId}] Performing initial setup/verification for ${actorsToProcess.length} actors.`, "color: blue;");
      for (const actor of actorsToProcess) {
        await this.needsManager.initializeNeedsForActor(actor);
        await new Promise((resolve) => setTimeout(resolve, game.users.length > 1 ? 20 : 5));
      }
      // console.log(`%c[${this.moduleId}] Initial actor setup/verification complete.`, "color: blue;");
    }
  }
}


// Ensure the global instance is created and initialized once.
try {
  if (!window.survivalNeedsGlobalInstance) {
    const globalInstance = new SurvivalNeedsModule();
    globalInstance.initialize(); // Calls Hooks.once("init", ...) and Hooks.once("ready", ...)
    window.survivalNeedsGlobalInstance = globalInstance; // Assign after successful initialization
    // console.log(`%c[${MODULE_ID}] Main module instance created and initialize() called.`, "color: purple; font-weight:bold;");
  } else {
    // If the instance exists but maybe canvasReady wasn't hooked correctly due to a reload
    // This is a bit of a safety net, ideally full reloads handle this cleanly.
    Hooks.on("canvasReady", () => {
      if (window.survivalNeedsGlobalInstance && typeof window.survivalNeedsGlobalInstance.initializeHoverListener === 'function') {
        // console.log(`%c[${MODULE_ID}] HOOK: canvasReady (re-hook) - Initializing hover listener.`, "color: orange;");
        window.survivalNeedsGlobalInstance.initializeHoverListener();
      }
    });
  }
} catch (error) {
  console.error(`%c[${MODULE_ID}] CRITICAL ERROR during global module instantiation or initial setup:`, "color:red; font-weight:bold;", error);
  ui.notifications.error(`${MODULE_ID}: Critical error during startup. Module may not function correctly. Check console (F12). Error: ${error.message}`, { permanent: true, console: false });
}