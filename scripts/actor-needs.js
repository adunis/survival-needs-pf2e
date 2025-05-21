import {
    MODULE_ID,
    SETTINGS,
    FLAG_PREFIX,
    LAST_UPDATE_TIME_FLAG_KEY,
    DEFAULT_TRACKER_CONFIGS,
    DEFAULT_CONSUMPTION_CALC_SETTINGS
} from "./constants.js";
import { getTrackerConfigs, getConsumptionCalcSettings } from "./settings.js";
import { ConditionManagerV2 } from "./condition-manager-v2.js";

export class NeedsManager {
    constructor() {
        this.conditionManagerV2 = new ConditionManagerV2();
        this.trackerConfigs = [];
        this.consumptionCalcSettings = {};
        this.interTrackerLinks = new Map();

        this.loadAllConfigs();

        const logPrefix = `%c[${MODULE_ID} | NeedsManager]`;
        const constructorStyle = "color: dodgerblue; font-weight:bold;";
        console.log(`${logPrefix} Constructed. Using ConditionManagerV2. Version: Full_Corrected_V1.3`, constructorStyle);
    }

    loadAllConfigs() {
        const logPrefix = `%c[${MODULE_ID} | NeedsManager | loadAllConfigs_V1.4_ResetDebug]`;
        const detailStyle = "color: mediumblue;";
        const errorStyle = "color: red; font-weight: bold;";
        const warningStyle = "color: orange;";
        console.log(`${logPrefix} ======= LOAD ALL CONFIGS CALLED =======`, "background-color: yellow; color: black;");

        this.trackerConfigs = [];
        this.consumptionCalcSettings = {};
        this.interTrackerLinks = new Map();

        let rawTrackersFromSettings;
        try {
            rawTrackersFromSettings = getTrackerConfigs();
            console.log(`${logPrefix} Data from getTrackerConfigs() (should be from game.settings):`, detailStyle, foundry.utils.deepClone(rawTrackersFromSettings));
        } catch (e) {
            console.error(`${logPrefix} ERROR calling getTrackerConfigs():`, errorStyle, e);
            rawTrackersFromSettings = null;
        }

        if (rawTrackersFromSettings && Array.isArray(rawTrackersFromSettings)) {
            console.log(`${logPrefix} Filtering ${rawTrackersFromSettings.length} raw trackers based on 'enabled' flag...`, detailStyle);
            rawTrackersFromSettings.forEach(t => console.log(`${logPrefix}   - Tracker: ${t.id}, Name: ${t.name}, Enabled: ${t.enabled}`, detailStyle));
            this.trackerConfigs = rawTrackersFromSettings.filter(tc => tc.enabled === true);
        } else {
            console.warn(`${logPrefix} getTrackerConfigs() did not return valid array. Falling back to DEFAULT_TRACKER_CONFIGS.`, warningStyle);
            if (typeof DEFAULT_TRACKER_CONFIGS !== "undefined" && Array.isArray(DEFAULT_TRACKER_CONFIGS)) {
                console.log(`${logPrefix} Using DEFAULT_TRACKER_CONFIGS for fallback:`, detailStyle, foundry.utils.deepClone(DEFAULT_TRACKER_CONFIGS));
                this.trackerConfigs = foundry.utils.deepClone(DEFAULT_TRACKER_CONFIGS).filter(tc => tc.enabled === true);
            } else {
                console.error(`${logPrefix} CRITICAL: DEFAULT_TRACKER_CONFIGS not available for fallback!`, errorStyle);
                this.trackerConfigs = [];
            }
        }
        console.log(`${logPrefix} FINAL this.trackerConfigs in NeedsManager has ${this.trackerConfigs.length} items:`,
            this.trackerConfigs.length > 0 ? detailStyle : warningStyle,
            this.trackerConfigs.map(t => t.id));
        let consumptionSettingsAttempt;
        try {
            consumptionSettingsAttempt = getConsumptionCalcSettings();
        } catch (e) {
            console.error(`${logPrefix} ERROR calling getConsumptionCalcSettings():`, errorStyle, e);
            consumptionSettingsAttempt = null;
        }

        if (consumptionSettingsAttempt && typeof consumptionSettingsAttempt === 'object' && consumptionSettingsAttempt !== null) {
            this.consumptionCalcSettings = consumptionSettingsAttempt;
        } else {
            console.warn(`${logPrefix} getConsumptionCalcSettings() invalid result. Falling back to DEFAULT_CONSUMPTION_CALC_SETTINGS.`, warningStyle);
            if (typeof DEFAULT_CONSUMPTION_CALC_SETTINGS !== "undefined" && typeof DEFAULT_CONSUMPTION_CALC_SETTINGS === "object") {
                this.consumptionCalcSettings = foundry.utils.deepClone(DEFAULT_CONSUMPTION_CALC_SETTINGS);
            } else {
                console.error(`${logPrefix} CRITICAL: DEFAULT_CONSUMPTION_CALC_SETTINGS not available! consumptionCalcSettings is empty.`, errorStyle);
            }
        }

        if (this.trackerConfigs && Array.isArray(this.trackerConfigs)) {
            for (const tracker of this.trackerConfigs) {
                if (tracker.decreaseWhenOtherTrackerDecreases?.sourceTrackerId &&
                    typeof tracker.decreaseWhenOtherTrackerDecreases.increaseThisTrackerByPercentageOfOther === 'number') {
                    this.interTrackerLinks.set(
                        tracker.id,
                        {
                            sourceTrackerId: tracker.decreaseWhenOtherTrackerDecreases.sourceTrackerId,
                            percentage: tracker.decreaseWhenOtherTrackerDecreases.increaseThisTrackerByPercentageOfOther
                        }
                    );
                }
            }
        }
    }

