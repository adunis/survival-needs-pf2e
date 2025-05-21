// File: scripts/sheet-integration.js
import { MODULE_ID, FLAG_PREFIX, SETTINGS } from "./constants.js"; // Added SETTINGS

export class SheetIntegration {
    constructor(needsManagerInstance) {
        this.needsManager = needsManagerInstance;
        const logPrefix = `%c[${MODULE_ID} | SheetIntegration | Constructor]`;
        const constructorStyle = "color: olive; font-weight:bold;";
        const errorStyle = "color:red; font-weight:bold;";

        if (!this.needsManager || typeof this.needsManager.loadAllConfigs !== 'function') {
            console.error(`${logPrefix} CRITICAL: Invalid NeedsManager instance! SheetIntegration may not work. NeedsManager:`, errorStyle, needsManagerInstance);
            this.needsManager = null;
            return;
        }
        // console.log(`${logPrefix} Constructed successfully with NeedsManager.`, constructorStyle);
    }

    async onRenderCharacterSheet(app, html, actorData) {
        const actor = app.actor;
        const logPrefixFunc = (actorName) => `%c[${MODULE_ID} | SheetIntegration | ${actorName || 'UnknownActor'} | Render]`;
        const warningStyle = "color:orange; font-weight:bold;";
        const errorStyle = "color:red; font-weight:bold;";
        // const infoStyle = "color:cyan; font-weight:bold;";

        if (!actor || actor.type !== "character") {
            return;
        }
        if (!this.needsManager) {
            console.error(logPrefixFunc(actor?.name) + ` Exiting: NeedsManager instance is invalid.`, errorStyle);
            return;
        }
        if (!html || html.length === 0) {
            return;
        }

        this.needsManager.loadAllConfigs();

        if (!this.needsManager.trackerConfigs || !Array.isArray(this.needsManager.trackerConfigs)) {
            console.error(logPrefixFunc(actor.name) + ` CRITICAL: trackerConfigs not valid after load. Aborting. Value:`, errorStyle, this.needsManager.trackerConfigs);
            return;
        }

        const enabledTrackers = this.needsManager.trackerConfigs.filter(tc => tc.enabled === true && (tc.displayOnSheet !== false));
        
        const sheetDisplayElementQuery = `.survival-needs-display.${MODULE_ID}`;
        let sheetDisplayElement = html.find(sheetDisplayElementQuery);

        if (enabledTrackers.length === 0) {
            sheetDisplayElement.remove();
            return;
        }
        
        const actorNeedsData = this.needsManager.getActorNeeds(actor);

        const templateTrackers = enabledTrackers.map(tracker => {
            const flagDataForTracker = actorNeedsData[tracker.id];
           let currentValue;
            let flagPathForMainInput;

            if (tracker.subProperties && Array.isArray(tracker.subProperties)) {
                currentValue = flagDataForTracker?.value ?? tracker.defaultValue ?? 0;
                flagPathForMainInput = `${FLAG_PREFIX}.${tracker.id}.value`;
            } else {
                currentValue = flagDataForTracker ?? tracker.defaultValue ?? 0;
                flagPathForMainInput = `${FLAG_PREFIX}.${tracker.id}`;
            }
            
            const baseTrackerData = {
                ...tracker,
                currentValue: currentValue,
                flagPath: flagPathForMainInput,
            };

            if (tracker.isDynamicMax && tracker.id === "divineFavor") {
                baseTrackerData.currentMaxValue = flagDataForTracker?.calculatedMaxValue ?? tracker.defaultMaxValue ?? 3;
            } else if (tracker.maxValue && !tracker.isDynamicMax) {
                 baseTrackerData.displayMaxValue = tracker.maxValue;
            }

            if (tracker.subProperties && Array.isArray(tracker.subProperties)) {
                baseTrackerData.subProperties = tracker.subProperties.map(subProp => ({
                    ...subProp,
                    currentValue: flagDataForTracker?.[subProp.id] ?? subProp.defaultValue ?? 0,
                    flagPath: `${FLAG_PREFIX}.${tracker.id}.${subProp.id}`
                }));
            }


            // Calculate weekly increase for Divine Favor
            if (tracker.id === "divineFavor") {
                const updateIntervalHours = game.settings.get(MODULE_ID, SETTINGS.UPDATE_INTERVAL_HOURS);
                if (updateIntervalHours > 0) { // Avoid division by zero if interval is misconfigured
                    const intervalsPerDay = 24 / updateIntervalHours;
                    const intervalsPerWeek = intervalsPerDay * 7;
                    
                    const shrines = flagDataForTracker?.shrines ?? 
                                   (tracker.subProperties?.find(sp => sp.id === 'shrines')?.defaultValue ?? 0);
                    
                    let totalIncreasePerGameInterval = 0;

                    // Add base increase
                    if (typeof tracker.baseIncreasePerInterval === 'number') {
                        totalIncreasePerGameInterval += tracker.baseIncreasePerInterval;
                    }

                    // Add increase from shrines
                    const increasePerShrine = typeof tracker.increasePerShrinePerInterval === 'number' ? tracker.increasePerShrinePerInterval : 0;
                    if (shrines > 0) {
                        totalIncreasePerGameInterval += (increasePerShrine * shrines);
                    }
                    
                    const weeklyIncrease = totalIncreasePerGameInterval * intervalsPerWeek;
                    baseTrackerData.calculatedWeeklyIncrease = weeklyIncrease.toFixed(1); 
                } else {
                    baseTrackerData.calculatedWeeklyIncrease = "N/A"; // Or 0.0 if interval is 0
                }
            }

            return baseTrackerData;
        });

        const templateData = { moduleId: MODULE_ID, actorId: actor.id, trackers: templateTrackers };
        
        const templatePath = `modules/${MODULE_ID}/templates/needs-display.hbs`;
        let content;
        try {
            content = await renderTemplate(templatePath, templateData);
        } catch (err) {
            console.error(logPrefixFunc(actor.name) + ` ERROR rendering template '${templatePath}':`, errorStyle, err);
            return;
        }

        if (!content || content.trim().length === 0) {
            return;
        }

        sheetDisplayElement = html.find(sheetDisplayElementQuery);
        if (sheetDisplayElement.length > 0) {
            sheetDisplayElement.replaceWith(content);
        } else {
            let injectionSuccessful = false;
            const targets = [
                'aside > div.sidebar[data-tab="sidebar"] ul.saves',
                'aside > div.sidebar[data-tab="sidebar"] section.perception',
                'aside > div.sidebar[data-tab="sidebar"] header:has(h2:contains("Immunities"))',
                'aside > div.sidebar[data-tab="sidebar"]',
                'form > aside.sidebar',
                'form aside'
            ];

            for (const selector of targets) {
                const el = html.find(selector);
                if (el.length > 0) {
                    if (selector.includes('ul.saves') || selector.includes('section.perception')) {
                        el.after(content);
                    } else if (selector.includes('header:has')) {
                        el.before(content);
                    } else {
                        el.append(content);
                    }
                    injectionSuccessful = true;
                    break;
                }
            }
            if (!injectionSuccessful) {
                console.warn(logPrefixFunc(actor.name) + ` CRITICAL: Could not inject needs display. No target selector matched.`, errorStyle);
                return;
            }
        }

        const newDisplayElement = html.find(sheetDisplayElementQuery);
        if (newDisplayElement.length > 0) {
            this._bindSheetEvents(app, actor, newDisplayElement, templateTrackers);
        } else {
            console.warn(logPrefixFunc(actor.name) + ` Could not find display element after injection to bind events.`, warningStyle);
        }
    }

