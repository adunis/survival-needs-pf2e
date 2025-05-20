// File: scripts/condition-manager-v2.js (Create this new file)
import { 
    MODULE_ID, 
    DYNAMIC_EFFECT_FLAG_MODULE_MANAGED, 
    DYNAMIC_EFFECT_FLAG_SOURCE_TRACKER_ID,
    DYNAMIC_EFFECT_FLAG_THRESHOLD_NAME 
} from "./constants.js";

export class ConditionManagerV2 {
    constructor() {
        const logPrefix = `%c[${MODULE_ID}]`;
        const constructorStyle = "color: mediumorchid; font-weight:bold;";
        console.log(`${logPrefix} ConditionManagerV2: Constructed. Manages dynamic parent effects.`, constructorStyle);
    }

    /**
     * Generates a unique slug for a dynamic parent effect based on tracker and threshold.
     * @param {string} trackerId - The ID of the tracker (e.g., "hunger").
     * @param {string} thresholdName - The descriptive name of the threshold (e.g., "Peckish").
     * @returns {string} A unique slug (e.g., "sn-hunger-peckish").
     */
    _generateEffectSlug(trackerId, thresholdName) {
        const safeTrackerId = trackerId.replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase();
        const safeThresholdName = thresholdName.replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase();
        return `sn-${safeTrackerId}-${safeThresholdName}`;
    }

    /**
     * Dynamically constructs the ItemData for a Parent Effect.
     * @param {string} trackerId - ID of the source tracker.
     * @param {string} trackerName - Display name of the source tracker.
     * @param {object} thresholdConfig - The configuration object for the current threshold 
     *                                   (e.g., { threshold: 40, name: "Peckish", symptoms: [...] }).
     * @returns {object} ItemData for the effect to be created on the actor.
     */