    getActorNeeds(actor) {
        const needs = {};
        if (!actor) return needs;
        if (!this.trackerConfigs || this.trackerConfigs.length === 0 && Object.keys(this.consumptionCalcSettings).length === 0) {
            this.loadAllConfigs();
        }
        for (const tracker of this.trackerConfigs) {
            needs[tracker.id] = actor.getFlag(MODULE_ID, tracker.id) ?? tracker.defaultValue ?? 0;
        }
        return needs;
    }

    needsInitialization(actor) {
        if (!actor) return false;
        if (!this.trackerConfigs || this.trackerConfigs.length === 0 && Object.keys(this.consumptionCalcSettings).length === 0) {
            this.loadAllConfigs();
        }
        for (const tracker of this.trackerConfigs) {
            if (actor.getFlag(MODULE_ID, tracker.id) === undefined) return true;
        }
        return actor.getFlag(MODULE_ID, LAST_UPDATE_TIME_FLAG_KEY) === undefined;
    }

    getInitializationFlags() {
        const updates = {};
        if (!this.trackerConfigs || this.trackerConfigs.length === 0 && Object.keys(this.consumptionCalcSettings).length === 0) {
            this.loadAllConfigs();
        }
        for (const tracker of this.trackerConfigs) {
            updates[`${FLAG_PREFIX}.${tracker.id}`] = tracker.defaultValue ?? 0;
        }
        updates[`${FLAG_PREFIX}.${LAST_UPDATE_TIME_FLAG_KEY}`] = game.time.worldTime;
        return updates;
    }

    async initializeNeedsForActor(actor) {
        const logPrefix = `%c[${MODULE_ID} | NeedsManager | InitActor | ${actor?.name || 'Unknown'}]`;
        const detailStyle = "color: dodgerblue;";

        if (!actor || typeof actor.getFlag !== 'function') { return; }
        this.loadAllConfigs();

        const affectsNPCs = game.settings.get(MODULE_ID, SETTINGS.AFFECTS_NPCS);
        if (actor.type !== 'character' && (actor.type !== 'npc' || !affectsNPCs)) { return; }

        if (this.needsInitialization(actor)) {
            const initFlags = this.getInitializationFlags();
            await actor.update(initFlags);
        }

        const currentNeeds = this.getActorNeeds(actor);
        await this.conditionManagerV2.processActorNeedsAndEffects(actor, currentNeeds, this.trackerConfigs);
    }