    _bindSheetEvents(app, actor, displayElement, templateTrackers) {
        // const logPrefixBase = `%c[${MODULE_ID} | SheetIntegration | ${actor.name} | Events]`;
        
        displayElement.find('input[type="number"].tracker-value-input:not(.tracker-subproperty-input)').off('change.survivalNeeds').on('change.survivalNeeds', async event => {
            const input = event.currentTarget;
            const trackerId = $(input).data('trackerId');
            if (!trackerId) return;
            const newValue = input.value;
            await this.needsManager.updateNeedValue(actor, trackerId, newValue);
        });

        displayElement.find('input[type="number"].tracker-subproperty-input').off('change.survivalNeeds').on('change.survivalNeeds', async event => {
            const input = event.currentTarget;
            const trackerId = $(input).data('trackerId');
            const subPropertyId = $(input).data('subpropertyId');
            if (!trackerId || !subPropertyId) return;

            const newValue = Number(input.value) || 0;
            const flagPath = `flags.${MODULE_ID}.${trackerId}.${subPropertyId}`;
            
            await actor.update({ [flagPath]: newValue });

            const mainTrackerConfig = templateTrackers.find(t => t.id === trackerId);
            if (mainTrackerConfig?.isDynamicMax || trackerId === "divineFavor") { // Re-render if dynamic max OR if it's divine favor (for weekly increase display)
                app.render(true);
            }
        });

        for (const tracker of templateTrackers) {
            if (tracker.regeneration?.byItem && tracker.regeneration.itemButtonLabel) {
                displayElement.find(`.consume-button[data-tracker-id="${tracker.id}"]`).off('click.survivalNeeds').on('click.survivalNeeds', event => {
                    event.preventDefault(); this._handleConsumeItem(actor, tracker);
                });
            }
            if (tracker.specialActions) {
                tracker.specialActions.forEach(actionConfig => {
                    if (!actionConfig || !actionConfig.actionId) return;
                    displayElement.find(`.special-action-button[data-tracker-id="${tracker.id}"][data-action-id="${actionConfig.actionId}"]`)
                        .off('click.survivalNeeds').on('click.survivalNeeds', event => {
                            event.preventDefault(); this._handleSpecialAction(actor, tracker, actionConfig);
                        });
                });
            }
        }
    }

