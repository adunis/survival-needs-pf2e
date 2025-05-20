// File: scripts/actor-needs.js

import { 
    MODULE_ID, 
    SETTINGS, 
    FLAG_PREFIX, 
    LAST_UPDATE_TIME_FLAG_KEY 
} from "./constants.js";
import { getTrackerConfigs } from "./settings.js";
import { ConditionManagerV2 } from "./condition-manager-v2.js";

export class NeedsManager {
    constructor() {
        this.conditionManagerV2 = new ConditionManagerV2();
        this.loadTrackerConfigs(); // Load initial configs and build inter-tracker links
        const logPrefix = `%c[${MODULE_ID} | NeedsManager]`;
        const constructorStyle = "color: dodgerblue; font-weight:bold;";
        console.log(`${logPrefix} Constructed. Using ConditionManagerV2. Version: SleepChoices_Full_V1.1`, constructorStyle);
    }

    /**
     * Loads (or reloads) the tracker configurations from game settings.
     * Also builds a quick lookup for inter-tracker dependencies.
     */
    loadTrackerConfigs() {
        this.trackerConfigs = getTrackerConfigs().filter(tc => tc.enabled === true); // Ensure only enabled
        this.interTrackerLinks = new Map(); 
        for (const tracker of this.trackerConfigs) {
            if (tracker.decreaseWhenOtherTrackerDecreases?.sourceTrackerId && 
                typeof tracker.decreaseWhenOtherTrackerDecreases.increaseThisTrackerByPercentageOfOther === 'number') {
                this.interTrackerLinks.set(
                    tracker.id, // The tracker that gets increased (e.g., "piss")
                    { // The config describing how it's linked
                        sourceTrackerId: tracker.decreaseWhenOtherTrackerDecreases.sourceTrackerId, // e.g., "thirst"
                        percentage: tracker.decreaseWhenOtherTrackerDecreases.increaseThisTrackerByPercentageOfOther
                    }
                );
            }
        }
        // console.log(`%c[${MODULE_ID}] NeedsManager: Loaded ${this.trackerConfigs.length} enabled trackers. Links:`, "color: dodgerblue;", this.interTrackerLinks);
    }

    /**
     * Gets the current values of all enabled trackers for a given actor.
     */
    getActorNeeds(actor) {
        const needs = {};
        if (!actor) return needs;
        // Ensure configs are loaded if not already (e.g., if called externally before full init)
        if (!this.trackerConfigs) this.loadTrackerConfigs(); 

        for (const tracker of this.trackerConfigs) {
            needs[tracker.id] = actor.getFlag(MODULE_ID, tracker.id) ?? tracker.defaultValue ?? 0;
        }
        return needs;
    }

    /**
     * Checks if an actor requires initialization of need flags (tracker values).
     */
    needsInitialization(actor) {
        if (!actor) return false;
        if (!this.trackerConfigs) this.loadTrackerConfigs();

        for (const tracker of this.trackerConfigs) {
            if (actor.getFlag(MODULE_ID, tracker.id) === undefined) return true;
        }
        return actor.getFlag(MODULE_ID, LAST_UPDATE_TIME_FLAG_KEY) === undefined;
    }

    /**
     * Gets the update object required to initialize an actor's need flags.
     */
    getInitializationFlags() {
        const updates = {};
        // Ensure configs are loaded
        if (!this.trackerConfigs) this.loadTrackerConfigs();

        for (const tracker of this.trackerConfigs) {
            updates[`${FLAG_PREFIX}.${tracker.id}`] = tracker.defaultValue ?? 0;
        }
        updates[`${FLAG_PREFIX}.${LAST_UPDATE_TIME_FLAG_KEY}`] = game.time.worldTime;
        return updates;
    }