 _buildDynamicEffectData(trackerId, trackerName, thresholdConfig, actorNameForLog = 'UnknownActor') {
        const effectSlug = this._generateEffectSlug(trackerId, thresholdConfig.name);
        const effectName = `${trackerName}: ${thresholdConfig.name}`; 
        const logPrefixFunc = (level) => `%c[${MODULE_ID} | _buildDynamicEffectData | ${actorNameForLog} | Effect: ${effectName}]`;
        
        const detailStyle = "color: #006400;";
        const warningStyle = "color: orange; font-weight: bold;";
        const errorStyle = "color: red; font-weight: bold;";
        const debugStyle = "color: blue;";

        // console.log(logPrefixFunc("DEBUG") + ` Building data. ThresholdConfig:`, debugStyle, foundry.utils.deepClone(thresholdConfig));

        const rules = (thresholdConfig.symptoms || []).map(symptom => {
            if (!symptom || !symptom.slug || typeof symptom.slug !== 'string' || symptom.slug.trim() === "") {
                console.warn(logPrefixFunc("WARN") + ` Symptom object is invalid or has empty/invalid slug. Skipping symptom.`, warningStyle, symptom);
                return null;
            }

            const conditionSlug = symptom.slug.toLowerCase().trim();
            const conditionEntryPF2e = game.pf2e.ConditionManager.getCondition(conditionSlug); 

            if (!conditionEntryPF2e) {
                console.error(logPrefixFunc("ERROR") + ` CRITICAL_LOOKUP_FAILURE: game.pf2e.ConditionManager.getCondition('${conditionSlug}') returned null/undefined. Symptom SKIPPED.`, errorStyle);
                return null; 
            }
            
            let uuidToUse = conditionEntryPF2e.uuid; 
            if (typeof uuidToUse !== 'string' || !uuidToUse.startsWith("Compendium.") || uuidToUse.endsWith("Item.") || uuidToUse.split(".").length < 4) {
                if (conditionEntryPF2e.sourceId && typeof conditionEntryPF2e.sourceId === 'string' && conditionEntryPF2e.sourceId.startsWith("Compendium.")) {
                    uuidToUse = conditionEntryPF2e.sourceId;
                } else if (conditionEntryPF2e.compendium && conditionEntryPF2e._id) { 
                    uuidToUse = `Compendium.${conditionEntryPF2e.compendium.collection}.${conditionEntryPF2e._id}`;
                } else {
                    console.error(logPrefixFunc("ERROR") + ` CRITICAL_UUID_ISSUE: Could not determine valid UUID for '${conditionSlug}'. UUID from manager: '${conditionEntryPF2e.uuid}', sourceId: '${conditionEntryPF2e.sourceId}'. Symptom SKIPPED.`, errorStyle, conditionEntryPF2e);
                    return null;
                }
            }
            if (typeof uuidToUse !== 'string' || !uuidToUse.startsWith("Compendium.") || uuidToUse.endsWith("Item.") || uuidToUse.split(".").length < 4) {
                 console.error(logPrefixFunc("ERROR") + ` CRITICAL_UUID_ISSUE: Final uuidToUse ('${uuidToUse}') for '${conditionSlug}' is still invalid. Symptom SKIPPED.`, errorStyle);
                return null;
            }

            const grantRule = {
                key: "GrantItem",
                uuid: uuidToUse, 
                inMemoryOnly: true 
            };

            if (symptom.value !== null && symptom.value !== undefined && typeof symptom.value === 'number' && symptom.value > 0) {
                const valuedConditionsUsingBadge = ["enfeebled", "drained", "stupefied", "clumsy", "frightened", "sickened", "slowed"];
                if (valuedConditionsUsingBadge.includes(conditionSlug)) {
                    grantRule.alterations = [{ mode: "override", property: "badge-value", value: symptom.value }];
                } else {
                    console.warn(logPrefixFunc("WARN") + ` Symptom '${conditionSlug}' has value ${symptom.value} but is not in 'valuedConditionsUsingBadge' list. Alteration for 'badge-value' may not apply or be needed. Granting base condition.`, warningStyle);
                }
            }
            return grantRule;
        }).filter(rule => rule !== null); 

        if (rules.length === 0 && thresholdConfig.symptoms && thresholdConfig.symptoms.length > 0) {
            console.warn(logPrefixFunc("WARN") + ` Effect '${effectName}' built with NO valid symptom rules. Check config.`, warningStyle);
        }

        const effectData = {
            name: effectName,
            type: "effect",
            img: thresholdConfig.icon || "icons/svg/aura.svg", // *** USE CONFIGURED ICON, fallback to generic ***
            system: {
                description: { value: `<p>Effect from ${trackerName} reaching the '${thresholdConfig.name}' state.</p><p>Intended to grant: ${thresholdConfig.symptoms.map(s => `${s.slug}${s.value ? ' '+s.value : ''}`).join(', ')}.</p>` },
                rules: rules,
                duration: { value: -1, unit: "unlimited", expiry: null },
                slug: effectSlug, 
                tokenIcon: { show: true }, // This will make the effect's own icon show on the token if it's different from granted condition icons
                traits: { value: ["survival-need-effect"], rarity: "common" },
                level: { "value": 0 },
                source: { value: `${MODULE_ID} - ${trackerName}` }
            },
            flags: {
                [MODULE_ID]: {
                    [DYNAMIC_EFFECT_FLAG_MODULE_MANAGED]: true,
                    [DYNAMIC_EFFECT_FLAG_SOURCE_TRACKER_ID]: trackerId,
                    [DYNAMIC_EFFECT_FLAG_THRESHOLD_NAME]: thresholdConfig.name
                }
            }
        };
        return effectData;
    }