    async _handleConsumeItem(actor, trackerConfig) {
        // const logPrefixFunc = (actorName) => `%c[${MODULE_ID} | SheetIntegration | ${actorName || 'UnknownActor'} | ConsumeItem_V1.7_StrictStd]`;
        // const detailStyle = "color: olive; font-weight:bold;";
        // const warningStyle = "color:orange; font-weight:bold;";
        // const errorStyle = "color:red; font-weight:bold;";
        // const debugStyle = "color:blue;";

        if (!actor || !trackerConfig || !trackerConfig.regeneration?.byItem) {
            return;
        }

        const itemRegenConfig = trackerConfig.regeneration;
        const itemFilter = itemRegenConfig.itemFilter || {};
        const filterTypes = (Array.isArray(itemFilter.types) && itemFilter.types.length > 0 ? itemFilter.types : ["consumable"]).map(t => t.toLowerCase().trim()).filter(Boolean);
        const nameKeywords = (Array.isArray(itemFilter.nameKeywords) ? itemFilter.nameKeywords : []).map(k => k.toLowerCase().trim()).filter(Boolean);
        
        const suitableItems = actor.items.filter(item => {
            if (!filterTypes.includes(item.type.toLowerCase())) return false;
            const quantity = item.system.quantity;
            const uses = item.system.uses;
            const hasDefinedUses = uses && typeof uses.value === 'number' && typeof uses.max === 'number';
            let isUsable = false;
            if (hasDefinedUses) {
                if (uses.value > 0) isUsable = true;
            } else if (item.type === "consumable") {
                if (quantity == null || quantity > 0) isUsable = true;
            } else {
                if (quantity === null || quantity === undefined || quantity > 0) isUsable = true;
            }
            if (!isUsable) return false;
            if (nameKeywords.length > 0) {
                if (!nameKeywords.some(keyword => item.name.toLowerCase().includes(keyword))) return false;
            }
            return true;
        });

        if (suitableItems.length === 0) { ui.notifications.warn(game.i18n.format(`${MODULE_ID}.notifications.noSuitableItem`, { actorName: actor.name, trackerName: trackerConfig.name })); return; }

        let optionsHtml = suitableItems.map(item => {
            const uses = item.system.uses;
            const hasDefinedUses = uses && typeof uses.value === 'number' && typeof uses.max === 'number';
            let usesString = hasDefinedUses ? ` (${uses.value}/${uses.max} ${uses.per || 'uses'})` : "";
            let quantityString = (!hasDefinedUses && item.system.quantity != null) ? ` (x${item.system.quantity})` : "";
            let itemTotalBulk = 0;
            if (item.bulk?.isLight) { itemTotalBulk = item.bulk.light * 0.1; } 
            else if (item.bulk?.value) { itemTotalBulk = item.bulk.value; } 
            else if (typeof item.system.bulk?.value === 'number') { itemTotalBulk = item.system.bulk.value;} 
            else if (item.system.bulk?.light) { itemTotalBulk = item.system.bulk.light * 0.1;} 
            else if (!hasDefinedUses && (item.system.quantity === null || item.system.quantity === undefined || item.system.quantity > 0)) { itemTotalBulk = 0.1; }
            let effectiveBulkPerUse = itemTotalBulk; 
            if (hasDefinedUses && uses.max > 0) { effectiveBulkPerUse = itemTotalBulk / uses.max; }
            effectiveBulkPerUse = Math.max(0.01, Number(effectiveBulkPerUse.toFixed(3))); 
            return `<option value="${item.id}" data-effective-bulk="${effectiveBulkPerUse}" data-has-uses="${hasDefinedUses}">${item.name}${usesString}${quantityString}</option>`;
        }).join("");

        const itemDialogContent = `<form><p>${game.i18n.format(`${MODULE_ID}.dialogs.consumeItem.prompt`, { trackerName: trackerConfig.name })}</p><div class="form-group"><label for="${MODULE_ID}-item-select">${game.i18n.localize("SURVIVAL_NEEDS.dialogs.selectItemLabel")}:</label><select name="itemId" id="${MODULE_ID}-item-select" style="width: 100%; margin-top: 5px;">${optionsHtml}</select></div></form>`;

        new Dialog({
            title: itemRegenConfig.itemButtonLabel || game.i18n.format(`${MODULE_ID}.dialogs.consumeItem.title`, { trackerName: trackerConfig.name }),
            content: itemDialogContent,
            buttons: {
                next: { 
                    icon: '<i class="fas fa-arrow-right"></i>', label: game.i18n.localize("SURVIVAL_NEEDS.buttons.next"),
                    callback: async (html) => {
                        const selectedOption = html.find('select[name="itemId"] option:selected');
                        const itemId = selectedOption.val();
                        const itemEffectiveBulk = parseFloat(selectedOption.data('effective-bulk')); 
                        const itemHasUses = String(selectedOption.data('has-uses')) === 'true';

                        if (!itemId) return;
                        const itemToConsume = actor.items.get(itemId);
                        if (!itemToConsume) { ui.notifications.error(game.i18n.localize(`${MODULE_ID}.notifications.itemNotFound`)); return; }

                        const itemNameLower = itemToConsume.name.toLowerCase();
                        const itemSlug = itemToConsume.system.slug?.toLowerCase() || ""; 
                        const standardRationSlugs = ["rations", "ration"];
                        const standardWaterskinSlugs = ["waterskin", "canteen"];
                        let isStrictlyStandardItem = false;
                        let consumptionDataDefaults = {};

                        if (trackerConfig.id === 'hunger' && standardRationSlugs.includes(itemSlug)) {
                            isStrictlyStandardItem = true;
                            consumptionDataDefaults = { taste: "boring", caloricType: "medium" };
                        } else if (trackerConfig.id === 'thirst' && standardWaterskinSlugs.includes(itemSlug)) {
                            isStrictlyStandardItem = true;
                            consumptionDataDefaults = { drinkQuality: "average", isAlcoholic: false, isPotion: false, drinkCaloric: "none" };
                        }
                        if (!isStrictlyStandardItem) {
                            if (trackerConfig.id === 'hunger' && (itemNameLower === "ration" || itemNameLower === "rations")) {
                                isStrictlyStandardItem = true;
                                consumptionDataDefaults = { taste: "boring", caloricType: "medium" };
                            } else if (trackerConfig.id === 'thirst' && (itemNameLower === "waterskin" || itemNameLower === "canteen")) {
                                isStrictlyStandardItem = true;
                                consumptionDataDefaults = { drinkQuality: "average", isAlcoholic: false, isPotion: false, drinkCaloric: "none" };
                            }
                        }
                        
                        if (isStrictlyStandardItem) {
                            const consumptionData = {
                                item: itemToConsume, itemIcon: itemToConsume.img, itemName: itemToConsume.name,
                                itemBulk: itemEffectiveBulk, originalTrackerId: trackerConfig.id,
                                baseRestoreAmount: itemRegenConfig.itemRestoreAmount, 
                                isStandard: true, hasUses: itemHasUses,
                                ...consumptionDataDefaults 
                            };
                            let consumptionSuccessful = await this._consumeOneUseOrQuantity(actor, itemToConsume, itemHasUses, `%c[${MODULE_ID} | SheetIntegration | ${actor.name} | ConsumeItemCallback]`);
                            if (consumptionSuccessful) await this.needsManager.processDetailedConsumption(actor, consumptionData);
                            else ui.notifications.warn(game.i18n.format("SURVIVAL_NEEDS.notifications.couldNotConsumeUse", {itemName: itemToConsume.name}));
                        } else {
                            this._showConsumptionDetailsDialog(actor, trackerConfig, itemToConsume, itemEffectiveBulk, itemRegenConfig, itemHasUses);
                        }
                    }
                },
                cancel: { icon: '<i class="fas fa-times-circle"></i>', label: game.i18n.localize("Cancel") }
            },
            default: "next"
        }).render(true);
    }