    /**
     * Initializes need flags for an actor if they don't exist and processes their effects.
     */
    async initializeNeedsForActor(actor) {
        const logPrefix = `%c[${MODULE_ID} | NeedsManager | InitActor | ${actor?.name || 'Unknown'}]`;
        const detailStyle = "color: dodgerblue;";

        if (!actor || typeof actor.getFlag !== 'function') {
            console.warn(`${logPrefix} Invalid actor. Aborting initialization.`, "color:orange;");
            return;
        }
        this.loadTrackerConfigs(); 
        
        const affectsNPCs = game.settings.get(MODULE_ID, SETTINGS.AFFECTS_NPCS);
        if (actor.type !== 'character' && (actor.type !== 'npc' || !affectsNPCs)) {
            return;
        }

        if (this.needsInitialization(actor)) {
            const initFlags = this.getInitializationFlags();
            console.log(`${logPrefix} Initializing needs flags:`, detailStyle, initFlags);
            await actor.update(initFlags);
        }
        
        const currentNeeds = this.getActorNeeds(actor);
        await this.conditionManagerV2.processActorNeedsAndEffects(actor, currentNeeds, this.trackerConfigs);
    }

    /**
     * Called when game time advances. Updates needs for all relevant actors.
     */
    async onUpdateWorldTime(worldTime) {
        const logPrefix = `%c[${MODULE_ID} | NeedsManager | UpdateWorldTime]`;
        const detailStyle = "color: dodgerblue;";
        const errorStyle = "color: red;";

        if (!game.user.isGM) return;
        this.loadTrackerConfigs(); 
        const updateIntervalHours = game.settings.get(MODULE_ID, SETTINGS.UPDATE_INTERVAL_HOURS);
        const updateIntervalSeconds = updateIntervalHours * 3600;
        
        if (updateIntervalSeconds <= 0 || this.trackerConfigs.length === 0) return;

        const affectsNPCs = game.settings.get(MODULE_ID, SETTINGS.AFFECTS_NPCS);
        let processedActorCount = 0;

        for (const actor of game.actors) {
            // Optimization: only GMs process actors, and ideally only those they own if not a broad setting.
            // For simplicity, GM processes all applicable based on affectsNPCs.
            // if (!actor.testUserPermission(game.user, "OWNER")) continue; 
            if (actor.type !== 'character' && (actor.type !== 'npc' || !affectsNPCs)) continue;

            let lastUpdate = actor.getFlag(MODULE_ID, LAST_UPDATE_TIME_FLAG_KEY);
            if (lastUpdate === undefined) { 
                // console.log(`${logPrefix} Actor ${actor.name} needs initialization during time update.`, detailStyle);
                await this.initializeNeedsForActor(actor); 
                lastUpdate = actor.getFlag(MODULE_ID, LAST_UPDATE_TIME_FLAG_KEY);
                if (lastUpdate === undefined) {
                    console.warn(`${logPrefix} Actor ${actor.name} still missing LAST_UPDATE_TIME after init. Skipping.`, "color:orange;");
                    continue;
                }
            }
            
            const timeSinceLastUpdate = worldTime - lastUpdate;
            if (timeSinceLastUpdate >= updateIntervalSeconds) {
                const intervalsPassed = Math.floor(timeSinceLastUpdate / updateIntervalSeconds);
                if (intervalsPassed <= 0) continue;

                const actorFlagUpdates = {};
                let needsActuallyChangedByTime = false;

                for (const tracker of this.trackerConfigs) {
                    if ((tracker.increasePerInterval ?? 0) === 0) continue; 

                    const currentValue = actor.getFlag(MODULE_ID, tracker.id) ?? tracker.defaultValue ?? 0;
                    const changeDueToTime = tracker.increasePerInterval * intervalsPassed;
                    let newValue = currentValue + changeDueToTime;
                    newValue = Math.clamped(newValue, 0, tracker.maxValue ?? 100);

                    if (newValue !== currentValue) {
                        actorFlagUpdates[`${FLAG_PREFIX}.${tracker.id}`] = newValue;
                        needsActuallyChangedByTime = true;
                    }
                }
                
                if (needsActuallyChangedByTime || actor.getFlag(MODULE_ID, LAST_UPDATE_TIME_FLAG_KEY) !== lastUpdate + (intervalsPassed * updateIntervalSeconds)) {
                    actorFlagUpdates[`${FLAG_PREFIX}.${LAST_UPDATE_TIME_FLAG_KEY}`] = lastUpdate + (intervalsPassed * updateIntervalSeconds);
                    try {
                        // console.log(`${logPrefix} Updating flags for ${actor.name}:`, detailStyle, actorFlagUpdates);
                        await actor.update(actorFlagUpdates);
                        processedActorCount++;
                        const currentNeeds = this.getActorNeeds(actor);
                        await this.conditionManagerV2.processActorNeedsAndEffects(actor, currentNeeds, this.trackerConfigs);
                    } catch (e) { 
                        console.error(`${logPrefix} Error updating actor ${actor.name}:`, errorStyle, e);
                    }
                }
            }
        }
        // if (processedActorCount > 0) { console.log(`${logPrefix} World time update processed for ${processedActorCount} actors.`, detailStyle); }
    }

