// File: scripts/actor-needs.js
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

        const logPrefix = `%c[${MODULE_ID} | NeedsManager]`;
        const constructorStyle = "color: dodgerblue; font-weight:bold;";
        // console.log(`${logPrefix} Constructed. Version: DF_MaxFix_Interval`, constructorStyle);
        
        this.loadAllConfigs();
    }

    loadAllConfigs() {
        // ... (loadAllConfigs content remains the same) ...
        const logPrefix = `%c[${MODULE_ID} | NeedsManager | loadAllConfigs_V1.7_DF_MaxFix]`;
        const detailStyle = "color: mediumblue;";
        const errorStyle = "color: red; font-weight: bold;";
        const warningStyle = "color: orange;";

        this.trackerConfigs = []; 
        this.consumptionCalcSettings = {};
        this.interTrackerLinks = new Map();

        let rawTrackersFromSettings;
        try {
            rawTrackersFromSettings = getTrackerConfigs(); 
        } catch (e) {
            console.error(`${logPrefix} ERROR calling getTrackerConfigs():`, errorStyle, e);
            rawTrackersFromSettings = null;
        }

        if (rawTrackersFromSettings && Array.isArray(rawTrackersFromSettings)) {
            this.trackerConfigs = rawTrackersFromSettings.filter(tc => tc.enabled === true);
        } else {
            console.warn(`${logPrefix} getTrackerConfigs() did not return valid array. Falling back to DEFAULT_TRACKER_CONFIGS (filtered).`, warningStyle);
            if (typeof DEFAULT_TRACKER_CONFIGS !== "undefined" && Array.isArray(DEFAULT_TRACKER_CONFIGS)) {
                this.trackerConfigs = foundry.utils.deepClone(DEFAULT_TRACKER_CONFIGS).filter(tc => tc.enabled === true);
            } else {
                console.error(`${logPrefix} CRITICAL: DEFAULT_TRACKER_CONFIGS not available for fallback!`, errorStyle);
                this.trackerConfigs = [];
            }
        }
            
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
            console.warn(`${logPrefix} getConsumptionCalcSettings() invalid. Falling back to DEFAULT_CONSUMPTION_CALC_SETTINGS.`, warningStyle);
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
        
        for (const tracker of this.trackerConfigs) {
            const flagValue = actor.getFlag(MODULE_ID, tracker.id);

            if (tracker.subProperties && Array.isArray(tracker.subProperties)) {
                needs[tracker.id] = {
                    value: flagValue?.value ?? tracker.defaultValue ?? 0
                };
                tracker.subProperties.forEach(subProp => {
                    needs[tracker.id][subProp.id] = flagValue?.[subProp.id] ?? subProp.defaultValue ?? 0;
                });

                if (tracker.isDynamicMax && tracker.id === "divineFavor") {
                    const shrines = needs[tracker.id].shrines ?? 0; // Default to 0 if undefined
                    const followers = needs[tracker.id].followers ?? 0; // Default to 0
                    let calcMax = tracker.defaultMaxValue ?? 3;
                    
                    // Check if shrinesPerExtraPoint is a positive number before dividing
                    if (tracker.shrinesPerExtraPoint && tracker.shrinesPerExtraPoint > 0) {
                        calcMax += Math.floor(shrines / tracker.shrinesPerExtraPoint);
                    }
                    // Check if followersPerMaxPoint is a positive number
                    if (tracker.followersPerMaxPoint && tracker.followersPerMaxPoint > 0) {
                        calcMax += Math.floor(followers / tracker.followersPerMaxPoint);
                    }
                    needs[tracker.id].calculatedMaxValue = calcMax;
                } else if (tracker.isDynamicMax) {
                    needs[tracker.id].calculatedMaxValue = tracker.maxValue ?? 100;
                }

            } else {
                needs[tracker.id] = flagValue ?? tracker.defaultValue ?? 0;
            }
        }
        return needs;
    }

    // ... (needsInitialization, getInitializationFlags remain the same) ...
    needsInitialization(actor) {
        if (!actor) return false;
        for (const tracker of this.trackerConfigs) {
            if (actor.getFlag(MODULE_ID, tracker.id) === undefined) return true;
        }
        return actor.getFlag(MODULE_ID, LAST_UPDATE_TIME_FLAG_KEY) === undefined;
    }

    getInitializationFlags() {
        const updates = {};
        for (const tracker of this.trackerConfigs) {
            if (tracker.subProperties && Array.isArray(tracker.subProperties)) {
                const initialTrackerObject = { value: tracker.defaultValue ?? 0 };
                tracker.subProperties.forEach(sp => {
                    initialTrackerObject[sp.id] = sp.defaultValue ?? 0;
                });
                updates[`${FLAG_PREFIX}.${tracker.id}`] = initialTrackerObject;
            } else {
                updates[`${FLAG_PREFIX}.${tracker.id}`] = tracker.defaultValue ?? 0;
            }
        }
        updates[`${FLAG_PREFIX}.${LAST_UPDATE_TIME_FLAG_KEY}`] = game.time.worldTime;
        return updates;
    }


    async initializeNeedsForActor(actor) {
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
        if (!game.user.isGM) return;
        this.loadAllConfigs();

        const updateIntervalHours = game.settings.get(MODULE_ID, SETTINGS.UPDATE_INTERVAL_HOURS);
        const updateIntervalSeconds = updateIntervalHours * 3600;

        if (updateIntervalSeconds <= 0 || this.trackerConfigs.length === 0) return;

        const affectsNPCs = game.settings.get(MODULE_ID, SETTINGS.AFFECTS_NPCS);
        const logPrefix = `%c[${MODULE_ID} | NeedsManager | UpdateWorldTime_DFix]`;
        const errorStyle = "color: red; font-weight:bold;";
        const detailStyle = "color:cornflowerblue;";


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
                    let effectiveIncreasePerInterval = 0; // Start with 0
                    const currentFlagForTime = actor.getFlag(MODULE_ID, tracker.id);

                    // Handle base increase for all trackers that might have it
                    if (typeof tracker.baseIncreasePerInterval === 'number') {
                        effectiveIncreasePerInterval += tracker.baseIncreasePerInterval;
                    }

                    // Handle shrine-specific increase for Divine Favor
                    if (tracker.id === "divineFavor" && tracker.subProperties && Array.isArray(tracker.subProperties)) {
                        const shrines = currentFlagForTime?.shrines ?? (tracker.subProperties.find(sp => sp.id === 'shrines')?.defaultValue ?? 0);
                        const increasePerShrine = typeof tracker.increasePerShrinePerInterval === 'number' ? tracker.increasePerShrinePerInterval : 0;
                        if (shrines > 0) {
                            effectiveIncreasePerInterval += (increasePerShrine * shrines);
                        }
                    } 
                    // For other trackers, if they don't have baseIncreasePerInterval, use the old increasePerInterval
                    else if (typeof tracker.increasePerInterval === 'number' && !tracker.baseIncreasePerInterval && tracker.id !== "divineFavor") {
                        effectiveIncreasePerInterval += tracker.increasePerInterval;
                    }


                    if (effectiveIncreasePerInterval === 0 && !(tracker.id === "divineFavor" && tracker.baseIncreasePerInterval > 0) ) { // If DF has base, it might still run
                        // Special check for divine favor: if it has a baseIncrease even with 0 shrines, it should run.
                        // Otherwise, if total effective is 0, skip.
                        if(!(tracker.id === "divineFavor" && (tracker.baseIncreasePerInterval ?? 0) > 0 && effectiveIncreasePerInterval === (tracker.baseIncreasePerInterval ?? 0) )) {
                           // console.log(`${logPrefix} Skipping ${tracker.id} for ${actor.name}, effectiveIncrease is 0.`);
                           continue;
                        }
                    }


                    let currentValue;
                    let flagPathForTimeUpdate;
                    let maxValueForTimeUpdate = tracker.maxValue ?? 100;

                    if (tracker.subProperties && Array.isArray(tracker.subProperties)) {
                        currentValue = currentFlagForTime?.value ?? tracker.defaultValue ?? 0;
                        flagPathForTimeUpdate = `${FLAG_PREFIX}.${tracker.id}.value`;
                        if (tracker.isDynamicMax) {
                            const shrinesVal = currentFlagForTime?.shrines ?? 0;
                            const followersVal = currentFlagForTime?.followers ?? 0;
                            let calcMax = tracker.defaultMaxValue ?? 3;
                            if (tracker.shrinesPerExtraPoint && tracker.shrinesPerExtraPoint > 0) {
                                calcMax += Math.floor(shrinesVal / tracker.shrinesPerExtraPoint);
                            }
                            if (tracker.followersPerMaxPoint && tracker.followersPerMaxPoint > 0) {
                                calcMax += Math.floor(followersVal / tracker.followersPerMaxPoint);
                            }
                            maxValueForTimeUpdate = calcMax;
                        } else {
                           maxValueForTimeUpdate = tracker.maxValue ?? 100;
                        }
                    } else {
                        currentValue = currentFlagForTime ?? tracker.defaultValue ?? 0;
                        flagPathForTimeUpdate = `${FLAG_PREFIX}.${tracker.id}`;
                    }

                    const changeDueToTime = effectiveIncreasePerInterval * intervalsPassed;
                    if (changeDueToTime === 0) continue; // If after all calcs, it's still 0.

                    let newValue = currentValue + changeDueToTime;
                    newValue = Math.clamped(newValue, 0, maxValueForTimeUpdate);
                    
                    // console.log(`${logPrefix} Actor: ${actor.name}, Tracker: ${tracker.id}, Current: ${currentValue}, ChangeDueToTime: ${changeDueToTime.toFixed(3)}, New(raw): ${(currentValue + changeDueToTime).toFixed(3)}, New(clamped): ${newValue.toFixed(3)}, Max: ${maxValueForTimeUpdate}, EffectiveIntervalIncrease: ${effectiveIncreasePerInterval.toFixed(3)}`);


                    if (newValue !== currentValue) {
                        actorFlagUpdates[flagPathForTimeUpdate] = newValue;
                        needsActuallyChangedByTime = true;
                    }
                }

                if (needsActuallyChangedByTime) {
                    actorFlagUpdates[`${FLAG_PREFIX}.${LAST_UPDATE_TIME_FLAG_KEY}`] = lastUpdate + (intervalsPassed * updateIntervalSeconds);
                    try {
                        await actor.update(actorFlagUpdates);
                        const cN = this.getActorNeeds(actor);
                        await this.conditionManagerV2.processActorNeedsAndEffects(actor, cN, this.trackerConfigs);
                    } catch (e) {
                        console.error(`${logPrefix} Error updating actor ${actor.name} during world time update:`, errorStyle, e);
                    }
                } else if (actor.getFlag(MODULE_ID, LAST_UPDATE_TIME_FLAG_KEY) !== lastUpdate + (intervalsPassed * updateIntervalSeconds)) {
                     await actor.update({[`${FLAG_PREFIX}.${LAST_UPDATE_TIME_FLAG_KEY}`]: lastUpdate + (intervalsPassed * updateIntervalSeconds)});
                }
            }
        }
    }
    
    async processLongRest(actor) {
        // ... (processLongRest content, ensuring dynamic max for divineFavor is checked if it regenerates on long rest) ...
        if (!actor) return;
        this.loadAllConfigs(); 

        const actorFlagUpdates = {};
        let needsAffectedByRest = false;

        for (const tracker of this.trackerConfigs) {
            if (tracker.regeneration?.byLongRest) {
                let currentValue;
                let flagPathForRestUpdate;
                let maxValueForRest = tracker.maxValue ?? 100;
                const currentFlagForRest = actor.getFlag(MODULE_ID, tracker.id);

                if (tracker.subProperties && Array.isArray(tracker.subProperties)) {
                    currentValue = currentFlagForRest?.value ?? tracker.defaultValue ?? 0;
                    flagPathForRestUpdate = `${FLAG_PREFIX}.${tracker.id}.value`;
                    if (tracker.isDynamicMax) {
                         const shrines = currentFlagForRest?.shrines ?? 0;
                         const followers = currentFlagForRest?.followers ?? 0;
                         let calcMax = tracker.defaultMaxValue ?? 3;
                         if (tracker.id === "divineFavor" && tracker.shrinesPerExtraPoint && tracker.shrinesPerExtraPoint > 0) {
                             calcMax += Math.floor(shrines / tracker.shrinesPerExtraPoint);
                         }
                         if (tracker.id === "divineFavor" && tracker.followersPerMaxPoint && tracker.followersPerMaxPoint > 0) {
                             calcMax += Math.floor(followers / tracker.followersPerMaxPoint);
                         }
                         maxValueForRest = calcMax;
                    } else {
                        maxValueForRest = tracker.maxValue ?? 100;
                    }
                } else {
                    currentValue = currentFlagForRest ?? tracker.defaultValue ?? 0;
                    flagPathForRestUpdate = `${FLAG_PREFIX}.${tracker.id}`;
                }
                
                const reduction = tracker.regeneration.longRestAmount ?? 0;
                if (reduction === 0) continue;

                const newValue = Math.clamped(currentValue - reduction, 0, maxValueForRest);
                if (newValue !== currentValue) {
                    actorFlagUpdates[flagPathForRestUpdate] = newValue;
                    needsAffectedByRest = true;
                }
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

    async updateNeedValue(actor, trackerId, newTrackerValueStr, options = {}) {
        // ... (updateNeedValue content, with existing dynamic max calculation for divineFavor being crucial) ...
        const logPrefix = `%c[${MODULE_ID} | NeedsManager | updateNeedValue | ${actor?.name || 'UnknownActor'}]`;
        const detailStyle = "color: dodgerblue; font-weight: bold;";
        const errorStyle = "color: red; font-weight: bold;";
        const warningStyle = "color: orange;";

        if (!actor || !trackerId) {
            console.warn(`${logPrefix} Actor or trackerId missing. Aborting.`, warningStyle);
            return;
        }
        this.loadAllConfigs(); 

        const mainTracker = this.trackerConfigs.find(t => t.id === trackerId);
        if (!mainTracker) {
            console.warn(`${logPrefix} Tracker config for ID '${trackerId}' not found. Aborting.`, warningStyle);
            return;
        }

        let currentMainValue;
        let actualMaxValue = mainTracker.maxValue ?? 100;
        const flagPathForUpdate = mainTracker.subProperties ? `${FLAG_PREFIX}.${mainTracker.id}.value` : `${FLAG_PREFIX}.${mainTracker.id}`;
        
        const currentFlagObject = actor.getFlag(MODULE_ID, mainTracker.id);

        if (mainTracker.subProperties && Array.isArray(mainTracker.subProperties)) {
            currentMainValue = currentFlagObject?.value ?? mainTracker.defaultValue ?? 0;
            if (mainTracker.isDynamicMax) {
                const shrines = currentFlagObject?.shrines ?? 0;
                const followers = currentFlagObject?.followers ?? 0;
                let calcMax = mainTracker.defaultMaxValue ?? 3;
                if (trackerId === "divineFavor" && mainTracker.shrinesPerExtraPoint && mainTracker.shrinesPerExtraPoint > 0) {
                    calcMax += Math.floor(shrines / mainTracker.shrinesPerExtraPoint);
                }
                if (trackerId === "divineFavor" && mainTracker.followersPerMaxPoint && mainTracker.followersPerMaxPoint > 0) {
                    calcMax += Math.floor(followers / mainTracker.followersPerMaxPoint);
                }
                actualMaxValue = calcMax;
            } else {
                actualMaxValue = mainTracker.maxValue ?? 100;
            }
        } else {
            currentMainValue = currentFlagObject ?? mainTracker.defaultValue ?? 0;
        }
        
        const newTrackerValueNum = Number(newTrackerValueStr);
        if (isNaN(newTrackerValueNum)) {
            console.warn(`${logPrefix} newTrackerValueStr "${newTrackerValueStr}" is not a valid number. Aborting.`, warningStyle);
            return;
        }

        const clampedNewMainValue = Math.clamped(newTrackerValueNum, 0, actualMaxValue);

        const updates = {};
        let needsChanged = false;

        if (clampedNewMainValue !== currentMainValue) {
            updates[flagPathForUpdate] = clampedNewMainValue;
            needsChanged = true;
            
            if (clampedNewMainValue < currentMainValue && options.triggeredByConsumption) {
                // ... (inter-tracker logic remains same) ...
                const amountDecreased = currentMainValue - clampedNewMainValue;
                this.interTrackerLinks.forEach((linkConfig, targetTrId) => {
                    if (linkConfig.sourceTrackerId === mainTracker.id) {
                        const linkedTCfg = this.trackerConfigs.find(t => t.id === targetTrId);
                        if (linkedTCfg) {
                            const currentLinkedVal = actor.getFlag(MODULE_ID, targetTrId) ?? linkedTCfg.defaultValue ?? 0;
                            const increaseAmount = Math.round(amountDecreased * (linkConfig.percentage / 100));
                            const newLinkedVal = Math.clamped(currentLinkedVal + increaseAmount, 0, linkedTCfg.maxValue ?? 100);
                            if (newLinkedVal !== currentLinkedVal) {
                                updates[`${FLAG_PREFIX}.${targetTrId}`] = newLinkedVal;
                            }
                        }
                    }
                });
            }
        }

        if (Object.keys(updates).length > 0 || (options.forceEffectUpdate && !needsChanged)) {
            await actor.update(updates);
            const cN = this.getActorNeeds(actor);
            await this.conditionManagerV2.processActorNeedsAndEffects(actor, cN, this.trackerConfigs);
        }
    }

    // ... (processDetailedConsumption, relieveWaste, dryOff, relieveBoredomOrStress, handleRestChoice methods remain largely the same) ...
    async processDetailedConsumption(actor, consumptionData) {
        // ... (content remains the same)
        const logPrefix = `%c[${MODULE_ID} | NeedsManager | processDetailedConsumption | ${actor.name} | V1.9_ComplexAwarePre]`;
        const detailStyle = "color: teal;";

        this.loadAllConfigs(); 

        const calcSettings = this.consumptionCalcSettings;
        const hungerTrackerConfig = this.trackerConfigs.find(t => t.id === "hunger");
        const thirstTrackerConfig = this.trackerConfigs.find(t => t.id === "thirst");
        const pissTrackerConfig = this.trackerConfigs.find(t => t.id === "piss");
        const poopTrackerConfig = this.trackerConfigs.find(t => t.id === "poop");
        const boredomTrackerConfig = this.trackerConfigs.find(t => t.id === "boredom");
        const stressTrackerConfig = this.trackerConfigs.find(t => t.id === "stress");

        const BASE_HUNGER_RESTORE_PER_STANDARD_USE = calcSettings.DEFAULT_HUNGER_RESTORE_PER_STANDARD_USE ?? (hungerTrackerConfig?.regeneration?.itemRestoreAmount || 3.33);
        const BASE_THIRST_RESTORE_PER_STANDARD_USE = calcSettings.DEFAULT_THIRST_RESTORE_PER_STANDARD_USE ?? (thirstTrackerConfig?.regeneration?.itemRestoreAmount || 20);
        const STANDARD_FOOD_USE_EFFECTIVE_BULK = calcSettings.STANDARD_FOOD_USE_EFFECTIVE_BULK || 0.02;
        const STANDARD_DRINK_USE_EFFECTIVE_BULK = calcSettings.STANDARD_DRINK_USE_EFFECTIVE_BULK || 0.02;

        let hungerActualReduction = 0;
        let thirstActualReduction = 0;
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

        const actorCurrentNeeds = this.getActorNeeds(actor);

        if (calculatedHungerReduction > 0 && hungerTrackerConfig) {
            const current = actorCurrentNeeds.hunger; 
            const newValue = Math.clamped(current - calculatedHungerReduction, 0, hungerTrackerConfig.maxValue ?? 100);
            if (newValue !== current) updates[`${FLAG_PREFIX}.hunger`] = newValue;
            hungerActualReduction = current - newValue;
            if (hungerActualReduction > 0) {
                effectsOnNeeds.push(`<i class="${hungerTrackerConfig.iconClass}" style="color:${hungerTrackerConfig.iconColor};"></i> Hunger -${hungerActualReduction} (to ${newValue}).`);
                calculatedPoopIncrease = Math.round(hungerActualReduction * (calcSettings.HUNGER_TO_POOP_MULTIPLIER ?? 6.0));
            }
        }

        if (calculatedThirstReduction > 0 && thirstTrackerConfig) {
            const current = actorCurrentNeeds.thirst; 
            const newValue = Math.clamped(current - calculatedThirstReduction, 0, thirstTrackerConfig.maxValue ?? 100);
            if (newValue !== current) updates[`${FLAG_PREFIX}.thirst`] = newValue;
            thirstActualReduction = current - newValue;
            if (thirstActualReduction > 0) {
                effectsOnNeeds.push(`<i class="${thirstTrackerConfig.iconClass}" style="color:${thirstTrackerConfig.iconColor};"></i> Thirst -${thirstActualReduction} (to ${newValue}).`);
                calculatedPissIncrease = Math.round(thirstActualReduction * (calcSettings.THIRST_TO_PISS_MULTIPLIER ?? 2.0));
            }
        }
        let actualPissIncrease = 0;
        let actualPoopIncrease = 0;
        let boredomChangeFinal = 0;
        let stressChangeFinal = 0;

        if (calculatedPissIncrease > 0 && pissTrackerConfig) {
            const currentPiss = actorCurrentNeeds.piss;
            const newPiss = Math.clamped(currentPiss + calculatedPissIncrease, 0, pissTrackerConfig.maxValue ?? 100);
            if (newPiss !== currentPiss) updates[`${FLAG_PREFIX}.piss`] = newPiss;
            actualPissIncrease = newPiss - currentPiss;
            if(actualPissIncrease > 0) effectsOnNeeds.push(`<i class="${pissTrackerConfig.iconClass}" style="color:${pissTrackerConfig.iconColor};"></i> Bladder +${actualPissIncrease} (to ${newPiss}).`);
        }

        if (calculatedPoopIncrease > 0 && poopTrackerConfig) {
            const currentPoop = actorCurrentNeeds.poop;
            const newPoop = Math.clamped(currentPoop + calculatedPoopIncrease, 0, poopTrackerConfig.maxValue ?? 100);
            if (newPoop !== currentPoop) updates[`${FLAG_PREFIX}.poop`] = newPoop;
            actualPoopIncrease = newPoop - currentPoop;
            if(actualPoopIncrease > 0) effectsOnNeeds.push(`<i class="${poopTrackerConfig.iconClass}" style="color:${poopTrackerConfig.iconColor};"></i> Bowels +${actualPoopIncrease} (to ${newPoop}).`);
        }

        if (tempBoredomChange !== 0 && boredomTrackerConfig) {
            const current = actorCurrentNeeds.boredom;
            const newValue = Math.clamped(current + tempBoredomChange, 0, boredomTrackerConfig.maxValue ?? 100);
            if (newValue !== current) updates[`${FLAG_PREFIX}.boredom`] = newValue;
            boredomChangeFinal = newValue - current;
            if(boredomChangeFinal !== 0) effectsOnNeeds.push(`<i class="${boredomTrackerConfig.iconClass}" style="color:${boredomTrackerConfig.iconColor};"></i> Boredom ${boredomChangeFinal > 0 ? '+' : ''}${boredomChangeFinal} (to ${newValue}).`);
        }

        if (tempStressChange !== 0 && stressTrackerConfig) {
            const current = actorCurrentNeeds.stress;
            const newValue = Math.clamped(current + tempStressChange, 0, stressTrackerConfig.maxValue ?? 100);
            if (newValue !== current) updates[`${FLAG_PREFIX}.stress`] = newValue;
            stressChangeFinal = newValue - current;
            if(stressChangeFinal !== 0) effectsOnNeeds.push(`<i class="${stressTrackerConfig.iconClass}" style="color:${stressTrackerConfig.iconColor};"></i> Stress ${stressChangeFinal > 0 ? '+' : ''}${stressChangeFinal} (to ${newValue}).`);
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
            content: chatMessageParts.join("") 
        });
    }

    async relieveWaste(actor, trackerId, actionConfig) { 
        if (!actor || !trackerId || !actionConfig) return;
        const message = actionConfig.chatMessage?.replace("{actorName}", actor.name) +
            (actionConfig.timeMinutes ? ` (Takes ${actionConfig.timeMinutes} minutes).` : "");
        if (message) ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: message });
        
        await this.updateNeedValue(actor, trackerId, (actionConfig.reducesTo ?? 0).toString(), { forceEffectUpdate: true });
        ui.notifications.info(`${actor.name} feels relieved.`);
    }
    
    async dryOff(actor, actionConfig) { 
        if (!actor || !actionConfig) return;
        const message = actionConfig.chatMessage?.replace("{actorName}", actor.name) +
            (actionConfig.timeMinutes ? ` (Takes ${actionConfig.timeMinutes} minutes).` : "");
        if (message) ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: message });
        
        await this.updateNeedValue(actor, "wetness", (actionConfig.reducesTo ?? 0).toString(), { forceEffectUpdate: true });
        ui.notifications.info(`${actor.name} is now dry.`);
    }

    async relieveBoredomOrStress(actor, trackerId, choiceConfig) {
        if (!actor || !trackerId || !choiceConfig) return;
        this.loadAllConfigs(); 

        const tracker = this.trackerConfigs.find(t => t.id === trackerId);
        if (!tracker) return;

        const currentTrackerValue = actor.getFlag(MODULE_ID, trackerId) ?? tracker.defaultValue ?? 0;
        const reduction = choiceConfig.reducesBy ?? 0;
        const newValue = Math.clamped(currentTrackerValue - reduction, 0, tracker.maxValue ?? 100);

        const message = choiceConfig.chatMessage?.replace("{actorName}", actor.name) +
            (actionConfig.timeMinutes ? ` (Takes ${choiceConfig.timeMinutes} minutes).` : "");
        if (message) ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: message });

        await this.updateNeedValue(actor, trackerId, newValue.toString(), { forceEffectUpdate: true });

        if (typeof choiceConfig.stressChange === 'number' && choiceConfig.stressChange !== 0) {
            const stressTracker = this.trackerConfigs.find(t => t.id === "stress");
            if (stressTracker) {
                const currentStress = actor.getFlag(MODULE_ID, "stress") ?? stressTracker.defaultValue ?? 0;
                const newStress = Math.clamped(currentStress + choiceConfig.stressChange, 0, stressTracker.maxValue ?? 100);
                await this.updateNeedValue(actor, "stress", newStress.toString(), { forceEffectUpdate: false });
            }
        }
        if (typeof choiceConfig.boredomChange === 'number' && choiceConfig.boredomChange !== 0) {
            const boredomTracker = this.trackerConfigs.find(t => t.id === "boredom");
            if (boredomTracker) {
                const currentBoredom = actor.getFlag(MODULE_ID, "boredom") ?? boredomTracker.defaultValue ?? 0;
                const newBoredom = Math.clamped(currentBoredom + choiceConfig.boredomChange, 0, boredomTracker.maxValue ?? 100);
                await this.updateNeedValue(actor, "boredom", newBoredom.toString(), { forceEffectUpdate: false });
            }
        }
        
        ui.notifications.info(`${actor.name} feels less ${trackerId}.`);
    }

    async handleRestChoice(actor, trackerId, choiceConfig) {
        if (!actor || trackerId !== "sleep" || !choiceConfig) {
            console.warn(`%c[${MODULE_ID}] NeedsManager: Invalid call to handleRestChoice.`, "color:orange;");
            return;
        }
        this.loadAllConfigs(); 

        const sleepTracker = this.trackerConfigs.find(t => t.id === "sleep");
        if (!sleepTracker) return;

        const logPrefix = `%c[${MODULE_ID}] NeedsManager | handleRestChoice | ${actor.name}]`;
        const detailStyle = "color: mediumpurple;";
        const errorStyle = "color: red; font-weight:bold;";

        const timeString = choiceConfig.timeMinutes ? ` (Takes ${choiceConfig.timeMinutes} minutes).` : "";
        const messageContent = choiceConfig.chatMessage?.replace("{actorName}", actor.name) + timeString;
        if (choiceConfig.chatMessage) {
            ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: messageContent });
        }

        if (choiceConfig.triggersLongRest) {
            if (actor.type === 'character') {
                try {
                    ui.notifications.info(game.i18n.format("PF2E.RestNotification", { actor: actor.name }));
                    await game.pf2e.actions.restForTheNight({ actors: [actor] });
                } catch (err) {
                    console.error(`${logPrefix} Error calling game.pf2e.actions.restForTheNight():`, errorStyle, err);
                    ui.notifications.error(`Failed to initiate long rest for ${actor.name}. See console.`);
                }
            }
        } else if (choiceConfig.reducesBy !== undefined) {
            const currentSleepDep = actor.getFlag(MODULE_ID, "sleep") ?? sleepTracker.defaultValue ?? 0;
            const reduction = choiceConfig.reducesBy ?? 0;
            const newSleepDep = Math.clamped(currentSleepDep - reduction, 0, sleepTracker.maxValue ?? 100);
            
            await this.updateNeedValue(actor, "sleep", newSleepDep.toString(), { forceEffectUpdate: true });
            ui.notifications.info(`${actor.name} feels more rested after their ${choiceConfig.label.toLowerCase()}.`);
        }
    }
}