    async _showConsumptionDetailsDialog(actor, trackerConfig, itemToConsume, itemEffectiveBulk, itemRegenConfig, itemHasUses) {
        const isFood = trackerConfig.id === 'hunger';
        const isDrink = trackerConfig.id === 'thirst';
        
        let detailsFormHtml = `<form><p>${game.i18n.format("SURVIVAL_NEEDS.dialogs.consumeDetails.prompt", {itemName: itemToConsume.name, itemBulk: itemEffectiveBulk.toFixed(3) })}</p>`;

        if (isFood) {
            detailsFormHtml += `
                <div class="form-group">
                    <label for="caloricType">${game.i18n.localize("SURVIVAL_NEEDS.dialogs.food.caloricType")}:</label>
                    <select name="caloricType" id="caloricType">
                        <option value="low">${game.i18n.localize("SURVIVAL_NEEDS.choices.food.lowCaloric")}</option>
                        <option value="medium" selected>${game.i18n.localize("SURVIVAL_NEEDS.choices.food.mediumCaloric")}</option>
                        <option value="high">${game.i18n.localize("SURVIVAL_NEEDS.choices.food.highCaloric")}</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="taste">${game.i18n.localize("SURVIVAL_NEEDS.dialogs.food.taste")}:</label>
                    <select name="taste" id="taste">
                        <option value="boring">${game.i18n.localize("SURVIVAL_NEEDS.choices.food.boring")}</option>
                        <option value="average" selected>${game.i18n.localize("SURVIVAL_NEEDS.choices.food.average")}</option>
                        <option value="interesting">${game.i18n.localize("SURVIVAL_NEEDS.choices.food.interesting")}</option>
                    </select>
                </div>
            `;
        } else if (isDrink) {
            detailsFormHtml += `
                <div class="form-group">
                    <label for="drinkQuality">${game.i18n.localize("SURVIVAL_NEEDS.dialogs.drink.quality")}:</label>
                    <select name="drinkQuality" id="drinkQuality">
                        <option value="dirty">${game.i18n.localize("SURVIVAL_NEEDS.choices.drink.dirty")}</option>
                        <option value="average" selected>${game.i18n.localize("SURVIVAL_NEEDS.choices.drink.average")}</option>
                        <option value="purified">${game.i18n.localize("SURVIVAL_NEEDS.choices.drink.purified")}</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="drinkCaloric">${game.i18n.localize("SURVIVAL_NEEDS.dialogs.drink.caloricContent")}:</label>
                    <select name="drinkCaloric" id="drinkCaloric">
                        <option value="none" selected>${game.i18n.localize("SURVIVAL_NEEDS.choices.drink.caloricNone")}</option>
                        <option value="slight">${game.i18n.localize("SURVIVAL_NEEDS.choices.drink.caloricSlight")}</option>
                        <option value="high">${game.i18n.localize("SURVIVAL_NEEDS.choices.drink.caloricHigh")}</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="isAlcoholic">${game.i18n.localize("SURVIVAL_NEEDS.choices.drink.isAlcoholic")}:</label>
                    <input type="checkbox" name="isAlcoholic" id="isAlcoholic">
                </div>
                <div class="form-group">
                    <label for="isPotion">${game.i18n.localize("SURVIVAL_NEEDS.choices.drink.isPotion")}:</label>
                    <input type="checkbox" name="isPotion" id="isPotion">
                </div>
            `;
        }
        detailsFormHtml += `</form>`;

        new Dialog({
            title: game.i18n.format("SURVIVAL_NEEDS.dialogs.consumeDetails.title", {itemName: itemToConsume.name}),
            content: detailsFormHtml,
            buttons: {
                consume: {
                    icon: '<i class="fas fa-check-circle"></i>', label: game.i18n.localize(`${MODULE_ID}.dialogs.consumeItem.consumeButton`),
                    callback: async (html) => {
                        const consumptionData = {
                            item: itemToConsume, itemIcon: itemToConsume.img, itemName: itemToConsume.name,
                            itemBulk: itemEffectiveBulk, originalTrackerId: trackerConfig.id,
                            baseRestoreAmount: itemRegenConfig.itemRestoreAmount, isStandard: false, hasUses: itemHasUses,
                            caloricType: isFood ? html.find('select[name="caloricType"]').val() : undefined,
                            taste: isFood ? html.find('select[name="taste"]').val() : undefined,
                            drinkQuality: isDrink ? html.find('select[name="drinkQuality"]').val() : undefined,
                            isAlcoholic: isDrink ? html.find('input[name="isAlcoholic"]').is(':checked') : false,
                            isPotion: isDrink ? html.find('input[name="isPotion"]').is(':checked') : false,
                            drinkCaloric: isDrink ? html.find('select[name="drinkCaloric"]').val() : "none",
                        };
                        let consumptionSuccessful = await this._consumeOneUseOrQuantity(actor, itemToConsume, itemHasUses, `%c[${MODULE_ID} | SheetIntegration | ${actor.name} | ConsumeDetailsCallback]`);
                        if (consumptionSuccessful) await this.needsManager.processDetailedConsumption(actor, consumptionData);
                        else ui.notifications.error(game.i18n.format("SURVIVAL_NEEDS.notifications.couldNotConsumeUse", {itemName: itemToConsume.name}));
                    }
                },
                cancel: { icon: '<i class="fas fa-times-circle"></i>', label: game.i18n.localize("Cancel") }
            },
            default: "consume",
            render: (dlgHtml) => { 
                dlgHtml.addClass("survival-needs-consumption-details-dialog");
            }
        }).render(true);
    }