    /**
     * This method is called by the PF2e system hook "pf2e.restForTheNight" (or our manual trigger).
     * It handles the reduction of needs based on tracker configurations.
     */
    async processLongRest(actor) {
        if (!actor) return;
        this.loadTrackerConfigs(); 
        const actorFlagUpdates = {};
        let needsAffectedByRest = false;
        const logPrefix = `%c[${MODULE_ID} | NeedsManager | processLongRest | ${actor.name}]`;
        const detailStyle = "color: dodgerblue;";

        console.log(`${logPrefix} Processing long rest logic.`, detailStyle);

        for (const tracker of this.trackerConfigs) {
            if (tracker.regeneration?.byLongRest) {
                const flagKey = tracker.id;
                const currentValue = actor.getFlag(MODULE_ID, flagKey) ?? tracker.defaultValue ?? 0;
                const reductionAmount = tracker.regeneration.longRestAmount ?? 0; 
                const newValue = Math.clamped(currentValue - reductionAmount, 0, tracker.maxValue ?? 100);
                if (newValue !== currentValue) {
                    actorFlagUpdates[`${FLAG_PREFIX}.${flagKey}`] = newValue;
                    needsAffectedByRest = true;
                    console.log(`${logPrefix} Tracker '${tracker.id}' changing from ${currentValue} to ${newValue}.`, detailStyle);
                }
            }
        }

        if (needsAffectedByRest) {
            // The system itself usually handles setting the time after a long rest.
            // We ensure our flags are updated, and the system will handle overall time.
            // Setting LAST_UPDATE_TIME_FLAG_KEY here ensures our intervals align after rest.
            actorFlagUpdates[`${FLAG_PREFIX}.${LAST_UPDATE_TIME_FLAG_KEY}`] = game.time.worldTime;
            
            await actor.update(actorFlagUpdates);
            ui.notifications.info(game.i18n.format(`${MODULE_ID}.notifications.rested`, { actorName: actor.name }));
            
            const currentNeeds = this.getActorNeeds(actor);
            await this.conditionManagerV2.processActorNeedsAndEffects(actor, currentNeeds, this.trackerConfigs);
        } else {
            console.log(`${logPrefix} No needs affected by this long rest according to configs.`, detailStyle);
            // Even if no needs changed, effects might need re-evaluation if time/other factors changed
            // For example, if a rest clears temporary effects not tied to needs values.
            // However, for now, we only re-process if a need value changed.
            // If truly needed, could add: await this.conditionManagerV2.processActorNeedsAndEffects(actor, this.getActorNeeds(actor), this.trackerConfigs);
        }
    }
    