    async onUpdateWorldTime(worldTime) {
        const logPrefix = `%c[${MODULE_ID} | NeedsManager | UpdateWorldTime]`;
        const detailStyle = "color: dodgerblue;";
        const errorStyle = "color: red; font-weight:bold;";

        if (!game.user.isGM) return;
        this.loadAllConfigs();
        const updateIntervalHours = game.settings.get(MODULE_ID, SETTINGS.UPDATE_INTERVAL_HOURS);
        const updateIntervalSeconds = updateIntervalHours * 3600;

        if (updateIntervalSeconds <= 0 || this.trackerConfigs.length === 0) return;

        const affectsNPCs = game.settings.get(MODULE_ID, SETTINGS.AFFECTS_NPCS);
        let processedActorCount = 0;

        for (const actor of game.actors) {
            if (actor.type !== 'character' && (actor.type !== 'npc' || !affectsNPCs)) continue;
            let lastUpdate = actor.getFlag(MODULE_ID, LAST_UPDATE_TIME_FLAG_KEY);
            if (lastUpdate === undefined) {
                await this.initializeNeedsForActor(actor);
                lastUpdate = actor.getFlag(MODULE_ID, LAST_UPDATE_TIME_FLAG_KEY);
                if (lastUpdate === undefined) continue;
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
                    if (newValue !== currentValue) { actorFlagUpdates[`${FLAG_PREFIX}.${tracker.id}`] = newValue; needsActuallyChangedByTime = true; }
                }

                if (needsActuallyChangedByTime || actor.getFlag(MODULE_ID, LAST_UPDATE_TIME_FLAG_KEY) !== lastUpdate + (intervalsPassed * updateIntervalSeconds)) {
                    actorFlagUpdates[`${FLAG_PREFIX}.${LAST_UPDATE_TIME_FLAG_KEY}`] = lastUpdate + (intervalsPassed * updateIntervalSeconds);
                    try {
                        await actor.update(actorFlagUpdates);
                        processedActorCount++;
                        const cN = this.getActorNeeds(actor);
                        await this.conditionManagerV2.processActorNeedsAndEffects(actor, cN, this.trackerConfigs);
                    }
                    catch (e) { console.error(`${logPrefix} Error updating actor ${actor.name}:`, errorStyle, e); }
                }
            }
        }
    }

    async processLongRest(actor) {
        if (!actor) return;
        this.loadAllConfigs();
        const actorFlagUpdates = {};
        let needsAffectedByRest = false;
        const logPrefix = `%c[${MODULE_ID} | NeedsManager | processLongRest | ${actor.name}]`;
        const detailStyle = "color: dodgerblue;";

        for (const tracker of this.trackerConfigs) {
            if (tracker.regeneration?.byLongRest) {
                const currentValue = actor.getFlag(MODULE_ID, tracker.id) ?? tracker.defaultValue ?? 0;
                const reduction = tracker.regeneration.longRestAmount ?? 0;
                const newValue = Math.clamped(currentValue - reduction, 0, tracker.maxValue ?? 100);
                if (newValue !== currentValue) { actorFlagUpdates[`${FLAG_PREFIX}.${tracker.id}`] = newValue; needsAffectedByRest = true; }
            }
        }
        if (needsAffectedByRest) {
            actorFlagUpdates[`${FLAG_PREFIX}.${LAST_UPDATE_TIME_FLAG_KEY}`] = game.time.worldTime;
            await actor.update(actorFlagUpdates);
            ui.notifications.info(game.i18n.format(`${MODULE_ID}.notifications.rested`, { actorName: actor.name }));
            const cN = this.getActorNeeds(actor);
            await this.conditionManagerV2.processActorNeedsAndEffects(actor, cN, this.trackerConfigs);
        }
    }

    async updateNeedValue(actor, trackerId, newTrackerValue, options = {}) {
        const logPrefix = `%c[${MODULE_ID} | NeedsManager | updateNeedValue | ${actor?.name || 'UnknownActor'}]`;
        const detailStyle = "color: dodgerblue;";
        const warningStyle = "color: orange;";

        if (!actor || !trackerId) { return; }
        this.loadAllConfigs();

        const mainTracker = this.trackerConfigs.find(t => t.id === trackerId);
        if (!mainTracker) { return; }

        const currentMainValue = actor.getFlag(MODULE_ID, mainTracker.id) ?? mainTracker.defaultValue ?? 0;
        const clampedNewMainValue = Math.clamped(Number(newTrackerValue) || 0, 0, mainTracker.maxValue ?? 100);
        const updates = {};

        if (clampedNewMainValue !== currentMainValue) {
            updates[`${FLAG_PREFIX}.${mainTracker.id}`] = clampedNewMainValue;
            if (clampedNewMainValue < currentMainValue && options.triggeredByConsumption) {
                const amountDecreased = currentMainValue - clampedNewMainValue;
                this.interTrackerLinks.forEach((linkConfig, targetTrId) => {
                    if (linkConfig.sourceTrackerId === mainTracker.id) {
                        const linkedTCfg = this.trackerConfigs.find(t => t.id === targetTrId);
                        if (linkedTCfg) { }
                    }
                });
            }
        }

        if (Object.keys(updates).length > 0) {
            await actor.update(updates);
            const cN = this.getActorNeeds(actor);
            await this.conditionManagerV2.processActorNeedsAndEffects(actor, cN, this.trackerConfigs);
        } else if (options.forceEffectUpdate) {
            const cN = this.getActorNeeds(actor);
            await this.conditionManagerV2.processActorNeedsAndEffects(actor, cN, this.trackerConfigs);
        }
    }

    async processDetailedConsumption(actor, consumptionData) {
        const logPrefix = `%c[${MODULE_ID} | NeedsManager | processDetailedConsumption | ${actor.name} | V1.8_MergedFix]`;
        const detailStyle = "color: teal;";
        console.log(`${logPrefix} Processing:`, detailStyle, foundry.utils.deepClone(consumptionData));

        this.loadAllConfigs();

        const calcSettings = this.consumptionCalcSettings;
        const STANDARD_FOOD_USE_EFFECTIVE_BULK = calcSettings.STANDARD_FOOD_USE_EFFECTIVE_BULK || 0.02;
        const STANDARD_DRINK_USE_EFFECTIVE_BULK = calcSettings.STANDARD_DRINK_USE_EFFECTIVE_BULK || 0.02;

        const hungerTrackerConfig = this.trackerConfigs.find(t => t.id === "hunger");
        const thirstTrackerConfig = this.trackerConfigs.find(t => t.id === "thirst");
        const pissTrackerConfig = this.trackerConfigs.find(t => t.id === "piss");
        const poopTrackerConfig = this.trackerConfigs.find(t => t.id === "poop");
        const boredomTrackerConfig = this.trackerConfigs.find(t => t.id === "boredom");
        const stressTrackerConfig = this.trackerConfigs.find(t => t.id === "stress");

        const BASE_HUNGER_RESTORE_PER_STANDARD_USE =
            calcSettings.DEFAULT_HUNGER_RESTORE_PER_STANDARD_USE ??
            (hungerTrackerConfig?.regeneration?.itemRestoreAmount || 3.33);

        const BASE_THIRST_RESTORE_PER_STANDARD_USE =
            calcSettings.DEFAULT_THIRST_RESTORE_PER_STANDARD_USE ??
            (thirstTrackerConfig?.regeneration?.itemRestoreAmount || 20);

        let hungerActualReduction = 0;
        let thirstActualReduction = 0;
        let boredomChangeFinal = 0;
        let stressChangeFinal = 0;
        let actualPissIncrease = 0;
        let actualPoopIncrease = 0;
        let calculatedPoopIncrease = 0;
        let calculatedPissIncrease = 0;

        const updates = {};
        const chatMessageParts = [`<div class="pf2e-rules-based-effects survival-needs-chat-card">`];
        chatMessageParts.push(`<div class="card-header" style="display: flex; align-items: center; margin-bottom: 0.5em;"><img src="${consumptionData.itemIcon || 'icons/svg/mystery-man.svg'}" title="${consumptionData.itemName}" width="36" height="36" style="margin-right: 8px; border:none; flex-shrink:0;"/><h3 style="margin:0;">${actor.name} consumed <strong>${consumptionData.itemName}</strong>.</h3></div>`);
        const chosenOptionsForChat = [];
        const effectsOnNeeds = [];

        let calculatedHungerReduction = 0;
        let calculatedThirstReduction = 0;
        let tempBoredomChange = 0;
        let tempStressChange = 0;

        if (consumptionData.isStandard) {
            if (consumptionData.originalTrackerId === "hunger") {
                calculatedHungerReduction = BASE_HUNGER_RESTORE_PER_STANDARD_USE;
                if (consumptionData.taste === "boring") tempBoredomChange += (calcSettings.TASTE_BOREDOM?.boring ?? 20);
                chosenOptionsForChat.push(`<em>Standard Ration: Medium Caloric, Boring Taste</em>`);
            } else if (consumptionData.originalTrackerId === "thirst") {
                calculatedThirstReduction = BASE_THIRST_RESTORE_PER_STANDARD_USE;
                chosenOptionsForChat.push(`<em>Standard Water: Average Quality</em>`);
            }
        } else {
            const itemEffectiveBulk = consumptionData.itemBulk;
            if (consumptionData.originalTrackerId === "hunger" || (consumptionData.drinkCaloric && consumptionData.drinkCaloric !== "none")) {
                const effectivenessFactor = itemEffectiveBulk / STANDARD_FOOD_USE_EFFECTIVE_BULK;
                let baseCalcHunger = effectivenessFactor * BASE_HUNGER_RESTORE_PER_STANDARD_USE;
                if (consumptionData.originalTrackerId === "thirst") {
                    baseCalcHunger *= (calcSettings.DRINK_CALORIC_MODIFIERS?.[consumptionData.drinkCaloric] ?? 0);
                    if (consumptionData.drinkCaloric && consumptionData.drinkCaloric !== "none") {
                        const locKey = "SURVIVAL_NEEDS.choices.drink.caloric" + consumptionData.drinkCaloric.charAt(0).toUpperCase() + consumptionData.drinkCaloric.slice(1);
                        chosenOptionsForChat.push(`Drink Caloric: ${game.i18n.localize(locKey) || consumptionData.drinkCaloric}`);
                    }
                } else {
                    if (consumptionData.caloricType) {
                        baseCalcHunger *= (calcSettings.CALORIC_MODIFIERS?.[consumptionData.caloricType] ?? 1.0);
                        const locKey = "SURVIVAL_NEEDS.choices.food." + consumptionData.caloricType.replace("Caloric", "").toLowerCase() + "Caloric";
                        chosenOptionsForChat.push(`Caloric Type: ${game.i18n.localize(locKey) || consumptionData.caloricType}`);
                    }
                }
                calculatedHungerReduction = Math.round(baseCalcHunger);
                if (consumptionData.taste) {
                    tempBoredomChange += (calcSettings.TASTE_BOREDOM?.[consumptionData.taste] ?? 0);
                    chosenOptionsForChat.push(`Taste: ${game.i18n.localize("SURVIVAL_NEEDS.choices.food." + consumptionData.taste) || consumptionData.taste}`);
                }
            }
            if (consumptionData.originalTrackerId === "thirst") {
                const effectivenessFactor = itemEffectiveBulk / STANDARD_DRINK_USE_EFFECTIVE_BULK;
                calculatedThirstReduction = Math.round(effectivenessFactor * BASE_THIRST_RESTORE_PER_STANDARD_USE);
                if (consumptionData.drinkQuality) {
                    tempStressChange += (calcSettings.DRINK_QUALITY_STRESS?.[consumptionData.drinkQuality] ?? 0);
                    chosenOptionsForChat.push(`Quality: ${game.i18n.localize("SURVIVAL_NEEDS.choices.drink." + consumptionData.drinkQuality) || consumptionData.drinkQuality}`);
                }
                if (consumptionData.isAlcoholic) {
                    tempStressChange += (calcSettings.ALCOHOLIC_EFFECTS?.stress ?? 0);
                    tempBoredomChange += (calcSettings.ALCOHOLIC_EFFECTS?.boredom ?? 0);
                    chosenOptionsForChat.push(game.i18n.localize("SURVIVAL_NEEDS.choices.drink.isAlcoholicShort"));
                }
                if (consumptionData.isPotion) {
                    tempStressChange += (calcSettings.POTION_EFFECTS?.stress ?? 0);
                    tempBoredomChange += (calcSettings.POTION_EFFECTS?.boredom ?? 0);
                    chosenOptionsForChat.push(game.i18n.localize("SURVIVAL_NEEDS.choices.drink.isPotionShort"));
                }
            }
        }

        if (calculatedHungerReduction > 0 && hungerTrackerConfig) {
            const current = actor.getFlag(MODULE_ID, "hunger") ?? hungerTrackerConfig.defaultValue ?? 0;
            const newValue = Math.clamped(current - calculatedHungerReduction, 0, hungerTrackerConfig.maxValue ?? 100);
            if (newValue !== current) updates[`${FLAG_PREFIX}.hunger`] = newValue;
            hungerActualReduction = current - newValue;
            if (hungerActualReduction > 0) {
                const iconHtml = `<i class="${hungerTrackerConfig.iconClass}" style="color:${hungerTrackerConfig.iconColor}; margin-right: 3px;"></i>`;
                effectsOnNeeds.push(`${iconHtml}Hunger reduced by ${hungerActualReduction} (to ${newValue}). ${newValue === 0 ? game.i18n.localize("SURVIVAL_NEEDS.chat.notHungryAnymore") : game.i18n.localize("SURVIVAL_NEEDS.chat.stillHungry")}`);
                calculatedPoopIncrease = Math.round(hungerActualReduction * (calcSettings.HUNGER_TO_POOP_MULTIPLIER ?? 6.0));
            }
        }

        if (calculatedThirstReduction > 0 && thirstTrackerConfig) {
            const current = actor.getFlag(MODULE_ID, "thirst") ?? thirstTrackerConfig.defaultValue ?? 0;
            const newValue = Math.clamped(current - calculatedThirstReduction, 0, thirstTrackerConfig.maxValue ?? 100);
            if (newValue !== current) updates[`${FLAG_PREFIX}.thirst`] = newValue;
            thirstActualReduction = current - newValue;
            if (thirstActualReduction > 0) {
                const iconHtml = `<i class="${thirstTrackerConfig.iconClass}" style="color:${thirstTrackerConfig.iconColor}; margin-right: 3px;"></i>`;
                effectsOnNeeds.push(`${iconHtml}Thirst reduced by ${thirstActualReduction} (to ${newValue}). ${newValue === 0 ? game.i18n.localize("SURVIVAL_NEEDS.chat.notThirstyAnymore") : game.i18n.localize("SURVIVAL_NEEDS.chat.stillThirsty")}`);
                calculatedPissIncrease = Math.round(thirstActualReduction * (calcSettings.THIRST_TO_PISS_MULTIPLIER ?? 2.0));
            }
        }

        if (calculatedPissIncrease > 0 && pissTrackerConfig) {
            const currentPiss = actor.getFlag(MODULE_ID, "piss") ?? pissTrackerConfig.defaultValue ?? 0;
            const newPiss = Math.clamped(currentPiss + calculatedPissIncrease, 0, pissTrackerConfig.maxValue ?? 100);
            if (newPiss !== currentPiss) updates[`${FLAG_PREFIX}.piss`] = newPiss;
            actualPissIncrease = newPiss - currentPiss;
            if (actualPissIncrease > 0) effectsOnNeeds.push(`<i class="${pissTrackerConfig.iconClass}" style="color:${pissTrackerConfig.iconColor}; margin-right: 3px;"></i>Bladder filled by ${actualPissIncrease} (to ${newPiss}).`);
        }

        if (calculatedPoopIncrease > 0 && poopTrackerConfig) {
            const currentPoop = actor.getFlag(MODULE_ID, "poop") ?? poopTrackerConfig.defaultValue ?? 0;
            const newPoop = Math.clamped(currentPoop + calculatedPoopIncrease, 0, poopTrackerConfig.maxValue ?? 100);
            if (newPoop !== currentPoop) updates[`${FLAG_PREFIX}.poop`] = newPoop;
            actualPoopIncrease = newPoop - currentPoop;
            if (actualPoopIncrease > 0) effectsOnNeeds.push(`<i class="${poopTrackerConfig.iconClass}" style="color:${poopTrackerConfig.iconColor}; margin-right: 3px;"></i>Bowels filled by ${actualPoopIncrease} (to ${newPoop}).`);
        }

        if (tempBoredomChange !== 0 && boredomTrackerConfig) {
            const current = actor.getFlag(MODULE_ID, "boredom") ?? boredomTrackerConfig.defaultValue ?? 0;
            const newValue = Math.clamped(current + tempBoredomChange, 0, boredomTrackerConfig.maxValue ?? 100);
            if (newValue !== current) updates[`${FLAG_PREFIX}.boredom`] = newValue;
            boredomChangeFinal = newValue - current;
            if (boredomChangeFinal !== 0) {
                const verb = boredomChangeFinal < 0 ? "reduced" : "increased";
                effectsOnNeeds.push(`<i class="${boredomTrackerConfig.iconClass}" style="color:${boredomTrackerConfig.iconColor}; margin-right: 3px;"></i>Boredom ${verb} by ${Math.abs(boredomChangeFinal)} (to ${newValue}).`);
            }
        }

        if (tempStressChange !== 0 && stressTrackerConfig) {
            const current = actor.getFlag(MODULE_ID, "stress") ?? stressTrackerConfig.defaultValue ?? 0;
            const newValue = Math.clamped(current + tempStressChange, 0, stressTrackerConfig.maxValue ?? 100);
            if (newValue !== current) updates[`${FLAG_PREFIX}.stress`] = newValue;
            stressChangeFinal = newValue - current;
            if (stressChangeFinal !== 0) {
                const verb = stressChangeFinal < 0 ? "reduced" : "increased";
                effectsOnNeeds.push(`<i class="${stressTrackerConfig.iconClass}" style="color:${stressTrackerConfig.iconColor}; margin-right: 3px;"></i>Stress ${verb} by ${Math.abs(stressChangeFinal)} (to ${newValue}).`);
            }
        }

        if (effectsOnNeeds.length > 0) {
            chatMessageParts.push(`<ul>${effectsOnNeeds.map(e => `<li>${e}</li>`).join('')}</ul>`);
        } else {
            chatMessageParts.push(`<p>No significant change in needs from this consumption.</p>`);
        }

        if (chosenOptionsForChat.length > 0) {
            chatMessageParts.push(`<hr style="border-top: 1px dashed #ccc; margin: 0.5em 0;"><em>Item Properties/Choices: ${chosenOptionsForChat.join(', ')}</em>`);
        }
        chatMessageParts.push(`</div>`);


        if (Object.keys(updates).length > 0) {
            await actor.update(updates);
        }

        const currentNeedsAfterUpdate = this.getActorNeeds(actor);
        await this.conditionManagerV2.processActorNeedsAndEffects(actor, currentNeedsAfterUpdate, this.trackerConfigs);

        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: actor }),
            content: chatMessageParts.join("<br>")
        });
        console.log(`${logPrefix} Detailed consumption processing complete.`, detailStyle);
    }

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
                    ui.notifications.info(game.i18n.format("PF2E.RestNotification", { actor: actor.name }));

                    await game.pf2e.actions.restForTheNight({ actors: [actor] });

                    console.log(`${logPrefix} game.pf2e.actions.restForTheNight() called for ${actor.name}.`, detailStyle);
                } catch (err) {
                    console.error(`${logPrefix} Error calling game.pf2e.actions.restForTheNight():`, errorStyle, err);
                    ui.notifications.error(`Failed to initiate long rest for ${actor.name}. See console.`);
                }
            } else {
                console.warn(`${logPrefix} 'triggersLongRest' used for non-character actor type '${actor.type}'. Standard long rest via system action may not apply or behave as expected.`, warningStyle);
            }

        } else if (choiceConfig.reducesBy !== undefined) {
            const currentSleepDep = actor.getFlag(MODULE_ID, "sleep") ?? 0;
            const reduction = choiceConfig.reducesBy ?? 0;
            const newSleepDep = Math.max(0, currentSleepDep - reduction);
            console.log(`${logPrefix} Choice '${choiceConfig.id}' reduces sleep dep by ${reduction} from ${currentSleepDep} to ${newSleepDep}.`, detailStyle);
            await this.updateNeedValue(actor, "sleep", newSleepDep, { forceEffectUpdate: true });
            ui.notifications.info(`${actor.name} feels more rested after their ${choiceConfig.label.toLowerCase()}.`);
        } else {
            console.warn(`${logPrefix} Sleep choice '${choiceConfig.id}' has no 'triggersLongRest' or 'reducesBy'. No specific rest action taken.`, warningStyle);
        }
    }
}