  async _consumeOneUseOrQuantity(actor, initialItemState, itemHasDefinedUsesSystem, logPrefixForContext) {
        const itemName = initialItemState.name;
        const itemID = initialItemState.id;
        const logCtx = `${logPrefixForContext || '%c[SurvivalNeeds|ConsumeLogic]'} | Item: ${itemName} (ID: ${itemID}, Type: ${initialItemState.type})`;
        const successStyle = "color:green;";
        const warnStyle = "color:orange;";
        const errorStyle = "color:red; font-weight:bold;";
        const detailStyle = "color:blue;";

        console.log(`${logCtx} | Starting consumption. Initial 'itemHasDefinedUsesSystem' context: ${itemHasDefinedUsesSystem}.`, detailStyle);

        let item = actor.items.get(itemID); // Get the most current version of the item from the actor
        if (!item) {
            console.error(`${logCtx} | Item not found on actor before consumption attempt. This should not happen.`, errorStyle);
            ui.notifications.error(game.i18n.format("SURVIVAL_NEEDS.notifications.itemNotFound", { itemName: itemName }));
            return false;
        }

        // --- Path 1: Preferred - Use item.consume() for "consumable" type items ---
        if (item.type === "consumable") {
            console.log(`${logCtx} | Item is 'consumable'. Attempting item.consume(). Current uses: ${item.system.uses?.value}, quantity: ${item.system.quantity}. AutoDestroy: ${item.system.uses?.autoDestroy}`, detailStyle);
            try {
                // item.consume() is expected to handle uses, quantity for stackable consumables, and autoDestroy.
                // It typically shows its own chat message.
                await item.consume(); 
                
                // Check if the item still exists after consumption
                const itemAfterConsume = actor.items.get(itemID);
                if (!itemAfterConsume) {
                    console.log(`${logCtx} | item.consume() successful. Item was deleted.`, successStyle);
                    ui.notifications.info(game.i18n.format("SURVIVAL_NEEDS.notifications.itemConsumedAndDestroyed", { itemName: itemName }));
                    return true;
                } else {
                    console.log(`${logCtx} | item.consume() processed. Item still exists. New uses: ${itemAfterConsume.system.uses?.value}, quantity: ${itemAfterConsume.system.quantity}.`, successStyle);
                    ui.notifications.info(game.i18n.format("SURVIVAL_NEEDS.notifications.itemConsumed", { itemName: itemName })); // Generic "consumed" message
                    return true;
                }
            } catch (e) {
                // item.consume() can throw errors if, for example, the item has 0 uses and 0 quantity.
                console.warn(`${logCtx} | item.consume() threw an error: ${e.message}. This might be expected if item is already depleted.`, warnStyle, e);
                // If it failed because it's depleted, report it. Otherwise, could fall through to manual if desired, but PF2e consumables should ideally work with item.consume().
                const currentItemState = actor.items.get(itemID); // Re-check state
                if (currentItemState && 
                    (currentItemState.system.uses?.value <= 0 || typeof currentItemState.system.uses?.value !== 'number') && 
                    (currentItemState.system.quantity <= 0 || typeof currentItemState.system.quantity !== 'number')) {
                    ui.notifications.warn(game.i18n.format("SURVIVAL_NEEDS.notifications.itemAlreadyEmpty", { itemName: itemName }));
                    return false; // Definitely cannot consume
                }
                // If it failed for other reasons, it's an unexpected error with item.consume()
                ui.notifications.error(game.i18n.format("SURVIVAL_NEEDS.notifications.consumeMethodError", { itemName: itemName, error: e.message }));
                return false; 
            }
        }

        // --- Path 2: Manual handling for non-"consumable" types, or as a very last resort ---
        console.log(`${logCtx} | Item is not 'consumable' (type: ${item.type}) or item.consume() was not applicable. Proceeding with manual logic.`, detailStyle);
        item = actor.items.get(itemID); // Refresh item state again, just in case
        if (!item) {
            console.log(`${logCtx} | Item was unexpectedly deleted before manual logic. Assuming consumption occurred.`, warnStyle);
            ui.notifications.info(game.i18n.format("SURVIVAL_NEEDS.notifications.itemConsumedAndDestroyed", { itemName: itemName }));
            return true;
        }

        const uses = item.system.uses;
        const currentQuantity = Number(item.system.quantity); // Ensure quantity is a number
        const hasActualUsesSystem = uses && typeof uses.value === 'number' && typeof uses.max === 'number';

        // Try to consume via "uses" if the item has them and they are > 0
        if (hasActualUsesSystem && uses.value > 0) {
            console.log(`${logCtx} | Manual: Decrementing uses. Current: ${uses.value}. AutoDestroy: ${uses.autoDestroy}.`, detailStyle);
            const newUses = uses.value - 1;
            try {
                await item.update({ "system.uses.value": newUses });
                ui.notifications.info(game.i18n.format("SURVIVAL_NEEDS.notifications.itemUseDecremented", { itemName: itemName, newUses: newUses }));
                
                const itemAfterUpdate = actor.items.get(itemID); // Get latest state
                if (!itemAfterUpdate) { // Should not happen if update was successful unless another hook deleted it
                     console.log(`${logCtx} | Manual: Item deleted during uses update.`, successStyle);
                     return true;
                }

                if (newUses <= 0) {
                    console.log(`${logCtx} | Manual: Uses are now <= 0. Checking autoDestroy.`, detailStyle);
                    if (uses.autoDestroy) {
                        await itemAfterUpdate.delete();
                        console.log(`${logCtx} | Manual: Item auto-destroyed as uses reached 0.`, successStyle);
                        ui.notifications.info(game.i18n.format("SURVIVAL_NEEDS.notifications.itemEmptyAndDestroyed", { itemName: itemName }));
                    } else {
                        console.log(`${logCtx} | Manual: Uses reached 0, but autoDestroy is false. Item remains.`, successStyle);
                        ui.notifications.info(game.i18n.format("SURVIVAL_NEEDS.notifications.itemEmptyNoAutodestroy", { itemName: itemName }));
                    }
                }
                return true;
            } catch (e) {
                console.error(`${logCtx} | Manual: Error updating item uses: ${e.message}`, errorStyle, e);
                ui.notifications.error(game.i18n.format("SURVIVAL_NEEDS.notifications.generalConsumptionError", {itemName: itemName, error: e.message}));
                return false;
            }
        } 
        // Else, try to consume via "quantity" if it has quantity > 0
        else if (typeof currentQuantity === 'number' && currentQuantity > 0) {
            console.log(`${logCtx} | Manual: Decrementing quantity. Current: ${currentQuantity}.`, detailStyle);
            const newQuantity = currentQuantity - 1;
            try {
                if (newQuantity <= 0) {
                    await item.delete();
                    console.log(`${logCtx} | Manual: Quantity reached 0. Item deleted.`, successStyle);
                    ui.notifications.info(game.i18n.format("SURVIVAL_NEEDS.notifications.itemQuantityZeroAndDestroyed", { itemName: itemName }));
                } else {
                    await item.update({ "system.quantity": newQuantity });
                    console.log(`${logCtx} | Manual: Quantity updated to ${newQuantity}.`, successStyle);
                    ui.notifications.info(game.i18n.format("SURVIVAL_NEEDS.notifications.itemQuantityDecremented", { itemName: itemName, newQuantity: newQuantity }));
                }
                return true;
            } catch (e) {
                console.error(`${logCtx} | Manual: Error updating/deleting item by quantity: ${e.message}`, errorStyle, e);
                ui.notifications.error(game.i18n.format("SURVIVAL_NEEDS.notifications.generalConsumptionError", {itemName: itemName, error: e.message}));
                return false;
            }
        }

        // If we reach here, the item couldn't be consumed by uses or quantity by manual logic
        console.warn(`${logCtx} | Manual: Item has no positive uses or quantity to consume. Uses: ${uses?.value}, Quantity: ${currentQuantity}.`, warnStyle);
        ui.notifications.warn(game.i18n.format("SURVIVAL_NEEDS.notifications.itemNotConsumedNoUsesOrQuantity", { itemName: itemName }));
        return false;
    }