    /**
     * Updates a specific need for an actor, potentially triggering linked tracker updates.
     * @param {ActorPF2e} actor
     * @param {string} trackerId The ID of the tracker to update.
     * @param {number} newTrackerValue The new raw value for the tracker.
     * @param {object} [options={}] Optional. `triggeredByConsumption`, `forceEffectUpdate`.
     */
    async updateNeedValue(actor, trackerId, newTrackerValue, options = {}) {
        const logPrefix = `%c[${MODULE_ID} | NeedsManager | updateNeedValue | ${actor?.name || 'UnknownActor'}]`;
        const detailStyle = "color: dodgerblue;";
        const warningStyle = "color: orange;";

        if (!actor || !trackerId) {
            console.warn(`${logPrefix} Invalid actor or trackerId. Aborting.`, warningStyle);
            return;
        }
        this.loadTrackerConfigs(); // Ensure configs and interTrackerLinks are fresh

        const mainTracker = this.trackerConfigs.find(t => t.id === trackerId);
        if (!mainTracker) {
            console.warn(`${logPrefix} Unknown tracker ID: ${trackerId}. Aborting.`, warningStyle);
            return;
        }

        const currentMainValue = actor.getFlag(MODULE_ID, mainTracker.id) ?? mainTracker.defaultValue ?? 0;
        const clampedNewMainValue = Math.clamped(Number(newTrackerValue) || 0, 0, mainTracker.maxValue ?? 100);

        const updates = {};
        
        if (clampedNewMainValue !== currentMainValue) {
            updates[`${FLAG_PREFIX}.${mainTracker.id}`] = clampedNewMainValue;
            console.log(`${logPrefix} Tracker '${mainTracker.id}' changing from ${currentMainValue} to ${clampedNewMainValue}.`, detailStyle);

            // Inter-tracker logic: if main tracker DECREASED (e.g., eating/drinking)
            if (clampedNewMainValue < currentMainValue && options.triggeredByConsumption) {
                const amountDecreased = currentMainValue - clampedNewMainValue;
                console.log(`${logPrefix} '${mainTracker.id}' decreased by ${amountDecreased} due to consumption. Checking linked trackers.`, detailStyle);

                this.interTrackerLinks.forEach((linkConfig, targetTrackerId) => {
                    if (linkConfig.sourceTrackerId === mainTracker.id) {
                        const linkedTrackerConfig = this.trackerConfigs.find(t => t.id === targetTrackerId);
                        if (linkedTrackerConfig) {
                            const currentLinkedValue = actor.getFlag(MODULE_ID, targetTrackerId) ?? linkedTrackerConfig.defaultValue ?? 0;
                            const increaseAmount = Math.round(amountDecreased * (linkConfig.percentage ?? 0)); 
                            
                            if (increaseAmount > 0) {
                                const newLinkedValue = Math.clamped(currentLinkedValue + increaseAmount, 0, linkedTrackerConfig.maxValue ?? 100);
                                if (newLinkedValue !== currentLinkedValue) {
                                    updates[`${FLAG_PREFIX}.${targetTrackerId}`] = newLinkedValue;
                                    console.log(`${logPrefix} Increasing linked tracker '${targetTrackerId}' by ${increaseAmount} to ${newLinkedValue}.`, detailStyle);
                                }
                            }
                        }
                    }
                });
            }
        }

        if (Object.keys(updates).length > 0) { 
            await actor.update(updates);
            const currentNeeds = this.getActorNeeds(actor); 
            await this.conditionManagerV2.processActorNeedsAndEffects(actor, currentNeeds, this.trackerConfigs);
        } else if (options.forceEffectUpdate) { 
            console.log(`${logPrefix} Forcing effect update for tracker ${trackerId} even if value unchanged.`, detailStyle);
            const currentNeeds = this.getActorNeeds(actor); 
            await this.conditionManagerV2.processActorNeedsAndEffects(actor, currentNeeds, this.trackerConfigs);
        } else {
            // console.log(`${logPrefix} No value change for tracker ${trackerId} and no force update. No effect processing.`, debugStyle);
        }
    }

    // --- Methods for Special Actions (called by SheetIntegration) ---

    async relieveWaste(actor, trackerId, actionConfig) {
        if (!actor || !trackerId || !actionConfig) return;
        const message = actionConfig.chatMessage?.replace("{actorName}", actor.name) + 
                        (actionConfig.timeMinutes ? ` (Takes ${actionConfig.timeMinutes} minutes).` : "");
        if (message) ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: message });
        
        await this.updateNeedValue(actor, trackerId, actionConfig.reducesTo ?? 0, { forceEffectUpdate: true });
        ui.notifications.info(`${actor.name} ${trackerId === "piss" ? "urinated" : "defecated"} and feels relieved.`);
    }

    async dryOff(actor, actionConfig) {
        if (!actor || !actionConfig) return;
        const message = actionConfig.chatMessage?.replace("{actorName}", actor.name) +
                        (actionConfig.timeMinutes ? ` (Takes ${actionConfig.timeMinutes} minutes).` : "");
        if (message) ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: message });

        await this.updateNeedValue(actor, "wetness", actionConfig.reducesTo ?? 0, { forceEffectUpdate: true });
        ui.notifications.info(`${actor.name} is now dry.`);
    }