    // Make sure _generateEffectSlug and processActorNeedsAndEffects are also in this class
    _generateEffectSlug(trackerId, thresholdName) {
        const safeTrackerId = trackerId.replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase();
        const safeThresholdName = thresholdName.replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase();
        return `sn-${safeTrackerId}-${safeThresholdName}`;
    }
    /**
     * Manages parent effect items on the actor based on current needs.
     */
async processActorNeedsAndEffects(actor, currentNeeds, trackerConfigs) {
        const RUNDOWN_ID = foundry.utils.randomID(5);
        const actorName = actor?.name || 'UnknownActor';
        const logPrefix = `%c[${MODULE_ID} | ${RUNDOWN_ID} | ${actorName} | V2-Dynamic]`;
        const headerStyle = "color: forestgreen; font-weight: bold; border-bottom: 1px solid forestgreen;";
        const detailStyle = "color: #006400;";
        const importantStyle = "color: darkred; font-weight: bold;";
        const warningStyle = "color: sienna; font-weight: bold;";
        const errorStyle = "color: firebrick; font-weight: bold;";
        const debugStyle = "color: #555555;";

        console.log(`${logPrefix} processActorNeedsAndEffects START`, headerStyle, { 
            currentNeeds: foundry.utils.deepClone(currentNeeds), 
            trackerConfigs: foundry.utils.deepClone(trackerConfigs) 
        });

        if (!actor || typeof actor.getFlag !== 'function' || !actor.id) { 
            console.error(`${logPrefix} CRITICAL: Invalid actor. Aborting.`, errorStyle); return; 
        }
        if (!currentNeeds || typeof currentNeeds !== 'object') { 
            console.warn(`${logPrefix} WARN: Invalid currentNeeds. Aborting.`, warningStyle); return; 
        }
        if (!trackerConfigs || !Array.isArray(trackerConfigs)) { 
            console.warn(`${logPrefix} WARN: Invalid trackerConfigs. Aborting.`, warningStyle); return; 
        }
        // Actor type check done by NeedsManager

        const existingModuleEffects = actor.itemTypes.effect.filter(
            e => e.getFlag(MODULE_ID, DYNAMIC_EFFECT_FLAG_MODULE_MANAGED)
        );
        console.log(`${logPrefix} Existing module-managed effects on actor:`, detailStyle, existingModuleEffects.map(e => `${e.name} (ID: ${e.id}, Slug: ${e.system.slug})`));

        let effectIdsToRemove = [];
        let effectDataToCreateOnActor = [];

        for (const tracker of trackerConfigs) {
            const currentTrackerEffectsOnActor = existingModuleEffects.filter(
                e => e.getFlag(MODULE_ID, DYNAMIC_EFFECT_FLAG_SOURCE_TRACKER_ID) === tracker.id
            );

            if (!tracker.enabled || !tracker.thresholdEffects?.length) {
                currentTrackerEffectsOnActor.forEach(eff => {
                    if (!effectIdsToRemove.includes(eff.id)) effectIdsToRemove.push(eff.id);
                });
                console.log(`${logPrefix} Tracker '${tracker.id}' disabled/no thresholds. Marking ${currentTrackerEffectsOnActor.length} effects for removal.`, detailStyle);
                continue;
            }

            const needValue = currentNeeds[tracker.id] ?? tracker.defaultValue ?? 0;
            let activeThresholdConfig = null; 
            let bestMatch = null;
            for (const stage of tracker.thresholdEffects) {
                if (needValue >= stage.threshold) {
                    if (!bestMatch || stage.threshold > bestMatch.threshold) {
                        bestMatch = stage;
                    }
                }
            }
            activeThresholdConfig = bestMatch; 

            if (activeThresholdConfig && activeThresholdConfig.name) {
                const targetEffectSlug = this._generateEffectSlug(tracker.id, activeThresholdConfig.name);
                console.log(`${logPrefix} Tracker '${tracker.id}' (Val: ${needValue}) -> Target: '${activeThresholdConfig.name}' (Slug: ${targetEffectSlug})`, detailStyle);

                let targetEffectIsAlreadyOnActor = false;
                currentTrackerEffectsOnActor.forEach(eff => {
                    const effectItemSlug = eff.system.slug; 
                    if (effectItemSlug === targetEffectSlug) {
                        targetEffectIsAlreadyOnActor = true;
                        console.log(`${logPrefix} Effect '${eff.name}' (Slug: ${targetEffectSlug}) for tracker '${tracker.id}' should remain.`, detailStyle);
                    } else {
                        if (!effectIdsToRemove.includes(eff.id)) {
                            effectIdsToRemove.push(eff.id); 
                            console.log(`${logPrefix} Marking for removal (obsolete stage): ${eff.name} (ID: ${eff.id}) for tracker ${tracker.id}`, detailStyle);
                        }
                    }
                });


                if (!targetEffectIsAlreadyOnActor) {
                    const effectItemDataObject = this._buildDynamicEffectData(tracker.id, tracker.name, activeThresholdConfig, actorName); 
                    
                    // More robust check for valid data object before pushing
                    if (effectItemDataObject && typeof effectItemDataObject === 'object' && effectItemDataObject.name && effectItemDataObject.system) {
                        effectDataToCreateOnActor.push(effectItemDataObject);
                        console.log(`${logPrefix} Marking for ADDITION: '${effectItemDataObject.name}' (Slug: ${effectItemDataObject.system.slug}) for tracker '${tracker.id}'`, detailStyle);
                    } else {
                        console.warn(`${logPrefix} WARN: _buildDynamicEffectData returned invalid or null data for tracker '${tracker.id}', stage '${activeThresholdConfig?.name || 'Unknown Stage'}'. Effect will not be added. Returned:`, warningStyle, effectItemDataObject);
                    }
                }
            } else { 
                console.log(`${logPrefix} Tracker '${tracker.id}' (Val: ${needValue}) meets no thresholds. Marking ${currentTrackerEffectsOnActor.length} effects for removal.`, detailStyle);
                currentTrackerEffectsOnActor.forEach(eff => {
                    if (!effectIdsToRemove.includes(eff.id)) effectIdsToRemove.push(eff.id);
                });
            }
        } 

        const uniqueEffectIdsToRemove = [...new Set(effectIdsToRemove)].filter(id => typeof id === 'string' && id.length > 0); 
        if (uniqueEffectIdsToRemove.length > 0) {
            console.log(`${logPrefix} Attempting to remove ${uniqueEffectIdsToRemove.length} effects. IDs:`, importantStyle, foundry.utils.deepClone(uniqueEffectIdsToRemove));
            const idsThatStillExistOnActor = uniqueEffectIdsToRemove.filter(id => actor.items.get(id));
            if (idsThatStillExistOnActor.length > 0) {
                console.log(`${logPrefix} Filtered. Actually deleting ${idsThatStillExistOnActor.length} effects present on actor:`, importantStyle, idsThatStillExistOnActor);
                try {
                    await actor.deleteEmbeddedDocuments("Item", idsThatStillExistOnActor);
                    console.log(`${logPrefix} Submitted deletion for ${idsThatStillExistOnActor.length} effects.`, detailStyle);
                } catch (e) {
                    console.error(`${logPrefix} Error during deleteEmbeddedDocuments:`, errorStyle, e, { attemptedDeletes: idsThatStillExistOnActor });
                }
            } else {
                console.log(`${logPrefix} No effects from removal list found on actor (likely already gone).`, detailStyle);
            }
        }

     if (effectDataToCreateOnActor.length > 0) {
            // Filter out any potential undefined/null entries just in case, though the above check should prevent it.
            const validEffectDataObjects = effectDataToCreateOnActor.filter(
                data => data && typeof data === 'object' && data.system && typeof data.system.slug === 'string'
            );

            if (validEffectDataObjects.length !== effectDataToCreateOnActor.length) {
                console.warn(`${logPrefix} WARN: Some effect data objects were invalid and filtered out before creation attempt. Initial count: ${effectDataToCreateOnActor.length}, Valid count: ${validEffectDataObjects.length}`, warningStyle);
            }
            
            // Log before filtering for duplicates
            console.log(`${logPrefix} Candidate effects for creation (after filtering invalid): ${validEffectDataObjects.length}`, importantStyle, validEffectDataObjects.map(e => e.name));


            if (validEffectDataObjects.length > 0) {
                const effectsToActuallyCreate = [];
                for (const data of validEffectDataObjects) { // Iterate over valid objects
                    // Check if an effect with the same system.slug and our module flag already exists
                    if (!actor.items.some(i => i.system.slug === data.system.slug && i.getFlag(MODULE_ID, DYNAMIC_EFFECT_FLAG_MODULE_MANAGED))) {
                        effectsToActuallyCreate.push(data);
                    } else {
                        console.log(`${logPrefix} Effect '${data.name}' (slug: ${data.system.slug}) already exists on actor. Skipping creation.`, detailStyle);
                    }
                }

                if (effectsToActuallyCreate.length > 0) {
                    console.log(`${logPrefix} Attempting to create ${effectsToActuallyCreate.length} new effects:`, importantStyle, effectsToActuallyCreate.map(e => e.name));
                    try {
                        const createdItems = await actor.createEmbeddedDocuments("Item", effectsToActuallyCreate);
                        console.log(`${logPrefix} Successfully created ${createdItems.length} effects:`, detailStyle, createdItems.map(i => i.name));
                    } catch (e) {
                        console.error(`${logPrefix} Error creating new effects:`, errorStyle, e, effectsToActuallyCreate);
                    }
                } else if (validEffectDataObjects.length > 0) { // All valid items were duplicates
                    console.log(`${logPrefix} All valid effects marked for addition were already present. No new items created.`, detailStyle);
                }
            }
        } else {
             console.log(`${logPrefix} No new module effects to add this cycle.`, debugStyle);
        }
        console.log(`${logPrefix} processActorNeedsAndEffects END`, headerStyle);
    }
}