    async _handleSpecialAction(actor, trackerConfig, actionConfig) {
        // const logPrefix = `%c[${MODULE_ID} | SheetIntegration | ${actor.name} | SpecialAction]`;
        // const detailStyle = "color: olive;";
        // const warningStyle = "color:orange; font-weight:bold;";

        if (actionConfig.opensChoicesDialog && actionConfig.choices?.length > 0) {
            this._showChoiceDialog(actor, trackerConfig, actionConfig);
        } else if (actionConfig.actionId === "relieve_piss" || actionConfig.actionId === "relieve_poop") {
            await this.needsManager.relieveWaste(actor, trackerConfig.id, actionConfig);
        } else if (actionConfig.actionId === "dry_off") {
            await this.needsManager.dryOff(actor, actionConfig);
        } else {
            ui.notifications.warn(`Action "${actionConfig.label}" for ${trackerConfig.name} is not yet fully implemented or misconfigured.`);
        }
    }

    async _showChoiceDialog(actor, trackerConfig, actionConfig) {
        // const logPrefix = `%c[${MODULE_ID} | SheetIntegration | ${actor.name} | ChoiceDialog]`;
        // const detailStyle = "color: olive;";
        // const warningStyle = "color:orange; font-weight:bold;";

        let dialogOptionsHtml = "";
        actionConfig.choices.forEach((choice, index) => {
            let effectDescription = "";
            if (choice.reducesBy !== undefined) {
                effectDescription = game.i18n.format("SURVIVAL_NEEDS.dialogs.choiceEffectFormat", {reducesBy: choice.reducesBy, timeMinutes: choice.timeMinutes});
            } else if (choice.triggersLongRest) {
                effectDescription = game.i18n.format("SURVIVAL_NEEDS.dialogs.choiceTriggersLongRest", {timeMinutes: choice.timeMinutes});
            } else {
                effectDescription = `(Takes ${choice.timeMinutes} min)`;
            }

            dialogOptionsHtml += `
                <div class="form-group">
                    <label for="survivalChoice-${trackerConfig.id}-${choice.id}" class="radio-label">
                        <input type="radio" name="survivalChoice" id="survivalChoice-${trackerConfig.id}-${choice.id}" value="${choice.id}" ${index === 0 ? 'checked' : ''}>
                        ${choice.label} 
                        <small>${effectDescription}</small>
                    </label>
                </div>`;
        });

        if (!dialogOptionsHtml) {
            ui.notifications.warn(game.i18n.format("SURVIVAL_NEEDS.notifications.noChoicesAvailable", {actionLabel: actionConfig.label}));
            return;
        }

        const dialogPrompt = game.i18n.format("SURVIVAL_NEEDS.dialogs.selectActivityPrompt", {actionLabel: actionConfig.label.toLowerCase(), trackerName: trackerConfig.name});

        const dialogContent = `
            <form>
                <p>${dialogPrompt}</p>
                <div class="choices-list">${dialogOptionsHtml}</div>
            </form>`;

        new Dialog({
            title: `${actionConfig.label} - ${trackerConfig.name}`,
            content: dialogContent,
            buttons: {
                select: {
                    icon: '<i class="fas fa-check-circle"></i>',
                    label: game.i18n.localize("SURVIVAL_NEEDS.buttons.performActivity"),
                    callback: async (html) => {
                        const selectedChoiceId = html.find('input[name="survivalChoice"]:checked').val();
                        if (selectedChoiceId) {
                            const choiceConfig = actionConfig.choices.find(c => c.id === selectedChoiceId);
                            if (choiceConfig) {
                                if (trackerConfig.id === "sleep") {
                                    await this.needsManager.handleRestChoice(actor, trackerConfig.id, choiceConfig);
                                } else if (trackerConfig.id === "boredom" || trackerConfig.id === "stress") {
                                    await this.needsManager.relieveBoredomOrStress(actor, trackerConfig.id, choiceConfig);
                                }
                            }
                        }
                    }
                },
                cancel: {
                    icon: '<i class="fas fa-times-circle"></i>',
                    label: game.i18n.localize("Cancel")
                }
            },
            default: "select",
            render: (dlgHtml) => { 
                dlgHtml.addClass("survival-needs-choice-dialog");
            }
        }).render(true);
    }
}