// File: scripts/actor-needs.js
// Add this new method inside the NeedsManager class.
// Ensure the rest of the NeedsManager class (constructor, loadTrackerConfigs, etc.)
// is the same as the "SleepChoices_Full_V1.1" version, with the corrected handleRestChoice.

// ... (existing methods like constructor, loadTrackerConfigs, getActorNeeds, etc.) ...

    /**
     * Processes the detailed consumption data to update various needs trackers.
     * @param {ActorPF2e} actor The actor consuming.
     * @param {object} consumptionData Object containing item details, user choices, etc.
     *        Expected properties: item, itemBulk, originalTrackerId ("hunger" or "thirst"),
     *        baseRestoreAmount, caloricType?, taste?, drinkQuality?, isAlcoholic?, isPotion?, drinkCaloric?
     */

     async processDetailedConsumption(actor, consumptionData) {
        const logPrefix = `%c[${MODULE_ID} | NeedsManager | processDetailedConsumption | ${actor.name} | V1.1_PooPissMultiply]`;
        const detailStyle = "color: teal;";
        console.log(`${logPrefix} Processing:`, detailStyle, foundry.utils.deepClone(consumptionData));

        this.loadTrackerConfigs(); // Ensure tracker configs are fresh

        const RATION_USE_EFFECTIVE_BULK = 0.02; 
        const WATERSKIN_SERVING_EFFECTIVE_BULK = 0.02;

        const hungerTrackerConfig = this.trackerConfigs.find(t => t.id === "hunger");
        const thirstTrackerConfig = this.trackerConfigs.find(t => t.id === "thirst");
        
        const BASE_HUNGER_RESTORE_PER_STANDARD_USE = hungerTrackerConfig?.regeneration?.itemRestoreAmount || 3.33;
        const BASE_THIRST_RESTORE_PER_STANDARD_USE = thirstTrackerConfig?.regeneration?.itemRestoreAmount || 20;

        let hungerActualReduction = 0; // How much hunger value actually changed
        let thirstActualReduction = 0; // How much thirst value actually changed
        
        let boredomChange = 0;  
        let stressChange = 0;   
        
        // These will store the *calculated increase* for piss/poop, not the final value
        let calculatedPissIncrease = 0;
        let calculatedPoopIncrease = 0;

        const updates = {};
        const chatMessageParts = [`<div class="pf2e-rules-based-effects">`];
        chatMessageParts.push(`<div style="display: flex; align-items: center; margin-bottom: 5px;"><img src="${consumptionData.itemIcon}" title="${consumptionData.itemName}" width="32" height="32" style="margin-right: 5px; flex-shrink:0; border:1px solid #999"/><span>${actor.name} consumed <strong>${consumptionData.itemName}</strong>.</span></div>`);
        const chosenOptionsForChat = [];

        // --- Calculate Hunger & Thirst Reduction ---
        let hungerReductionAmount = 0;
        let thirstReductionAmount = 0;

        if (consumptionData.isStandard) {
            if (consumptionData.originalTrackerId === "hunger") {
                hungerReductionAmount = BASE_HUNGER_RESTORE_PER_STANDARD_USE;
                if (consumptionData.taste === "boring") boredomChange += 20; // Standard ration taste
                chosenOptionsForChat.push(`Type: Standard Ration (Medium Caloric, Boring)`);
            } else if (consumptionData.originalTrackerId === "thirst") {
                thirstReductionAmount = BASE_THIRST_RESTORE_PER_STANDARD_USE;
                chosenOptionsForChat.push(`Type: Standard Water`);
            }
        } else {
            const itemEffectiveBulk = consumptionData.itemBulk;
            if (consumptionData.originalTrackerId === "hunger" || consumptionData.drinkCaloric !== "none") {
                const effectivenessFactor = itemEffectiveBulk / STANDARD_FOOD_USE_BULK;
                let calcHungerReduction = effectivenessFactor * BASE_HUNGER_RESTORE_PER_STANDARD_USE;
                if (consumptionData.originalTrackerId === "thirst") { 
                    if (consumptionData.drinkCaloric === "slight") calcHungerReduction *= 0.25;
                    else if (consumptionData.drinkCaloric === "high") calcHungerReduction *= 1.0;
                    else calcHungerReduction = 0;
                    if (consumptionData.drinkCaloric !== "none") chosenOptionsForChat.push(`Drink Caloric: ${game.i18n.localize("SURVIVAL_NEEDS.choices.drink.caloric"+consumptionData.drinkCaloric.charAt(0).toUpperCase()+consumptionData.drinkCaloric.slice(1)) || consumptionData.drinkCaloric}`);
                } else { 
                    if (consumptionData.caloricType === "low") calcHungerReduction *= 0.5; // Reduced from 0.6
                    else if (consumptionData.caloricType === "high") calcHungerReduction *= 1.5; // Increased from 1.4
                    chosenOptionsForChat.push(`Caloric: ${game.i18n.localize("SURVIVAL_NEEDS.choices.food."+consumptionData.caloricType.replace("Caloric","").toLowerCase()+"Caloric") || consumptionData.caloricType}`);
                }
                hungerReductionAmount = Math.round(calcHungerReduction);
                if (consumptionData.taste === "boring") boredomChange += 20;
                else if (consumptionData.taste === "interesting") boredomChange -= 30;
                if (consumptionData.taste) chosenOptionsForChat.push(`Taste: ${game.i18n.localize("SURVIVAL_NEEDS.choices.food."+consumptionData.taste) || consumptionData.taste}`);
            }
            if (consumptionData.originalTrackerId === "thirst") {
                const effectivenessFactor = itemEffectiveBulk / STANDARD_DRINK_USE_BULK;
                thirstReductionAmount = Math.round(effectivenessFactor * BASE_THIRST_RESTORE_PER_STANDARD_USE);
                if (consumptionData.drinkQuality === "dirty") stressChange += 25;
                else if (consumptionData.drinkQuality === "purified") stressChange -= 15;
                if (consumptionData.drinkQuality) chosenOptionsForChat.push(`Quality: ${game.i18n.localize("SURVIVAL_NEEDS.choices.drink."+consumptionData.drinkQuality) || consumptionData.drinkQuality}`);
                if (consumptionData.isAlcoholic) { stressChange += 10; boredomChange -= 40; chosenOptionsForChat.push(game.i18n.localize("SURVIVAL_NEEDS.choices.drink.isAlcoholicShort"));}
                if (consumptionData.isPotion) { stressChange += 15; boredomChange -= 10; chosenOptionsForChat.push(game.i18n.localize("SURVIVAL_NEEDS.choices.drink.isPotionShort"));}
            }
        }

        // --- Apply Hunger Change & Calculate Poop Increase ---
        if (hungerReductionAmount > 0 && hungerTrackerConfig) {
            const current = actor.getFlag(MODULE_ID, "hunger") ?? hungerTrackerConfig.defaultValue ?? 0;
            const newValue = Math.clamped(current - hungerReductionAmount, 0, hungerTrackerConfig.maxValue ?? 100);
            if (newValue !== current) updates[`${FLAG_PREFIX}.hunger`] = newValue;
            hungerActualReduction = current - newValue; // Actual amount hunger changed by
            chatMessageParts.push(`Hunger reduced by ${hungerActualReduction} (to ${newValue}).`);
            if (hungerActualReduction > 0) { // Only increase poop if hunger actually went down
                calculatedPoopIncrease = Math.round(hungerActualReduction * 6); // x6 multiplier
            }
        }

        // --- Apply Thirst Change & Calculate Piss Increase ---
        if (thirstReductionAmount > 0 && thirstTrackerConfig) {
            const current = actor.getFlag(MODULE_ID, "thirst") ?? thirstTrackerConfig.defaultValue ?? 0;
            const newValue = Math.clamped(current - thirstReductionAmount, 0, thirstTrackerConfig.maxValue ?? 100);
            if (newValue !== current) updates[`${FLAG_PREFIX}.thirst`] = newValue;
            thirstActualReduction = current - newValue; // Actual amount thirst changed by
            chatMessageParts.push(`Thirst reduced by ${thirstActualReduction} (to ${newValue}).`);
            if (thirstActualReduction > 0) { // Only increase piss if thirst actually went down
                calculatedPissIncrease = Math.round(thirstActualReduction * 2); // x2 multiplier
            }
        }
        
        // --- Update Piss Tracker ---
        if (calculatedPissIncrease > 0) {
            const pissTC = this.trackerConfigs.find(t => t.id === "piss");
            if (pissTC) {
                const currentPiss = actor.getFlag(MODULE_ID, "piss") ?? pissTC.defaultValue ?? 0;
                const newPiss = Math.clamped(currentPiss + calculatedPissIncrease, 0, pissTC.maxValue ?? 100);
                if (newPiss !== currentPiss) updates[`${FLAG_PREFIX}.piss`] = newPiss;
                if (newPiss - currentPiss > 0) chatMessageParts.push(`Bladder filled (+${newPiss - currentPiss}).`);
            }
        }

        // --- Update Poop Tracker ---
        if (calculatedPoopIncrease > 0) {
            const poopTC = this.trackerConfigs.find(t => t.id === "poop");
            if (poopTC) {
                const currentPoop = actor.getFlag(MODULE_ID, "poop") ?? 0;
                const newPoop = Math.clamped(currentPoop + calculatedPoopIncrease, 0, poopTC.maxValue ?? 100);
                if (newPoop !== currentPoop) updates[`${FLAG_PREFIX}.poop`] = newPoop;
                 if (newPoop - currentPoop > 0) chatMessageParts.push(`Bowels filled (+${newPoop - currentPoop}).`);
            }
        }
        
        if (boredomChange !== 0) { /* ... update boredom, add to chat ... */ 
            const tracker = this.trackerConfigs.find(t => t.id === "boredom");
            if (tracker) {
                const current = actor.getFlag(MODULE_ID, "boredom") ?? tracker.defaultValue ?? 0;
                const newValue = Math.clamped(current + boredomChange, 0, tracker.maxValue ?? 100);
                if (newValue !== current) updates[`${FLAG_PREFIX}.boredom`] = newValue;
                const verb = boredomChange < 0 ? "reduced" : "increased";
                chatMessageParts.push(`Boredom ${verb} by ${Math.abs(boredomChange)} (to ${newValue}).`);
            }
        }
        if (stressChange !== 0) { /* ... update stress, add to chat ... */ 
            const tracker = this.trackerConfigs.find(t => t.id === "stress");
            if (tracker) {
                const current = actor.getFlag(MODULE_ID, "stress") ?? tracker.defaultValue ?? 0;
                const newValue = Math.clamped(current + stressChange, 0, tracker.maxValue ?? 100);
                if (newValue !== current) updates[`${FLAG_PREFIX}.stress`] = newValue;
                const verb = stressChange < 0 ? "reduced" : "increased";
                chatMessageParts.push(`Stress ${verb} by ${Math.abs(stressChange)} (to ${newValue}).`);
            }
        }

        if (poopIncreaseAmount > 0) chatMessageParts.push(`Bowels filled (+${poopIncreaseAmount}).`);
        if (pissIncreaseAmount > 0) chatMessageParts.push(`Bladder filled (+${pissIncreaseAmount}).`);
        
        if (chosenOptionsForChat.length > 0 && !consumptionData.isStandard) {
            chatMessageParts.push(`<hr style="border-top: 1px dashed #ccc; border-bottom: none;"><em>Choices: ${chosenOptionsForChat.join(', ')}</em>`);
        }
        chatMessageParts.push(`</div>`);


        if (Object.keys(updates).length > 0) {
            await actor.update(updates);
            const currentNeeds = this.getActorNeeds(actor);
            await this.conditionManagerV2.processActorNeedsAndEffects(actor, currentNeeds, this.trackerConfigs);
        }
        
        if (chatMessageParts.length > 2) { // Initial message + div
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({actor: actor}),
                content: chatMessageParts.join("<br>")
            });
        }
        console.log(`${logPrefix} Detailed consumption processing complete.`, detailStyle);
    }



    async relieveBoredomOrStress(actor, trackerId, choiceConfig) {
        if (!actor || !trackerId || !choiceConfig) return;
        const logPrefix = `%c[${MODULE_ID} | NeedsManager | relieveBoredomOrStress | ${actor.name}]`;
        const detailStyle = "color: mediumpurple;";

        console.log(`${logPrefix} Action for ${trackerId} with choice '${choiceConfig.label}'.`, detailStyle, choiceConfig);

        const currentTrackerValue = actor.getFlag(MODULE_ID, trackerId) ?? 0;
        const reduction = choiceConfig.reducesBy ?? 0;
        const newValue = Math.max(0, currentTrackerValue - reduction);

        const message = choiceConfig.chatMessage?.replace("{actorName}", actor.name) +
                        (choiceConfig.timeMinutes ? ` (Takes ${choiceConfig.timeMinutes} minutes).` : "");
        if (message) ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: message });
        
        await this.updateNeedValue(actor, trackerId, newValue, { forceEffectUpdate: true });
        ui.notifications.info(`${actor.name} feels less ${trackerId}.`);
    }

    async handleRestChoice(actor, trackerId, choiceConfig) {
        if (!actor || trackerId !== "sleep" || !choiceConfig) {
            console.warn(`%c[${MODULE_ID}] NeedsManager: Invalid call to handleRestChoice.`, "color:orange;");
            return;
        }
        const logPrefix = `%c[${MODULE_ID}] NeedsManager | handleRestChoice | ${actor.name}]`;
        const detailStyle = "color: mediumpurple;";
        const warningStyle = "color: orange; font-weight:bold;";
        const errorStyle = "color: red; font-weight:bold;";

        console.log(`${logPrefix} Processing rest choice '${choiceConfig.id}':`, detailStyle, choiceConfig);

        const timeInHours = choiceConfig.timeMinutes ? Math.round(choiceConfig.timeMinutes / 60 * 10) / 10 : null;
        const timeString = timeInHours ? ` (Takes approx. ${timeInHours} hours).` : 
                           (choiceConfig.timeMinutes ? ` (Takes ${choiceConfig.timeMinutes} minutes).` : "");
        
        const messageContent = choiceConfig.chatMessage?.replace("{actorName}", actor.name) + timeString;
        if (choiceConfig.chatMessage) {
             ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: messageContent });
        }

        if (choiceConfig.triggersLongRest) {
            console.log(`${logPrefix} Choice '${choiceConfig.id}' triggers a full long rest. Attempting to initiate via game.pf2e.actions.restForTheNight...`, detailStyle);
            
            if (actor.type === 'character') {
                try {
                    // Use the system's global action for resting.
                    // This correctly handles the dialogs and process for one or more characters.
                    // We pass the specific actor instance in an array.
                    ui.notifications.info(game.i18n.format("PF2E.RestNotification", { actor: actor.name })); // Optional: Mimic system notification
                    
                    await game.pf2e.actions.restForTheNight({ actors: [actor] });
                    
                    console.log(`${logPrefix} game.pf2e.actions.restForTheNight() called for ${actor.name}.`, detailStyle);
                    // Your module's `processLongRest` will be called via the `pf2e.restForTheNight` hook
                    // that the system action emits.
                } catch (err) {
                    console.error(`${logPrefix} Error calling game.pf2e.actions.restForTheNight():`, errorStyle, err);
                    ui.notifications.error(`Failed to initiate long rest for ${actor.name}. See console.`);
                }
            } else {
                console.warn(`${logPrefix} 'triggersLongRest' used for non-character actor type '${actor.type}'. Standard long rest via system action may not apply or behave as expected.`, warningStyle);
                // If you still want to trigger the hook for NPCs or other types for your module's processing:
                // Hooks.callAll("pf2e.restForTheNight", actor);
            }

        } else if (choiceConfig.reducesBy !== undefined) { // For short nap or moderate sleep
            const currentSleepDep = actor.getFlag(MODULE_ID, "sleep") ?? 0;
            const reduction = choiceConfig.reducesBy ?? 0;
            const newSleepDep = Math.max(0, currentSleepDep - reduction);
            console.log(`${logPrefix} Choice '${choiceConfig.id}' reduces sleep dep by ${reduction} from ${currentSleepDep} to ${newSleepDep}.`, detailStyle);
            await this.updateNeedValue(actor, "sleep", newSleepDep, { forceEffectUpdate: true }); // forceEffectUpdate ensures effects re-evaluate
            ui.notifications.info(`${actor.name} feels more rested after their ${choiceConfig.label.toLowerCase()}.`);
        } else {
            console.warn(`${logPrefix} Sleep choice '${choiceConfig.id}' has no 'triggersLongRest' or 'reducesBy'. No specific rest action taken.`, warningStyle);
        }
    }
}